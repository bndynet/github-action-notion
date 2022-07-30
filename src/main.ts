import * as core from '@actions/core';
import { emptyDirSync } from 'fs-extra';
import { Notion } from './notion';

async function run(): Promise<void> {
  try {
    const notionToken: string = core.getInput('notion-token');
    const rootPageId: string = core.getInput('root-page-id');
    const outputDir: string = core.getInput('output-dir');
    const cleanupBefore: boolean = core.getBooleanInput('cleanupBefore');
    const outputPageCount: number =
      parseInt(core.getInput('output-page-count') || '0') || 0;

    if (!notionToken) {
      core.setFailed('"notion-token is required."');
      return;
    }

    if (!rootPageId) {
      core.setFailed('"root-page-id is required."');
      return;
    }

    if (cleanupBefore) {
      emptyDirSync(outputDir);
    }

    core.debug(new Date().toTimeString());
    const notion = new Notion(notionToken);
    await notion.outputPages(outputDir, rootPageId, outputPageCount);
    core.debug(new Date().toTimeString());

    core.setOutput('time', new Date().toTimeString());
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
  }
}

run();
