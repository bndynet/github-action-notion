import * as core from '@actions/core';
import { emptyDirSync } from 'fs-extra';
import { Notion } from './notion';

async function run(): Promise<void> {
  try {
    const notionToken: string = core.getInput('notion-token');
    const rootPageId: string = core.getInput('root-page-id');
    const mdDir: string = core.getInput('md-dir') || './blog/';
    const cleanupBefore: boolean = core.getBooleanInput('cleanup-before');
    const outputPageCount: number =
      parseInt(core.getInput('output-page-count') || '0') || 0;
    const downloadAssets: boolean = core.getBooleanInput('download-assets');
    const assetsDirInput = core.getInput('assets-dir').trim();
    const assetLinkBase = core.getInput('asset-link-base').trim();
    const fileExtensionRaw = (
      core.getInput('file-extension') || 'md'
    ).toLowerCase();
    const fileExtension = fileExtensionRaw === 'mdx' ? 'mdx' : 'md';

    if (!notionToken) {
      core.setFailed('"notion-token is required."');
      return;
    }

    if (!rootPageId) {
      core.setFailed('"root-page-id is required."');
      return;
    }

    if (cleanupBefore) {
      emptyDirSync(mdDir);
    }

    core.debug(new Date().toTimeString());
    const notion = new Notion(notionToken);
    await notion.outputPages(mdDir, rootPageId, outputPageCount, {
      downloadAssets,
      assetsDir: assetsDirInput || undefined,
      assetLinkBase: assetLinkBase || undefined,
      fileExtension,
    });
    core.debug(new Date().toTimeString());

    core.setOutput('time', new Date().toTimeString());
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
  }
}

run();
