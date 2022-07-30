# Sync Notion pages to posts of Jekyll pages

Example for GitHub Action:

```yml
name: Sync Notion pages to posts

on:
  schedule:
    - cron: '0 20 * * *'
    
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Generate posts
        uses: bndynet/github-action-notion@v1
        with:
          notion-token: ${{ secrets.NOTION_TOKEN}}
          root-page-id: ${{ secrets.NOTION_ROOT_PAGE_ID }}

      - name: Commit posts
        uses: EndBug/add-and-commit@v9
        with:
          add: '_posts'
          message: Sync Notion pages to posts by GitHub Actions
          committer_name: your-name
          committer_email: your-email
```

Before above action, you need to create a your integration at https://www.notion.so/my-integrations. And add the connection of your integration at your root page. 

## Publish to a distribution branch

Actions are run from GitHub repos so we will checkin the packed dist folder. 

Then run [ncc](https://github.com/zeit/ncc) and push the results:
```bash
$ npm run package
$ git add dist
$ git commit -a -m "prod dependencies"
$ git push origin releases/v1
```

Note: We recommend using the `--license` option for ncc, which will create a license file for all of the production node modules used in your project.

Your action is now published! :rocket: 

See the [versioning documentation](https://github.com/actions/toolkit/blob/master/docs/action-versioning.md)

## Validate

You can now validate the action by referencing `./` in a workflow in your repo (see [test.yml](.github/workflows/test.yml))


See the [actions tab](https://github.com/actions/typescript-action/actions) for runs of this action! :rocket:

## Usage:

After testing you can [create a v1 tag](https://github.com/actions/toolkit/blob/master/docs/action-versioning.md) to reference the stable and latest V1 action
