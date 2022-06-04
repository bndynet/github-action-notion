import * as core from '@actions/core';
import { Notion } from './notion';

async function run(): Promise<void> {
  try {
    const notionToken: string = core.getInput('notionToken');
    const rootPageId: string = core.getInput('rootPageId');
    const outputDir: string = core.getInput('outputDir');

    if (!notionToken) {
      core.setFailed('"notionToken is required."');
      return;
    }

    if (!rootPageId) {
      core.setFailed('"rootPageId is required."');
      return;
    }

    core.debug(new Date().toTimeString());
    const notion = new Notion(notionToken);
    await notion.outputPages(outputDir, rootPageId);
    core.debug(new Date().toTimeString());

    core.setOutput('time', new Date().toTimeString());
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
  }
}

run();
