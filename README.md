# Sync Notion pages to Markdown for Docusaurus / Jekyll

A GitHub Action that exports your Notion pages into Markdown files compatible
with [Docusaurus](https://docusaurus.io/) blog posts (and still drop-in usable
as Jekyll `_posts`).

Highlights:

- Uses [`notion-to-md`](https://www.npmjs.com/package/notion-to-md) v3.
- Recursively walks Notion pages from a `root-page-id` and writes one
  `YYYY-MM-DD-slug.md` per page.
- Generates a YAML frontmatter that is safe for Docusaurus' MDX parser
  (`title`, `slug`, `date`, `tags`, `notion_url`).
- Escapes MDX-significant characters (`<`, `>`, `{`, `}`) in plain text while
  preserving fenced code blocks, inline code, autolinks, block math, and the
  HTML tags emitted by `notion-to-md` (`<u>`, `<details>`, `<summary>`).

## Usage

```yaml
name: Sync Notion pages

on:
  schedule:
    - cron: '0 20 * * *'
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Generate posts
        uses: bndynet/github-action-notion@v3
        with:
          notion-token: ${{ secrets.NOTION_TOKEN }}
          root-page-id: ${{ secrets.NOTION_ROOT_PAGE_ID }}
          output-dir: ./blog/        # default; use ./_posts/ for Jekyll
          cleanup-before: 'true'     # wipe output-dir before re-export
          output-page-count: '0'     # 0 = all pages, otherwise limit

      - name: Commit posts
        uses: EndBug/add-and-commit@v9
        with:
          add: 'blog'
          message: 'docs(blog): sync Notion pages'
```

Before running the workflow, create an integration at
<https://www.notion.so/my-integrations> and connect it to your root page.

## Inputs

| Input               | Required | Default     | Description                                            |
| ------------------- | -------- | ----------- | ------------------------------------------------------ |
| `notion-token`      | yes      | —           | Notion integration token.                              |
| `root-page-id`      | yes      | —           | The root Notion page id whose subtree is exported.     |
| `output-dir`        | no       | `./blog/`   | Output directory.                                      |
| `cleanup-before`    | no       | `false`     | Empty `output-dir` before exporting.                   |
| `output-page-count` | no       | `0`         | Limit number of leaf pages exported (0 = no limit).    |

## Frontmatter shape

```yaml
---
title: 'Hello World'
slug: 'hello-world'
date: 2026-04-25
tags: ['parent-title', 'grandparent-title']
notion_url: 'https://www.notion.so/Hello-World-...'
---
```

`tags` is built from the chain of ancestor page titles (parent → root). The
ordering, slug, and date are also encoded in the file name
(`YYYY-MM-DD-slug.md`) so the action plugs straight into the default
Docusaurus blog plugin.

## Local development

This project requires Node `>=24` (see `engines.node` in `package.json`) and
ships a pre-built bundle in `dist/` for use as a JavaScript GitHub Action.

```bash
nvm use 24         # or: volta install node@24 / fnm use --resolve-engines
npm ci
npm run all        # build + lint + format + package + test
```

`actions/setup-node@v4` also reads `engines.node` directly via
`node-version-file: 'package.json'`, so CI and local dev share a single
source of truth for the Node version.

The `dist/` directory is rebuilt by `npm run package` and is verified by the
`Check dist/` workflow on every PR. Commit the regenerated bundle alongside
source changes:

```bash
npm run package
git add dist
git commit -m "chore(dist): rebuild bundle"
```

See the [versioning documentation](https://github.com/actions/toolkit/blob/main/docs/action-versioning.md)
for tagging guidance.
