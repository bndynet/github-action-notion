import { createHash } from 'crypto';
import { mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import * as path from 'path';
import { Client } from '@notionhq/client';

const IMAGE_MD = /!\[[^\]]*\]\((https?:[^)\s]+)\)/g;

/** Collect unique http(s) image URLs from markdown image syntax (not data: URIs). */
export function extractMarkdownImageUrls(markdown: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  IMAGE_MD.lastIndex = 0;
  while ((m = IMAGE_MD.exec(markdown)) !== null) {
    const u = m[1];
    if (!u.startsWith('data:')) out.push(u);
  }
  return [...new Set(out)];
}

/**
 * Basic SSRF guardrails for outbound fetches triggered by Notion-exported
 * markdown: allow only http(s), block obvious local/private targets.
 */
export function isSafeAssetUrl(urlString: string): boolean {
  let u: URL;
  try {
    u = new URL(urlString);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  const host = u.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '[::1]' ||
    host === '::1'
  ) {
    return false;
  }
  if (host.endsWith('.local')) return false;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return false;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host)) return false;
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(host)) return false;
  return true;
}

export function shouldAttachNotionAuthorization(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'amazonaws.com' || h.endsWith('.amazonaws.com')) return true;
  if (h === 'notion.so' || h.endsWith('.notion.so')) return true;
  if (h.includes('notionusercontent.com')) return true;
  if (h.includes('notion-static.com')) return true;
  return false;
}

/**
 * AWS SigV4 presigned object URLs (Notion file URLs) authenticate via query params.
 * Sending `Authorization: Bearer …` breaks the signed request and S3 often returns 400.
 */
export function isAwsSigV4PresignedUrl(urlString: string): boolean {
  let u: URL;
  try {
    u = new URL(urlString);
  } catch {
    return false;
  }
  const h = u.hostname.toLowerCase();
  if (!(h === 'amazonaws.com' || h.endsWith('.amazonaws.com'))) return false;
  return (
    /[?&]X-Amz-Signature=/i.test(u.href) || /[?&]X-Amz-Algorithm=/i.test(u.href)
  );
}

function extensionFromContentType(ct: string | null): string | null {
  if (!ct) return null;
  const main = ct.split(';')[0].trim().toLowerCase();
  const map: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/svg+xml': '.svg',
    'image/avif': '.avif',
    'image/bmp': '.bmp',
    'image/x-icon': '.ico',
    'image/vnd.microsoft.icon': '.ico',
  };
  return map[main] ?? null;
}

function extensionFromPathname(pathname: string): string {
  const base = pathname.split('/').pop() ?? '';
  const m = base.match(/\.([a-zA-Z0-9]{2,5})(?:$|[?#])/);
  if (m) return `.${m[1].toLowerCase()}`;
  return '.bin';
}

export async function fetchRemoteAsset(
  url: string,
  notionToken: string,
): Promise<{ buffer: Buffer; ext: string }> {
  const parsed = new URL(url);
  const headers: Record<string, string> = {
    'user-agent': 'github-action-notion/1.0',
  };
  if (
    !isAwsSigV4PresignedUrl(url) &&
    shouldAttachNotionAuthorization(parsed.hostname)
  ) {
    headers.Authorization = `Bearer ${notionToken}`;
    headers['Notion-Version'] = Client.defaultNotionVersion;
  }

  const res = await fetch(url, { headers, redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  const arrayBuf = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);
  const ct = res.headers.get('content-type');
  const ext =
    extensionFromContentType(ct) ?? extensionFromPathname(parsed.pathname);
  return { buffer, ext };
}

/** Rewrite only markdown image targets that appear in the replacement map. */
export function rewriteMarkdownImages(
  markdown: string,
  urlToRelative: Map<string, string>,
): string {
  if (urlToRelative.size === 0) return markdown;
  return markdown.replace(
    /!\[([^\]]*)\]\((https?:[^)\s]+)\)/g,
    (full, alt: string, url: string) => {
      const rep = urlToRelative.get(url);
      if (rep) return `![${alt}](${rep})`;
      return full;
    },
  );
}

/**
 * Build the string used in `![](...)` after an asset is saved.
 *
 * Files are still written under `assets-dir` on disk (e.g. `./static/{postBase}/{file}` for
 * Docusaurus); public URLs follow the usual static mapping from site root.
 *
 * - When `linkBase` is empty: `/{postBase}/{filename}` (root-relative, independent of `md-dir`).
 * - When `linkBase` is set (e.g. `/static/` with on-disk `./static/`): `{linkBase}/{postBase}/{filename}`.
 */
export function buildAssetMarkdownUrl(opts: {
  linkBase: string | undefined;
  /** On-disk download root (not reflected in default URLs). */
  assetsDir?: string;
  markdownFilePath?: string;
  postBase: string;
  filename: string;
  absoluteAssetFile?: string;
}): string {
  const { linkBase, postBase, filename } = opts;
  const trimmed = linkBase?.trim();
  if (!trimmed) {
    const tail = `${postBase}/${filename}`.replace(/\/+/g, '/');
    return `/${tail}`.replace(/\/+/g, '/');
  }
  const base = trimmed.replace(/[/\\]+$/, '').replace(/\\/g, '/');
  return `${base}/${postBase}/${filename}`.replace(/\\/g, '/');
}

export interface DownloadAssetsOptions {
  markdown: string;
  notionToken: string;
  /** Path of the Markdown file (passed through for API symmetry; default URLs ignore it). */
  markdownFilePath: string;
  /** Root directory for downloaded files; each post uses `join(assetsDir, postBase)`. */
  assetsDir: string;
  /** Folder name for this post (e.g. date slug without extension). */
  postBase: string;
  /**
   * When set (e.g. `/static/` alongside `assets-dir` `./static/`), image links are `{assetLinkBase}/{postBase}/{filename}`.
   * When unset, links are `/{postBase}/{filename}` (site root; matches typical `static/` mapping).
   */
  assetLinkBase?: string;
}

/**
 * Downloads markdown image targets into `assetsDir/postBase/` and returns
 * markdown with rewritten `![](...)` (default `/{postBase}/{file}` from site root, see
 * `buildAssetMarkdownUrl`).
 */
export async function downloadAndRewriteMarkdownImages(
  opts: DownloadAssetsOptions,
): Promise<string> {
  const {
    markdown,
    notionToken,
    markdownFilePath,
    assetsDir,
    postBase,
    assetLinkBase,
  } = opts;
  const urls = extractMarkdownImageUrls(markdown);
  if (urls.length === 0) return markdown;

  const absoluteAssetDir = path.join(assetsDir, postBase);
  mkdirSync(absoluteAssetDir, { recursive: true });

  const urlToRelative = new Map<string, string>();

  for (const url of urls) {
    if (!isSafeAssetUrl(url)) {
      console.warn(
        `Skipping image download for URL that failed safety checks: ${url}`,
      );
      continue;
    }
    try {
      const { buffer, ext } = await fetchRemoteAsset(url, notionToken);
      const hash = createHash('sha256').update(url).digest('hex').slice(0, 16);
      const filename = `${hash}${ext}`;
      const absoluteFile = path.resolve(path.join(absoluteAssetDir, filename));
      await writeFile(absoluteFile, buffer);
      const rel = buildAssetMarkdownUrl({
        linkBase: assetLinkBase,
        assetsDir,
        markdownFilePath,
        postBase,
        filename,
        absoluteAssetFile: absoluteFile,
      });
      urlToRelative.set(url, rel);
    } catch (err) {
      console.warn(`Failed to download image, leaving remote URL: ${url}`, err);
    }
  }

  return rewriteMarkdownImages(markdown, urlToRelative);
}
