import { Client, LogLevel, isFullPage } from '@notionhq/client';
import type {
  BlockObjectResponse,
  PageObjectResponse,
  SearchParameters,
  SearchResponse,
} from '@notionhq/client/build/src/api-endpoints';
import { existsSync, mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import * as path from 'path';
import { NotionToMarkdown } from 'notion-to-md';
import type { MdStringObject } from 'notion-to-md/build/types';
import { downloadAndRewriteMarkdownImages } from './assets';
import { escapeMdxSpecialChars } from './markdown';

// Notion serialises a page id as 32 hex chars (no dashes) in the page URL,
// preceded by a single "-" that separates the slug from the id.
const NOTION_URL_ID_LENGTH = 32;
const NOTION_URL_ID_TRAILER_LENGTH = NOTION_URL_ID_LENGTH + 1; // includes the dash

// Default depth used when expanding a page into markdown blocks. Notion blocks
// can be deeply nested (toggles inside columns inside callouts...); 3 is a
// pragmatic default that matches the original implementation.
const DEFAULT_NESTING_DEPTH = 3;

// Default directory for exported Markdown, aligned with the Docusaurus blog
// convention (docusaurus.config.js -> blog plugin `routeBasePath`/`path`).
const DEFAULT_MD_DIR = './blog/';

type PageParent = PageObjectResponse['parent'];

export interface Page {
  id: string;
  idWithoutSeparator: string;
  createdAt: Date;
  lastUpdatedAt: Date;
  url: string;
  /** URL-safe slug derived from the Notion URL (without the trailing id). */
  pathname: string;
  children: Page[];
  title: string;
  parentId?: string;
  parentType?: PageParent['type'];
  parentIds: string[];
  /** Inherited chain of ancestor titles, used as Docusaurus tags. */
  tags: string[];
}

interface BlogPostFrontmatter {
  title: string;
  slug: string;
  date: string; // ISO YYYY-MM-DD
  tags: string[];
  notion_url: string;
}

export interface PageExportOptions {
  /** When true, download `![](...)` targets and rewrite links to paths relative to the `.md` / `.mdx` file. */
  downloadAssets?: boolean;
  /**
   * Root directory for downloaded images (`{assetsDir}/{postBase}/…`).
   * When `downloadAssets` is true and this is omitted or empty, defaults to `{mdDir}/images`.
   */
  assetsDir?: string;
  /**
   * When `downloadAssets` is true and this is non-empty, rewritten image URLs are
   * `{assetLinkBase}/{postBase}/{filename}` (e.g. `/static/` with `assets-dir` `./static/`).
   * When empty, links are `/{postBase}/{filename}` (site root; independent of `md-dir`).
   */
  assetLinkBase?: string;
  /** Output file extension (default `md`). */
  fileExtension?: 'md' | 'mdx';
}

export class Notion {
  private notionClient: Client;
  private readonly notionToken: string;
  private n2m: NotionToMarkdown;
  private notionPages: PageObjectResponse[] = [];
  private pages: Page[] = [];

  constructor(notionToken: string) {
    this.notionToken = notionToken;
    this.notionClient = new Client({
      auth: notionToken,
      logLevel: LogLevel.WARN,
    });
    this.n2m = new NotionToMarkdown({ notionClient: this.notionClient });
  }

  async getMarkdownByPageId(
    pageId: string,
    nestingDepth: number = DEFAULT_NESTING_DEPTH,
  ): Promise<string> {
    const mdblocks = await this.n2m.pageToMarkdown(pageId, nestingDepth);
    // notion-to-md (>=2.7) returns an object keyed by page identifier
    // (`parent` by default) instead of a plain string.
    const mdObject: MdStringObject = this.n2m.toMarkdownString(mdblocks);
    const rawMarkdown =
      typeof mdObject === 'string'
        ? (mdObject as string)
        : (mdObject?.parent ?? '');
    // Escape MDX-significant chars (`<`, `>`, `{`, `}`) so the output is
    // safe to commit into a Docusaurus site (which treats `.md` as MDX
    // by default).
    return escapeMdxSpecialChars(rawMarkdown);
  }

  async outputPages(
    mdDir: string,
    rootPageId: string,
    count?: number,
    exportOptions?: PageExportOptions,
  ): Promise<void> {
    await this.fetchAllPages();
    await this.buildPageTree(rootPageId);

    const baseMdDir = mdDir || DEFAULT_MD_DIR;
    if (!existsSync(baseMdDir)) {
      mkdirSync(baseMdDir, { recursive: true });
    }

    const leafPages = this.pages.filter(
      (page) => !page.children || page.children.length === 0,
    );
    const targetPages =
      count && count > 0 ? leafPages.slice(0, count) : leafPages;

    // Write files sequentially to keep notion-to-md's API usage well-behaved
    // against Notion's rate limits and to avoid swallowing async errors
    // (the original `forEach(async ...)` did neither).
    for (const page of targetPages) {
      try {
        await this.writePage(baseMdDir, page, exportOptions);
      } catch (err) {
        console.error(
          `Failed to write page "${page.title}" (${page.id}):`,
          err,
        );
      }
    }
  }

  private async fetchAllPages(): Promise<void> {
    this.notionPages = [];
    let cursor: string | undefined;
    do {
      const search = await this.searchPages(cursor);
      for (const result of search.results) {
        if (result.object === 'page' && isFullPage(result)) {
          this.notionPages.push(result);
        }
      }
      cursor =
        search.has_more && search.next_cursor ? search.next_cursor : undefined;
    } while (cursor);
  }

  private async buildPageTree(rootPageId: string): Promise<void> {
    this.pages = [];

    const knownById = new Map<string, PageObjectResponse>();
    for (const p of this.notionPages) {
      knownById.set(p.id, p);
    }

    for (const p of this.notionPages) {
      const page = this.toPage(p);
      const owningPage = await this.findOwningPage(p, knownById);
      if (owningPage) {
        page.parentId = owningPage.id;
        page.parentType = 'page_id';
      }
      this.pages.push(page);
    }

    const rootPages = this.pages.filter((p) => p.parentId === rootPageId);
    for (const rootPage of rootPages) {
      this.attachDescendants(rootPage);
    }
  }

  private async writePage(
    mdDir: string,
    page: Page,
    exportOptions?: PageExportOptions,
  ): Promise<void> {
    let markdown = await this.getMarkdownByPageId(page.id);
    if (!markdown) return;

    const slug = page.pathname || page.idWithoutSeparator;
    const dateStr = formatDate(page.createdAt);
    const postBase = `${dateStr}-${slug}`;
    const ext = exportOptions?.fileExtension === 'mdx' ? 'mdx' : 'md';
    const filename = `${postBase}.${ext}`;
    const markdownFilePath = path.join(mdDir, filename);

    if (exportOptions?.downloadAssets) {
      const trimmed = (exportOptions.assetsDir ?? '').trim();
      const assetsRoot =
        trimmed.length > 0 ? trimmed : path.join(mdDir, 'images');
      markdown = await downloadAndRewriteMarkdownImages({
        markdown,
        notionToken: this.notionToken,
        markdownFilePath,
        assetsDir: assetsRoot,
        postBase,
        assetLinkBase: exportOptions.assetLinkBase?.trim() || undefined,
      });
    }

    const frontmatter = buildFrontmatter({
      title: page.title || slug,
      slug,
      date: dateStr,
      tags: dedupe(page.tags),
      notion_url: page.url,
    });

    const body = `${frontmatter}\n[Open in Notion](${page.url})\n\n${markdown}\n`;
    await writeFile(path.join(mdDir, filename), body, {
      encoding: 'utf8',
    });
  }

  private async searchPages(startCursor?: string): Promise<SearchResponse> {
    const searchParams: SearchParameters = {
      sort: {
        timestamp: 'last_edited_time',
        direction: 'descending',
      },
      page_size: 100,
      filter: {
        property: 'object',
        value: 'page',
      },
    };
    if (startCursor) {
      searchParams.start_cursor = startCursor;
    }
    return await this.notionClient.search(searchParams);
  }

  private attachDescendants(currentPage: Page): void {
    currentPage.children = this.pages.filter(
      (page) => page.parentId === currentPage.id,
    );
    for (const child of currentPage.children) {
      child.parentIds = [currentPage.id, ...currentPage.parentIds];
      // Inherit ancestor titles as tags. We deliberately keep the parent's
      // existing tags too so deeper pages accumulate the full chain.
      child.tags = dedupe([...currentPage.tags, currentPage.title]);
      this.attachDescendants(child);
    }
  }

  /**
   * Walk the parent chain of `node` until we reach a page object. Returns
   * `null` when the node lives at the workspace or under a database/data
   * source rather than another page. Cycle-safe via `visited`.
   */
  private async findOwningPage(
    node: PageObjectResponse | BlockObjectResponse,
    knownPages: Map<string, PageObjectResponse>,
    visited: Set<string> = new Set(),
  ): Promise<PageObjectResponse | null> {
    const parent = node.parent;
    if (!parent) return null;

    switch (parent.type) {
      case 'page_id': {
        const id = parent.page_id;
        if (visited.has(id)) return null;
        visited.add(id);
        const cached = knownPages.get(id);
        if (cached) return cached;
        const fetched = await this.notionClient.pages.retrieve({ page_id: id });
        return isFullPage(fetched) ? fetched : null;
      }
      case 'block_id': {
        const id = parent.block_id;
        if (visited.has(id)) return null;
        visited.add(id);
        const block = await this.notionClient.blocks.retrieve({ block_id: id });
        if (!('parent' in block)) return null;
        return this.findOwningPage(block, knownPages, visited);
      }
      case 'workspace':
      case 'database_id':
      case 'data_source_id':
      default:
        return null;
    }
  }

  private toPage(backendPage: PageObjectResponse): Page {
    return {
      id: backendPage.id,
      idWithoutSeparator: backendPage.id.replace(/-/g, ''),
      createdAt: new Date(backendPage.created_time),
      lastUpdatedAt: new Date(backendPage.last_edited_time),
      url: backendPage.url,
      pathname: extractSlugFromUrl(backendPage.url),
      title: extractTitle(backendPage),
      parentIds: [],
      children: [],
      tags: [],
    };
  }
}

/**
 * Read the page's title from the Notion API response. Notion stores the title
 * either under a property named `title` (default databases) or under a
 * property whose `type === "title"` (custom-named title columns).
 */
function extractTitle(backendPage: PageObjectResponse): string {
  const props = backendPage.properties ?? {};
  const titleProp = Object.values(props).find(
    (p) => (p as { type?: string }).type === 'title',
  ) as { title?: { type?: string; plain_text?: string }[] } | undefined;
  const items = titleProp?.title;
  if (!Array.isArray(items)) return '';
  return items
    .filter((t) => t?.type === 'text')
    .map((t) => t.plain_text ?? '')
    .join('');
}

/**
 * Notion URLs end with `-{32-hex-id}`. Strip that trailer and decode the
 * remainder so non-ASCII titles round-trip correctly. Falls back to the raw
 * trailing path segment when the pattern doesn't match (e.g. databases).
 */
export function extractSlugFromUrl(url: string): string {
  if (!url) return '';
  const last = url.substring(url.lastIndexOf('/') + 1);
  let slug = last;
  // Match: any prefix, dash, then 32 hex chars.
  const m = last.match(/^(.*)-[0-9a-f]{32}$/i);
  if (m) {
    slug = m[1];
  } else if (last.length > NOTION_URL_ID_TRAILER_LENGTH) {
    // Fallback to the original chop-by-length behaviour.
    slug = last.substring(0, last.length - NOTION_URL_ID_TRAILER_LENGTH);
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    decoded = slug;
  }
  return decoded.toLowerCase();
}

function formatDate(d: Date): string {
  const yyyy = d.getFullYear().toString().padStart(4, '0');
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function dedupe<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

/**
 * Quote a string for safe embedding in YAML using single-quote style. Single
 * quotes inside the string are doubled per the YAML 1.2 spec, which avoids
 * the long escape table that double-quoted scalars require.
 */
export function yamlQuote(value: string): string {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Build a Docusaurus-compatible YAML frontmatter block. Each scalar is
 * single-quoted so that titles containing colons, brackets, hashes, or any
 * other YAML-significant punctuation cannot break the parser. The trailing
 * "---" line is followed by a blank line so the next markdown block starts
 * cleanly.
 */
export function buildFrontmatter(fm: BlogPostFrontmatter): string {
  const lines = [
    '---',
    `title: ${yamlQuote(fm.title)}`,
    `slug: ${yamlQuote(fm.slug)}`,
    `date: ${fm.date}`,
    `tags: [${fm.tags.map(yamlQuote).join(', ')}]`,
    `notion_url: ${yamlQuote(fm.notion_url)}`,
    '---',
    '',
  ];
  return lines.join('\n');
}
