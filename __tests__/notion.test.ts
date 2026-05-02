import { config } from 'dotenv';
import { Notion } from '../src/notion';

// Load repo-root `.env` (gitignored). Prefer NOTION_TOKEN; legacy camelCase supported.
config();

const notionToken = process.env.NOTION_TOKEN ?? '';
if (!notionToken) {
  console.error(
    'Missing Notion token. Set NOTION_TOKEN in a local `.env` file or in your shell (see README).',
  );
  process.exit(1);
}

const notion = new Notion(notionToken);

(async () => {
  const rootPageId = 'ed10e958-cb72-4f7d-b251-56b9c34e5ed8';
  await notion.outputPages('./blog/', rootPageId, 2, {
    downloadAssets: true,
    assetsDir: './static/',
    assetLinkBase: '/static/',
  });
})();
