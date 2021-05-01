import { Client, LogLevel } from '@notionhq/client';

interface Page {
  id: string;
  createdAt: Date;
  lastUpdatedAt: Date;
  url: string;
  pathname: string;
  children: Page[];
  title?: string;
  parentId?: string;
  parentType?: string;
}

// Initializing a client
const notion = new Client({
  auth: 'secret_bEkogeVKWSihKRNjqMXdTOLc3UDKkIcrIE9QNtqd1l9', //process.env.NOTION_TOKEN,
  logLevel: LogLevel.DEBUG,
});

function convert(backendPage: any): Page {
  const titles = backendPage.properties?.title?.title;
  let pagePath = backendPage.url.substring(
    backendPage.url.lastIndexOf('/') + 1,
  );
  pagePath = pagePath.substring(0, pagePath.length - 32 - 1);
  return {
    id: backendPage.id,
    createdAt: backendPage.created_time,
    lastUpdatedAt: backendPage.last_edited_time,
    url: backendPage.url,
    pathname: pagePath,
    title: titles && titles.length > 0 ? titles[0].plain_text : '',
    children: [],
  };
}

async function get(type: string, id: string, existingPages: any[]) {
  console.log(`getting ${type}: ${id}...`);
  switch (type) {
    case 'block':
      return await notion.blocks.retrieve({
        block_id: id,
      });

    case 'page':
      const page = existingPages.find((p) => p.id === id);
      if (page) {
        return Promise.resolve(page);
      } else {
        return await notion.pages.retrieve({
          page_id: id,
        });
      }

    default:
      return Promise.resolve(null);
  }
}

async function getParentPage(
  curPageOrBlock: any,
  existingPages: any[],
): Promise<any> {
  if (curPageOrBlock?.parent?.type) {
    const type = curPageOrBlock?.parent?.type.replace('_id', '');
    const parent = await get(
      type,
      curPageOrBlock.parent[curPageOrBlock.parent.type],
      existingPages,
    );
    if (parent && (parent['object'] as string) === 'page') {
      return Promise.resolve(parent);
    } else {
      return await getParentPage(parent, existingPages);
    }
  }
  return Promise.resolve(null);
}

function setChildPages(currentPage: Page, allPages: Page[]) {
  currentPage.children = allPages.filter(
    (page) => page.parentId === currentPage.id,
  );
  for (const childPage of currentPage.children) {
    setChildPages(childPage, allPages);
  }
}

async function getPages(prePaginationItem?: string) {
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
  return await notion.search(searchParams);
}

(async () => {
  let allResults: any[] = [];
  let search = await getPages();
  let results = search.results;
  allResults = allResults.concat(results);
  while (results.length === 100) {
    search = await getPages(results[99].id);
    results = search.results;
    allResults = allResults.concat(results);
  }

  console.log('Example: ', allResults[0]);
  const rootPageId = 'ed10e958-cb72-4f7d-b251-56b9c34e5ed8';

  // allResults = allResults
  //   .filter(
  //     (page: any) =>
  //       page.id === 'ed10e958-cb72-4f7d-b251-56b9c34e5ed8' ||
  //       page.id === 'e4c23177-e2ac-456f-9e32-9c14651c4786',
  //   );

  const pages: Page[] = [];
  for (const p of allResults) {
    const parent = await getParentPage(p, allResults);
    const page: Page = convert(p);
    if (parent) {
      page.parentId = parent.id;
      page.parentType = 'page';
    }
    pages.push(page);
  }

  const rootPages = pages.filter((p) => p.parentId === rootPageId);
  for (const rootPage of rootPages) {
    setChildPages(rootPage, pages);
  }
  console.log(`root pages (${rootPages.length}):`, rootPages);
  console.log('=================');
  console.log('JSON:', JSON.stringify(rootPages,  null, '\t'));
})();
