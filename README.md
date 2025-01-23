# Aranya Docs

This repository contains documentation for the Aranya project [website](https://aranya-project.github.io/aranya-docs/). Specs and documentation are written in [Markdown](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax), utilizing YAML [Front Matter](https://jekyllrb.com/docs/front-matter/) and then deployed to Github Pages using [Jekyll](https://jekyllrb.com/). We used the Jekyll theme from [lanyon](https://github.com/poole/lanyon) as the basis of the site.

## Adding new pages
When you want to add a new spec or documentation page, you will create a new Markdown file in the `/docs` directory. This file will rely on [Markdown](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax) for it's styling and hierarchy and [Front Matter](https://jekyllrb.com/docs/front-matter/) to communicate it processing information to Jekyll.

The key Front Matter information that every file needs is
- `layout`: Layout tells Jekyll this is a `page` that should be included in the menu.
- `title`: Title tells Jekyll the value to use in the menu.
- `permalink`: Permalink tells Jekyll the value to use in the page slug.

```
---
layout: page
title: "document-title"
permalink: /"url-slug"/
---
```

## Deploying the site
Deploying is easy, just merge a PR to the `main` branch. The documentation repo is configured to use Github's built in branch push actions to trigger builds and deploys to GH pages. The target branch and directory can be configured in the GH Pages settings section of the repo, if you need to test a deployment. Just note however, we don't have a proper staging environment, so these deployments will go live to the production github.io site.

## Develop locally
Given the single deployment target of GitHub Pages we do not have a staging site. The best way to test your work is to use a local development server. Luckily Jekyll supplies a solution for this. You can see the install instructions here https://jekyllrb.com/docs/installation/macos/ and then you just need to run `jekyll serve -w` which will spin up a dev server on localhost.
