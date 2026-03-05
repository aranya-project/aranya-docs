<!--
  Auto-generated from: docs/release-process.md
  Last updated: 2026-03-04

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
2. Understand the release process tasks and their automation level

## Arguments

- `$0` - Release type: `major`, `minor`, `patch`, or `docs`
- `$1` - Version number (e.g., `5.1.0`) or vulnerability ID for patches (e.g., `RUSTSEC-2026-0007`)

## Release Types

### Major/Minor Release (`/release major` or `/release minor`)

For regular releases, you can assist with:
- Creating version bump PRs using `release-plz update`
- Generating changelogs and release notes
- Updating website docs in [aranya-project.github.io](https://github.com/aranya-project/aranya-project.github.io) to reflect changes in Aranya's design, feature set, or APIs

### Patch Release (`/release patch [vulnerability-id]`)

For security patch releases:
1. First, fetch details about the vulnerability (e.g., from RustSec advisories)
2. Assist with creating the base branch and patch release branch
3. Help cherry-pick fixes from main
4. Bump the patch version (X.Y.Z → X.Y.(Z+1), or (X+1).Y.Z if breaking)
5. Generate release notes explaining the vulnerability

### Documentation Update (`/release docs`)

For post-release documentation tasks:
- Update C API docs landing page URLs with newly released Doxygen docs in [aranya-project.github.io](https://github.com/aranya-project/aranya-project.github.io)
- Update website docs to reflect changes in Aranya's design, feature set, or APIs
- Verify existing documentation links are correct
- Check the published docs.rs website for all Aranya crates. If docs are not yet available, check the [docs.rs build queue](https://docs.rs/releases/queue).

## Release PR Guidelines

When creating release PRs, follow the "Release PR Guidelines" section in `docs/release-process.md`. Key points:

- **Title:** `release: X.Y.Z` (conventional commit format)
- **Description:** Version bump summary, headline features (major/minor), security advisory (patch), cherry-pick details (patch), prerequisite PRs (if any)
- **Files:** Only version/dependency metadata (`Cargo.toml`, `Cargo.lock`, `supply-chain/` files). No source code changes.
- **Branches:** Major/minor target `main`; patches target the `release/patch/X.Y.Z` base branch
- **CI fixes:** Use `chore:` prefix, link failing CI run, explain root cause and fix

## Important Restrictions

- **Do NOT assist with aranya-core release PRs** - Determining crate versions is complex due to transitive dependencies causing non-obvious breaking changes
- **Always require human review** - The release lead must review all content generated in support of the release
- **Never skip verification steps** - All automated workflows must be verified by a human

## Workflow

1. Confirm the release type and version with the user
2. Read the relevant sections of `docs/release-process.md`
3. For the requested release type, assist with the release tasks
4. Provide clear summaries of changes for human review
5. Do not merge PRs or create releases without explicit human approval
