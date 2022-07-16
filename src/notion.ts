import { Client, LogLevel } from '@notionhq/client';
import { SearchResponse } from '@notionhq/client/build/src/api-endpoints';
import { existsSync, mkdirSync, writeFile } from 'fs';
import { NotionToMarkdown } from 'notion-to-md';

export interface Page {
  id: string;
  idWithoutSeparator: string;
  createdAt: Date;
  lastUpdatedAt: Date;
  url: string;
  pathname: string;
  children: Page[];
  title: string;
  parentId?: string;
  parentType?: string;
  parentIds?: string[];
  categories: string[];
  tags: string[];
}

const postHeader = `---
title: {{title}}
categories: [{{categories}}]
tags: [{{tags}}]
---

[{{url}}]({{url}})

`;

export class Notion {
  private notionClient: Client;
  private n2m: NotionToMarkdown;
  private notionPages: any[] = [];
  private pages: Page[] = [];

  constructor(notionToken: string) {
    this.notionClient = new Client({
      auth: notionToken,
      logLevel: LogLevel.DEBUG,
    });
    this.n2m = new NotionToMarkdown({ notionClient: this.notionClient });
  }

  async getBlocksByPageId(pageId: string): Promise<any> {
    return await this.n2m.pageToMarkdown(pageId);
  }

  async getMarkdownByPageId(
    pageId: string,
    totalPage: number,
  ): Promise<string> {
    const mdblocks = await this.n2m.pageToMarkdown(pageId, totalPage);
    return this.n2m.toMarkdownString(mdblocks);
  }

  async outputPages(
    dir: string,
    rootPageId: string,
    count?: number,
  ): Promise<void> {
    let search = await this.getPages();
    let results = search.results;
    this.notionPages = this.notionPages.concat(results);
    while (results.length === 100) {
      search = await this.getPages(results[99].id);
      results = search.results;
      this.notionPages = this.notionPages.concat(results);
    }

    for (const p of this.notionPages) {
      const parent = await this.getParentPage(p, this.notionPages);
      const page: Page = this.convertPage(p);
      if (parent) {
        page.parentId = parent.id;
        page.parentType = 'page';
      }
      this.pages.push(page);
    }

    // set the relationshp of pages
    const rootPages = this.pages.filter((p) => p.parentId === rootPageId);
    for (const rootPage of rootPages) {
      this.setChildPages(rootPage);
    }

    if (!dir) {
      dir = './_posts/';
    }
    if (!existsSync(dir)) {
      mkdirSync(dir);
    }
    let contentPages = this.pages.filter(
      (page) => !page.children || page.children.length === 0,
    );
    if (count) {
      contentPages = contentPages.splice(0, count);
    }
    contentPages.forEach(async (page) => {
      const pageContent = await this.getMarkdownByPageId(page.id, 3);
      if (pageContent) {
        const filename = `${page.createdAt.getFullYear()}-${(
          page.createdAt.getMonth() + 1
        )
          .toString()
          .padStart(2, '0')}-${page.createdAt
          .getDate()
          .toString()
          .padStart(2, '0')}-${page.pathname}.md`;

        let header = postHeader;
        Object.keys(page).forEach((key) => {
          header = header.replace(
            new RegExp(`\{\{${key}\}\}`, 'g'),
            Array.isArray((page as any)[key])
              ? (page as any)[key].toString().replace('"', '')
              : (page as any)[key],
          );
        });

        writeFile(`${dir}/${filename}`, header + pageContent, (err) => {
          console.log('============ ERROR =============');
          console.log(err);
        });
      }
    });
  }

  private async getPages(prePaginationItem?: string): Promise<SearchResponse> {
    const searchParams: any = {
      sort: {
        timestamp: 'last_edited_time',
        direction: 'ascending',
      },
      // query?: string,
      page_size: 100, // The max value is 100
      filter: {
        property: 'object',
        value: 'page',
      },
    };
    if (prePaginationItem) {
      searchParams.start_cursor = prePaginationItem;
    }
    return await this.notionClient.search(searchParams);
  }

  private setChildPages(currentPage: Page): void {
    currentPage.children = this.pages.filter(
      (page) => page.parentId === currentPage.id,
    );
    for (const childPage of currentPage.children) {
      childPage.parentIds = [currentPage.id].concat(
        currentPage.parentIds || [],
      );
      childPage.categories.push(...currentPage.categories, currentPage.title);
      childPage.tags = childPage.categories;
      this.setChildPages(childPage);
    }
  }

  private async getParentPage(
    curPageOrBlock: any,
    existingPages: any[],
  ): Promise<any> {
    if (curPageOrBlock?.parent?.type) {
      const type = curPageOrBlock?.parent?.type.replace('_id', '');
      const parent = await this.getParent(
        type,
        curPageOrBlock.parent[curPageOrBlock.parent.type],
        existingPages,
      );
      if (parent && (parent['object'] as string) === 'page') {
        return Promise.resolve(parent);
      } else {
        return await this.getParentPage(parent, existingPages);
      }
    }
    return Promise.resolve(null);
  }

  private async getParent(
    type: string,
    id: string,
    existingPages: any[],
  ): Promise<any> {
    switch (type) {
      case 'block':
        return await this.notionClient.blocks.retrieve({
          block_id: id,
        });

      case 'page':
        const page = existingPages.find((p) => p.id === id);
        if (page) {
          return Promise.resolve(page);
        } else {
          return await this.notionClient.pages.retrieve({
            page_id: id,
          });
        }

      default:
        return Promise.resolve(null);
    }
  }

  private convertPage(backendPage: any): Page {
    const titles = backendPage.properties?.title?.title;
    let pagePath = backendPage.url.substring(
      +backendPage.url.lastIndexOf('/') + 1,
    );
    pagePath = pagePath.substring(0, pagePath.length - 32 - 1);
    return {
      id: backendPage.id,
      idWithoutSeparator: backendPage.id.replace('-', ''),
      createdAt: new Date(backendPage.created_time),
      lastUpdatedAt: new Date(backendPage.last_edited_time),
      url: backendPage.url,
      pathname: (pagePath || '').toLowerCase(),
      title: titles && titles.length > 0 ? titles[0].plain_text : '',
      parentIds: [],
      children: [],
      categories: [],
      tags: [],
    };
  }
}
