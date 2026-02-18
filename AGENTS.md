# AGENTS.md

## What is this repo?

Documentation and specifications for the [Aranya](https://github.com/aranya-project/aranya) project. Published as a GitHub Pages site at <https://aranya-project.github.io/aranya-docs/>.

## Repo structure

| Path | Purpose |
|---|---|
| `docs/` | Markdown specs and guides (architecture, protocols, release process, etc.) |
| `policy-book/` | mdBook project for the Aranya Policy Language reference |
| `skills/` | AI skill definitions (e.g. `skills/release/SKILL.md`) |
| `assets/images/` | Diagrams and figures referenced by docs |
| `_config.yml` | Jekyll site configuration |

## Adding or editing pages

Pages in `docs/` use Jekyll with YAML front matter:

```yaml
---
layout: page
title: "Page Title"
permalink: "/url-slug/"
---
```

The site uses the Lanyon theme. Test locally before opening a PR.

## Linked files

When editing `docs/release-process.md`, also update `skills/release/SKILL.md` to keep the AI skill in sync with the release process. The SKILL.md mirrors the reference PRs, documentation update steps, and patch release procedures from the release process doc.

## Policy book

The policy language reference lives in `policy-book/` and uses [mdBook](https://rust-lang.github.io/mdBook/). The table of contents is in `policy-book/src/SUMMARY.md`. Mermaid diagrams are supported via `policy-book/mermaid.min.js`.

## Related repos

| Repo | Relationship |
|---|---|
| [aranya](https://github.com/aranya-project/aranya) | Main Aranya codebase (daemon, client, C API) |
| [aranya-project.github.io](https://github.com/aranya-project/aranya-project.github.io) | Public website; hosts C API Doxygen docs and getting started guides |

## Conventions

- ASCII only, no emojis in docs.
- Use `.editorconfig` settings: 4-space indentation, LF line endings, UTF-8.
- Keep docs factual and concise. Update diagrams in `assets/images/` when architecture changes.
