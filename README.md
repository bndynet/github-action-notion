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
          md-dir: ./blog/            # default; Markdown / MDX posts
          download-assets: 'true'
          assets-dir: ./static/      # typical; on-disk folder (./static or ./static/)
          asset-link-base: /static/  # typical; public URL prefix, pairs with assets-dir
          cleanup-before: 'true'     # wipe md-dir before re-export
          output-page-count: '0'     # 0 = all pages, otherwise limit

      - name: Commit posts
        uses: EndBug/add-and-commit@v9
        with:
          add: 'blog static'
          message: 'docs(blog): sync Notion pages'
```

Before running the workflow, create an integration at
<https://www.notion.so/my-integrations> and connect it to your root page.

## Inputs

| Input               | Required | Default     | Description                                            |
| ------------------- | -------- | ----------- | ------------------------------------------------------ |
| `notion-token`      | yes      | —           | Notion integration token.                              |
| `root-page-id`      | yes      | —           | The root Notion page id whose subtree is exported.     |
| `md-dir`            | no       | `./blog/`   | Directory for exported `.md` / `.mdx` posts.           |
| `assets-dir`        | no       | *(empty)*   | Root for downloaded images when `download-assets` is true; if empty, defaults to `{md-dir}/images`. |
| `asset-link-base`   | no       | *(empty)*   | With `download-assets`, public URL prefix before `/{slug}/file`. Often `/static/` when `assets-dir` is `./static/`. When empty, URLs are `/slug/file.png` from the site root. |
| `cleanup-before`    | no       | `false`     | Empty `md-dir` before exporting.                     |
| `output-page-count` | no       | `0`         | Limit number of leaf pages exported (0 = no limit).    |
| `download-assets`   | no       | `false`     | Download `![](...)` images and rewrite links (see `asset-link-base`). |
| `file-extension`    | no       | `md`        | Post file extension: `md` or `mdx`.                    |

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
npm test           # Jest: only **/*.spec.ts (notion.test.ts is npm start only)
npm start          # optional: live export smoke test (set NOTION_TOKEN in env)
npm run all        # build + lint + format + package + test
```

Avoid `NODE_TLS_REJECT_UNAUTHORIZED=0` unless you are debugging TLS in a closed environment; it triggers Node warnings and weakens HTTPS.

### Notion token on your machine (not committed)

The live script `npm start` reads **`NOTION_TOKEN`** (recommended, matches Notion docs) or **`notionToken`**.

**Option A — project `.env` (recommended)**  
Create a file named `.env` in the repo root (this name is already listed in `.gitignore`, so it will not be pushed to GitHub):

```bash
# .env
NOTION_TOKEN=secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Then run `npm start`; `dotenv` loads `.env` automatically for that script.

**Option B — shell profile (applies to every project)**  
In `~/.zshrc` or `~/.bashrc`:

```bash
export NOTION_TOKEN='secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
```

Reload the shell (`source ~/.zshrc`) or open a new terminal.

**Option C — one-off in the terminal**

```bash
export NOTION_TOKEN='secret_...'
npm start
```

Never put the real token in committed files (`README`, workflow YAML with literals, etc.). In GitHub Actions, use encrypted secrets (e.g. `secrets.NOTION_TOKEN`).

### TLS: `unable to get local issuer certificate`

If `npm start` fails with `TypeError: fetch failed` and `unable to get local issuer certificate`, Node does not trust the certificate chain used to reach the Notion API. Common causes: **corporate HTTPS proxy / SSL inspection**, or a **custom CA** not included in Node’s default store.

**Preferred fix — extra CA bundle (safe)**  
Ask IT for the root (or full chain) PEM, or export your proxy’s CA from the OS trust store. Point Node at it (absolute path is most reliable):

```bash
# in .env (gitignored) or your shell profile
NODE_EXTRA_CA_CERTS=/absolute/path/to/company-or-proxy-root.pem
NOTION_TOKEN=secret_...
```

Then run `npm start` again. See Node docs: [NODE_EXTRA_CA_CERTS](https://nodejs.org/api/cli.html#node_extra_ca_certsfile).

**Last resort (local debugging only)**  
Disabling verification weakens HTTPS and must **never** be used in CI or production:

```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 npm start
```

If image download logs `HTTP 400` for `prod-files-secure.s3.*.amazonaws.com` URLs, that was usually caused by sending a Notion `Authorization` header on top of an **already presigned** S3 URL; current releases omit that header for SigV4 presigned links so plain `fetch` matches a browser request.

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
