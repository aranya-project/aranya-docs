<!--
  Auto-generated from: docs/release-process.md
  Last updated: 2026-02-05

  This skill provides AI assistance for the Aranya release process.
  For the full release process documentation, see the source spec.
-->

---
name: release
description: Assist with the Aranya release process including version bumps, changelogs, patch releases, and documentation updates
disable-model-invocation: true
user-invocable: true
argument-hint: [release-type] [version]
allowed-tools: Read, Grep, Glob, Bash(git *), Bash(cargo *), Edit, Write, WebFetch
---

# Aranya Release Process Assistant

You are assisting with the Aranya release process. Before proceeding, read the full release process documentation:

1. Read `docs/release-process.md` in the aranya-docs repo for the complete process
2. Understand which tasks are marked as **(partially-automated)** - these are the tasks you can assist with

## Arguments

- `$0` - Release type: `major`, `minor`, `patch`, or `docs`
- `$1` - Version number (e.g., `4.2.0`) or vulnerability ID for patches (e.g., `RUSTSEC-2026-0007`)

## Release Types

### Major/Minor Release (`/release major` or `/release minor`)

For regular releases, you can assist with:
- Creating version bump PRs using `release-plz update`
- Generating changelogs and release notes
- Updating website docs to reflect changes in Aranya's design, feature set, or APIs

### Patch Release (`/release patch [vulnerability-id]`)

For security patch releases:
1. First, fetch details about the vulnerability (e.g., from RustSec advisories)
2. Assist with creating the base branch and patch release branch
3. Help cherry-pick fixes from main
4. Bump the patch version (X.Y.Z → X.Y.(Z+1), or (X+1).Y.Z if breaking)
5. Generate release notes explaining the vulnerability

Reference PRs for patch releases:
- [4.1.1](https://github.com/aranya-project/aranya/pull/705)
- [0.6.1](https://github.com/aranya-project/aranya/pull/284)

### Documentation Update (`/release docs`)

For post-release documentation tasks:
- Update C API docs landing page URLs with newly released Doxygen docs
- Update website docs to reflect changes in Aranya's design, feature set, or APIs
- Verify existing documentation links are correct

## Reference PRs

When creating release PRs, reference these examples:
- Major releases: [4.0.0](https://github.com/aranya-project/aranya/pull/618), [3.0.0](https://github.com/aranya-project/aranya/pull/512), [2.0.0](https://github.com/aranya-project/aranya/pull/465), [1.0.0](https://github.com/aranya-project/aranya/pull/389)
- Minor releases: [4.1.0](https://github.com/aranya-project/aranya/pull/679), [0.6.0](https://github.com/aranya-project/aranya/pull/276)
- Patch releases: [4.1.1](https://github.com/aranya-project/aranya/pull/705), [0.6.1](https://github.com/aranya-project/aranya/pull/284)
- CI/workflow fixes: [allow release from patch branch](https://github.com/aranya-project/aranya/pull/706)

## Important Restrictions

- **Do NOT assist with aranya-core release PRs** - Determining crate versions is complex due to transitive dependencies causing non-obvious breaking changes
- **Always require human review** - The release lead must review all AI-generated content
- **Never skip verification steps** - All automated workflows must be verified by a human

## Templates

Announcement templates are available at `skills/release/templates/announcement.md`:
- Release start announcement
- Release completion announcement
- Patch release announcement

## Workflow

1. Confirm the release type and version with the user
2. Read the relevant sections of `docs/release-process.md`
3. For the requested release type, assist with the **(partially-automated)** tasks
4. Use the announcement templates when drafting communications
5. Provide clear summaries of changes for human review
6. Do not merge PRs or create releases without explicit human approval
