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

## Contributing
Before opening a PR, please test your changes locally. This ensures that formatting, links, and images have been thoroughly tested before anything goes live. See the [Develop Locally](#develop-locally) section for instructions.

Once the PR has been approved, please test again locally before merging it in. This will give you a second chance to make sure no unwanted formatting issues were introduced while addressing feedback.

## Develop Locally
We currently deploy directly to GitHub Pages, so there isn't a staging site to preview any changes. The best way to test documentation is to deploy a local server using `Jekyll`. Follow the [install instructions](https://jekyllrb.com/docs/installation/) to install Jekyll on your system, and then simply run `jekyll serve -w` which will launch a local web server on your machine.

## Deploying the site
Deploying is easy, just merge your PR to the `main` branch. The documentation repo is configured to use Github's built-in branch push actions to trigger builds and deploys to GH pages. Just note however, we don't have a proper staging environment, deployments go live to the production [https://aranya-project.github.io/aranya-docs](https://aranya-project.github.io/aranya-docs/) site.
