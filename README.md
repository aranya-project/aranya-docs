# Aranya Docs

This repository contains documentation for the Aranya project [website](https://aranya-project.github.io/aranya-docs/). Specs and documentation are written in [Markdown](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax), utilizing YAML [Front Matter](https://jekyllrb.com/docs/front-matter/) and then deployed to Github Pages using [Jekyll](https://jekyllrb.com/).

## Adding new pages
When you want to add a new spec or documentation page, you will create a new Markdown file in the `/docs` directory. This file will rely on [Markdown](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax) for it's styling and hierarchy and [Front Matter](https://jekyllrb.com/docs/front-matter/) to communicate it processing information to Jekyll.

The key Front Matter information that every file needs is
- `layout`: Layout tells Jekyll this is a `page` that should be included in the menu.
- `title`: Title tells Jekyll the value to use in the menu.
- `permalink`: Permalink tells Jekyll the value to use in the page slug.

```
---
layout: page
title: <"document-title">
permalink: </"url-slug"/>
---
```

## Deploying the site
Deploying is easy, just push to the `main` branch. The documentation repo is configured to use Github's built in branch push actions to trigger builds and deploys to GH pages. The target branch and directory can be configured in the GH Pages settings section of the repo.
