---
layout: page
title: Release Security Controls
permalink: "/release-security-controls/"
---

# Release Security Controls

This document describes the security controls that protect the Aranya release pipeline. For the release process itself, see [Release Process](/release-process/).

## Outstanding TODOs

All items below are tracked under [aranya#730](https://github.com/aranya-project/aranya/issues/730).

| Section | Action | Level | Repos affected |
|---|---|---|---|
| [Branch Protections](#branch-protections) | Add `patch/**/*` wildcard branch protection rule | org | all |
| [Branch Protections](#branch-protections) | Enable "Require review from Code Owners" at org level (currently configured at repo level; `false` in org ruleset) | org | all |
| [CI/CD](#cicd) | Update [`release.yml`](https://github.com/aranya-project/aranya/blob/main/.github/workflows/release.yml) trigger to include `push: patch/**/*` | repo (workflow) | aranya |
| [CI/CD](#cicd) | Update [`publish.yml`](https://github.com/aranya-project/aranya/blob/main/.github/workflows/publish.yml) trigger to include `push: patch/**/*` | repo (workflow) | aranya |
| [CI/CD](#cicd) | Update [`release-plz.yml`](https://github.com/aranya-project/aranya-core/blob/main/.github/workflows/release-plz.yml) trigger to include `push: patch/**/*` | repo (workflow) | aranya-core |
| [Release Environment Protections](#release-environment-protections) | Create `release` environment (already exists in aranya) | env-level: `release` | aranya-core |
| [Release Environment Protections](#release-environment-protections) | Add `environment: release` to [`release.yml`](https://github.com/aranya-project/aranya/blob/main/.github/workflows/release.yml) `tag` job | repo (workflow) | aranya |
| [Release Environment Protections](#release-environment-protections) | Add `environment: release` to [`release-plz.yml`](https://github.com/aranya-project/aranya-core/blob/main/.github/workflows/release-plz.yml) `release-plz-release` job | repo (workflow) | aranya-core |
| [Secrets Management](#secrets-management) | Move `ARANYA_BOT_CRATESIO_CARGO_LOGIN_KEY` from repo-level to `release` environment | env-level: `release` | aranya, aranya-core |

## Branch Protections

Default branch protection rules are configured at the **org level** ([aranya-project org rulesets](https://github.com/organizations/aranya-project/settings/rules)) and apply to all repos. Repo-level overrides or additional rules can be configured per repo under Settings > Rules > Rulesets.

The following branches must be protected:

- **`main`** -- used for normal product releases (major and minor versions). Protected by org-level default rules.
- **`patch/**/*`** -- used for patch releases. Requires a wildcard branch protection rule at the org level. -- **TODO** ([aranya#730](https://github.com/aranya-project/aranya/issues/730))

Required branch protection settings. These should be configured at the **org level** unless noted as repo-specific:

| Setting | Value | Level | Status | Notes |
|---|---|---|---|---|
| Require a pull request before merging | Enabled | org | Configured (org ruleset) | No direct pushes to protected branches |
| Required approvals | 2 | org | Configured (org ruleset) | Release PRs require at least 2 internal approvals |
| Dismiss stale pull request approvals when new commits are pushed | Enabled | org | Configured (org ruleset) | Prevents approval of outdated code |
| Require review from Code Owners | Enabled | org | **TODO** (`false` in org ruleset; currently configured at repo level) | At least one CODEOWNERS reviewer must approve; move to org level for consistency |
| Require status checks to pass before merging | Enabled | repo | Configured (per-repo rulesets) | Repo-specific: each repo has different checks; see [CI/CD](#cicd) |
| Require branches to be up to date before merging | Enabled | org | Configured (per-repo rulesets) | Configure at org level; currently repo-specific alongside status checks |
| Bypass permissions | `TeamLeads` team and repo admins | org | Configured (org ruleset) | Intentional: team leads may bypass with a documented paper trail |
| Restrict force pushes | Enabled | org | Configured (org ruleset `non_fast_forward` rule) | No one can force push to protected branches |
| Restrict deletions | Enabled | org | Configured (org ruleset) | Prevent deletion of protected branches |

Branch protections should only be bypassed by team members with elevated permissions under special documented circumstances (e.g. by team leads or admin with a documented paper trail explaining the rationale).

## Code Review

- [CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners) ([aranya](https://github.com/aranya-project/aranya/blob/main/.github/CODEOWNERS)) have been defined based on corresponding team leads and subject matter experts. Those who have reviewed sections of code or worked on that code before may additionally be considered a code owner. *(repo-level: `.github/CODEOWNERS` file in each repo)*
- Before merging PRs, review is required from at least one code owner and at least one other internal engineer. External contributor reviews do not count toward required approvals. *(enforced by branch protection settings above)*
- Security-critical changes and release PRs require approval from at least 2 team leads, code owners, or key stakeholders.

## CI/CD

CI/CD runs on `main` and all PRs/feature branches. Workflow files are **repo-level** (committed in each repo's `.github/workflows/` directory). Required status checks are also **repo-level** since each repo has different workflows and jobs.

| Repo | Workflows | Required status checks (rulesets) |
|---|---|---|
| aranya | [`.github/workflows/`](https://github.com/aranya-project/aranya/tree/main/.github/workflows) | [Rulesets settings](https://github.com/aranya-project/aranya/settings/rules) |
| aranya-core | [`.github/workflows/`](https://github.com/aranya-project/aranya-core/tree/main/.github/workflows) | [Rulesets settings](https://github.com/aranya-project/aranya-core/settings/rules) |

The release-critical workflows are [`release.yml`](https://github.com/aranya-project/aranya/blob/main/.github/workflows/release.yml) and [`publish.yml`](https://github.com/aranya-project/aranya/blob/main/.github/workflows/publish.yml) (aranya) and [`release-plz.yml`](https://github.com/aranya-project/aranya-core/blob/main/.github/workflows/release-plz.yml) (aranya-core). These handle tagging, publishing crates to crates.io, and uploading release artifacts.

Additional CI/CD policies:

- Release workflows on `main` create tags, publish crates to crates.io, and upload release artifacts. `patch/**/*` branches should also trigger these workflows to support patch releases. **Note:** [`release.yml`](https://github.com/aranya-project/aranya/blob/main/.github/workflows/release.yml) and [`publish.yml`](https://github.com/aranya-project/aranya/blob/main/.github/workflows/publish.yml) (aranya) and [`release-plz.yml`](https://github.com/aranya-project/aranya-core/blob/main/.github/workflows/release-plz.yml) (aranya-core) currently only trigger on `push: main`. They must be updated to also trigger on `push: patch/**/*`. -- **TODO** ([aranya#730](https://github.com/aranya-project/aranya/issues/730))
- CI/CD runners are only available to users within our GitHub organization, with proper repo permissions assigned to them. External users require manual approval to run CI/CD jobs on our runners. *(org-level: [Actions settings](https://github.com/organizations/aranya-project/settings/actions) > Fork pull request workflows > Require approval for all outside collaborators)* This prevents unwanted accumulation of cost on ephemeral cloud runners and potential exploitation of self-hosted runners.
- All branch protection checks must pass before merging.

## Release Environment Protections

Release workflows ([`release.yml`](https://github.com/aranya-project/aranya/blob/main/.github/workflows/release.yml) and [`publish.yml`](https://github.com/aranya-project/aranya/blob/main/.github/workflows/publish.yml) in aranya, [`release-plz.yml`](https://github.com/aranya-project/aranya-core/blob/main/.github/workflows/release-plz.yml) in aranya-core) should use a [GitHub Environment](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment) to gate access to release secrets and provide an additional approval step. Environment settings *(repo-level)*: [aranya](https://github.com/aranya-project/aranya/settings/environments), [aranya-core](https://github.com/aranya-project/aranya-core/settings/environments).

| Setting | Value | Level | Workflow files | Status | Notes |
|---|---|---|---|---|---|
| Deployment branches | `main` and `patch/**/*` | env-level: `release` | -- | aranya: Configured; aranya-core: **TODO** | Restricts which branches can deploy to this environment |
| Required reviewers | At least 1 team lead or release manager | env-level: `release` | -- | aranya: Configured (3 reviewers); aranya-core: **TODO** | Human approval gate before release workflows proceed |
| Workflow `environment: release` | Referenced in release jobs | repo (workflow) | [`release.yml`](https://github.com/aranya-project/aranya/blob/main/.github/workflows/release.yml) (aranya), [`release-plz.yml`](https://github.com/aranya-project/aranya-core/blob/main/.github/workflows/release-plz.yml) (aranya-core) | **TODO** (neither repo references it) | Required for environment protections to take effect |

-- **TODO** ([aranya#730](https://github.com/aranya-project/aranya/issues/730)): Create the `release` environment in [aranya-core](https://github.com/aranya-project/aranya-core/settings/environments) (already exists in [aranya](https://github.com/aranya-project/aranya/settings/environments)). Then update the release workflow jobs in both repos to reference it:

```yaml
# aranya release.yml (https://github.com/aranya-project/aranya/blob/main/.github/workflows/release.yml) - add to the `tag` job
jobs:
  tag:
    environment: release
    ...
```

```yaml
# aranya-core release-plz.yml (https://github.com/aranya-project/aranya-core/blob/main/.github/workflows/release-plz.yml) - add to the release job
jobs:
  release-plz-release:
    environment: release
    ...
```

This prevents an attacker from modifying a workflow on an unprotected branch to trigger an unauthorized release, since the environment will block execution and deny access to secrets.

## Secrets Management

Release credentials must be scoped to the `release` environment rather than stored as repo-level secrets, so unprotected branches cannot access them. GitHub does not support org-level environments ([community request](https://github.com/orgs/community/discussions/15379)), so environment-scoped secrets must be duplicated in each repo's `release` environment that needs them.

| Secret name | Current scope | Target scope | Workflow files | Status | Location |
|---|---|---|---|---|---|
| `ARANYA_BOT_CRATESIO_CARGO_LOGIN_KEY` | repo-level secret | env-level: `release` | [`release.yml`](https://github.com/aranya-project/aranya/blob/main/.github/workflows/release.yml) (aranya), [`release-plz.yml`](https://github.com/aranya-project/aranya-core/blob/main/.github/workflows/release-plz.yml) (aranya-core) | **TODO** | Move from repo-level to Settings > Environments > [`release`](https://github.com/aranya-project/aranya/settings/environments) > Environment secrets in each repo |

-- **TODO** ([aranya#730](https://github.com/aranya-project/aranya/issues/730)): Move `ARANYA_BOT_CRATESIO_CARGO_LOGIN_KEY` from repo-level secrets to the `release` environment in both repos ([aranya](https://github.com/aranya-project/aranya/settings/environments), [aranya-core](https://github.com/aranya-project/aranya-core/settings/environments)). The workflows reference this secret as `secrets.ARANYA_BOT_CRATESIO_CARGO_LOGIN_KEY` -- no YAML change is needed when moving it to the environment, as long as the job specifies `environment: release`. Because org-level environments are not available, the secret must be configured separately in each repo's `release` environment.

- The crates.io API key is rotated after each release to limit the window of exposure if a key is compromised (see [Post-Release Checklist](/release-process/#post-release-checklist)).
