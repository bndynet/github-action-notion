const { Client, LogLevel } = require('@notionhq/client');

// Initializing a client
const notion = new Client({
  auth: 'secret_bEkogeVKWSihKRNjqMXdTOLc3UDKkIcrIE9QNtqd1l9', //process.env.NOTION_TOKEN,
  logLevel: LogLevel.DEBUG,
});

(async () => {
  //   const listUsersResponse = await notion.users.list({});
  //   console.log(listUsersResponse);

  //   const pages = await notion.pages.retrieve({
  //     page_id: 'ed10e958cb724f7db25156b9c34e5ed8',
  //   });
  // console.log(pages);

  const search = await notion.search({
    sort: {
      timestamp: 'last_edited_time',
      direction: 'ascending',
    },
    // query?: string,
    // start_cursor?: string,
    page_size: 10,
    filter: {
      property: 'object',
      value: 'page',
    },
  });
  console.log(search);
  search.results.forEach((page, idx) => {
    if (idx === 0) {
        console.log(page);
    }
    const { id, created_time, url, parent } = page;
    const parentId = parent.parent_id;
    console.log(created_time);
  });
})();
