---
layout: page
title: Release Security Controls
permalink: "/release-security-controls/"
---

# Release Security Controls

This document describes the security controls that protect the Aranya release pipeline. For the release process itself, see [Release Process](/release-process/).

## Branch Protections

Default branch protection rules are configured at the **org level** ([aranya-project org rulesets](https://github.com/organizations/aranya-project/settings/rules)) and apply to all repos. Repo-level overrides or additional rules can be configured per repo under Settings > Rules > Rulesets.

The following branches must be protected:

- **`main`** -- used for normal product releases (major and minor versions). Protected by org-level default rules.
- **`patch/**/*`** -- used for patch releases. Requires a wildcard branch protection rule at the org or repo level. -- **TODO** ([aranya#730](https://github.com/aranya-project/aranya/issues/730))

Required branch protection settings (verify in org-level rulesets or repo-level branch protection rules -- either location is valid, but org-level is preferred for consistency):

| Setting | Value | Level | Status | Notes |
|---|---|---|---|---|
| Require a pull request before merging | Enabled | org or repo | Configured (org ruleset) | No direct pushes to protected branches |
| Required approvals | 2 | org or repo | Configured (org ruleset) | Release PRs require at least 2 internal approvals |
| Dismiss stale pull request approvals when new commits are pushed | Enabled | org or repo | Configured (org ruleset) | Prevents approval of outdated code |
| Require review from Code Owners | Enabled | org or repo | **TODO** (`false` in org ruleset) | At least one CODEOWNERS reviewer must approve |
| Require status checks to pass before merging | Enabled | repo | Configured (per-repo rulesets) | Specific checks differ per repo; see [CI/CD](#cicd) |
| Require branches to be up to date before merging | Enabled | repo | Configured (per-repo rulesets) | Prevents merge skew |
| Do not allow bypassing the above settings | Enabled | org or repo | Not configured (org ruleset allows bypass by `TeamLeads` team and repo admins) | Bypass should only be granted to org admins under documented circumstances |
| Restrict force pushes | Enabled (no one) | org or repo | Configured (org ruleset) | Prevent history rewriting on protected branches |
| Restrict deletions | Enabled | org or repo | Configured (org ruleset) | Prevent deletion of protected branches |

Branch protections should only be bypassed by team members with elevated permissions under special documented circumstances (e.g. by team leads or admin with a documented paper trail explaining the rationale).

## Code Review

- [CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners) ([aranya](https://github.com/aranya-project/aranya/blob/main/.github/CODEOWNERS)) have been defined based on corresponding team leads and subject matter experts. Those who have reviewed sections of code or worked on that code before may additionally be considered a code owner. *(repo-level: `.github/CODEOWNERS` file in each repo)*
- Before merging PRs, review is required from at least one code owner and at least one other internal engineer. External contributor reviews do not count toward required approvals. *(enforced by branch protection settings above)*
- Security-critical changes and release PRs require approval from at least 2 team leads, code owners, or key stakeholders.

## CI/CD

CI/CD runs on `main` and all PRs/feature branches. Workflow files are **repo-level** (committed in each repo's `.github/workflows/` directory). Required status checks are also **repo-level** since each repo has different workflows and jobs -- configure them in each repo's branch protection rules under "Require status checks to pass".

**aranya repo** ([`aranya/.github/workflows/`](https://github.com/aranya-project/aranya/tree/main/.github/workflows)):

| Workflow file | Jobs (required status checks) | Triggers |
|---|---|---|
| `build.yml` | `build-release`, `build-aranya-lib`, `build-certgen` | `push: main`, `pull_request` |
| `correctness.yml` | `fmt`, `clippy`, `machete`, `check` | `push: main`, `pull_request` |
| `tests.yml` | `unit-tests`, `c-tests`, `c-example-application`, `rust-example-application`, `rust-example-application-multi-node` | `push: main`, `pull_request` |
| `security.yml` | `security-checks` | `push: main`, `pull_request` |
| `doc.yml` | `aranya-client-capi-docs`, `aranya-rust-docs` | `push: main`, `pull_request` |
| `release.yml` | `tag`, `publish` | `push: main` (release-only; see note below) |
| `publish.yml` | `release`, `build`, `docs`, `publish-daemon`, `publish-capi-lib`, `publish-capi-docs` | Called by `release.yml` |

**aranya-core repo** ([`aranya-core/.github/workflows/`](https://github.com/aranya-project/aranya-core/tree/main/.github/workflows)):

| Workflow file | Jobs (required status checks) | Triggers |
|---|---|---|
| `build.yml` | `build-release` | `push: main`, `pull_request`, `merge_group` |
| `correctness.yml` | `fmt`, `canaries`, `clippy`, `machete`, `check` | `push: main`, `pull_request`, `merge_group` |
| `tests.yml` | `unit-tests` | `push: main`, `pull_request`, `merge_group` |
| `security.yml` | `security-checks` | `push: main`, `pull_request`, `merge_group` |
| `doc.yml` | `doc` | `push: main`, `pull_request`, `merge_group` |
| `embedded.yml` | `build-embedded` | `push: main`, `pull_request`, `merge_group` |
| `release-plz.yml` | `release-plz-release` | `push: main` (release-only; see note below) |

Additional CI/CD policies:

- Release workflows on `main` create tags, publish crates to crates.io, and upload release artifacts. `patch/**/*` branches should also trigger these workflows to support patch releases. **Note:** `release.yml` (aranya) and `release-plz.yml` (aranya-core) currently only trigger on `push: main`. They must be updated to also trigger on `push: patch/**/*`. -- **TODO** ([aranya#730](https://github.com/aranya-project/aranya/issues/730))
- CI/CD runners are only available to users within our GitHub organization, with proper repo permissions assigned to them. External users require manual approval to run CI/CD jobs on our runners. *(org-level: Settings > Actions > Fork pull request workflows > Require approval for all outside collaborators)* This prevents unwanted accumulation of cost on ephemeral cloud runners and potential exploitation of self-hosted runners.
- All branch protection checks must pass before merging.

## Release Environment Protections

Release workflows (`release.yml` and `publish.yml` in aranya, `release-plz.yml` in aranya-core) should use a [GitHub Environment](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment) to gate access to release secrets and provide an additional approval step. Configure the following in each repo under Settings > Environments *(repo-level)*:

| Setting | Value | Level | Workflow files | Status | Notes |
|---|---|---|---|---|---|
| Environment name | `release` | env-level: `release` | -- | aranya: Configured; aranya-core: **TODO** | Referenced by workflow `environment:` key |
| Deployment branches | `main` and `patch/*` | env-level: `release` | -- | aranya: Configured; aranya-core: **TODO** | Restricts which branches can deploy to this environment |
| Required reviewers | At least 1 team lead or release manager | env-level: `release` | -- | aranya: Configured (3 reviewers); aranya-core: **TODO** | Human approval gate before release workflows proceed |
| Workflow `environment: release` | Referenced in release jobs | repo (workflow) | `release.yml` (aranya), `release-plz.yml` (aranya-core) | **TODO** (neither repo references it) | Required for environment protections to take effect |

-- **TODO** ([aranya#730](https://github.com/aranya-project/aranya/issues/730)): Create the `release` environment in [aranya-core](https://github.com/aranya-project/aranya-core/settings/environments) (already exists in [aranya](https://github.com/aranya-project/aranya/settings/environments)). Then update the release workflow jobs in both repos to reference it:

```yaml
# aranya release.yml - add to the `tag` job
jobs:
  tag:
    environment: release
    ...
```

```yaml
# aranya-core release-plz.yml - add to the release job
jobs:
  release-plz-release:
    environment: release
    ...
```

This prevents an attacker from modifying a workflow on an unprotected branch to trigger an unauthorized release, since the environment will block execution and deny access to secrets.

## Secrets Management

Release credentials must be scoped to the `release` environment rather than stored as repo-level secrets, so unprotected branches cannot access them.

| Secret name | Current scope | Target scope | Workflow files | Status | Location |
|---|---|---|---|---|---|
| `ARANYA_BOT_CRATESIO_CARGO_LOGIN_KEY` | repo-level secret | env-level: `release` | `release.yml` (aranya), `release-plz.yml` (aranya-core) | **TODO** | Move to Settings > Environments > `release` > Environment secrets |

-- **TODO** ([aranya#730](https://github.com/aranya-project/aranya/issues/730)): Move `ARANYA_BOT_CRATESIO_CARGO_LOGIN_KEY` from repo-level secrets to the `release` environment in both repos. The workflows reference this secret as `secrets.ARANYA_BOT_CRATESIO_CARGO_LOGIN_KEY` -- no YAML change is needed when moving it to the environment, as long as the job specifies `environment: release`.

- The crates.io API key is rotated after each release to limit the window of exposure if a key is compromised (see [Post-Release Checklist](/release-process/#post-release-checklist)).
