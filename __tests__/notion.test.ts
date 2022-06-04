import { Notion } from '../src/notion';

const notion = new Notion(process.env.notionToken as string);

(async () => {
  const rootPageId = 'ed10e958-cb72-4f7d-b251-56b9c34e5ed8';
  await notion.outputPages('./_posts/', rootPageId, 5);
})();
