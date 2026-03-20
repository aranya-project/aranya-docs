---
layout: page
title: Release Security Controls
permalink: "/release-security-controls/"
---

# Release Security Controls

This document describes the security controls that protect the Aranya release pipeline. These controls also enforce our QA process: peer review ensures test coverage, CI runs automated tests on every PR and release, and required status checks and approvals must pass before merging. For the release process itself, see [Release Process](/release-process/).

## Implementation Checklist

All items below are tracked under [aranya#730](https://github.com/aranya-project/aranya/issues/730).

| Section | Action | Level | Repos affected |
|---|---|---|---|
| [Branch Protections](#branch-protections) | Add `release/**/*` wildcard branch protection rule | org | all |
| [Branch Protections](#branch-protections) | Enable "Require review from Code Owners" at org level | org | all |
| [CI/CD](#cicd) | Update [`release.yml`](https://github.com/aranya-project/aranya/blob/main/.github/workflows/release.yml) trigger to include `branches: release/**/*` | repo (workflow) | aranya |
| [CI/CD](#cicd) | Update [`publish.yml`](https://github.com/aranya-project/aranya/blob/main/.github/workflows/publish.yml) trigger to include `branches: release/**/*` | repo (workflow) | aranya |
| [CI/CD](#cicd) | Update [`release-plz.yml`](https://github.com/aranya-project/aranya-core/blob/main/.github/workflows/release-plz.yml) trigger to include `branches: release/**/*` | repo (workflow) | aranya-core |
| [Release Environment Protections](#release-environment-protections) | Configure `release` environment with required reviewers and deployment branch restrictions | env-level: `release` | aranya, aranya-core |
| [Release Environment Protections](#release-environment-protections) | Reference `environment: release` in release workflow jobs | repo (workflow) | aranya, aranya-core |
| [Secrets Management](#secrets-management) | Store `ARANYA_BOT_CRATESIO_CARGO_LOGIN_KEY` in `release` environment | env-level: `release` | aranya, aranya-core |


## Branch Protections

Default branch protection rules are configured at the **org level** ([aranya-project org rulesets](https://github.com/organizations/aranya-project/settings/rules)) and apply to all repos. Repo-level overrides or additional rules can be configured per repo under Settings > Rules > Rulesets.

The following branches must be protected:

- **`main`** -- used for normal product releases (major and minor versions). Protected by org-level default rules.
- **`release/**/*`** -- used for patch releases and any other releases not performed from `main`. Protected by an org-level wildcard branch protection rule.

Required branch protection settings. These are configured at the **org level** unless noted as repo-specific:

| Setting | Value | Level | Status | Notes |
|---|---|---|---|---|
| Require a pull request before merging | Enabled | org | Configured (org ruleset) | No direct pushes to protected branches |
| Required approvals | 2 | org | Configured (org ruleset) | Release PRs require at least 2 internal approvals |
| Dismiss stale pull request approvals when new commits are pushed | Enabled | org | Configured (org ruleset) | Prevents approval of outdated code |
| Require review from Code Owners | Enabled | org | Configured (org ruleset) | At least one CODEOWNERS reviewer must approve |
| Require status checks to pass before merging | Enabled | repo | Configured (per-repo rulesets) | Repo-specific: each repo has different checks; see [CI/CD](#cicd) |
| Require branches to be up to date before merging | Enabled | org | Configured (org ruleset) | Ensures PRs are rebased before merging |
| Bypass permissions | `TeamLeads` team and repo admins | org | Configured (org ruleset) | Intentional: team leads may bypass with a documented paper trail |
| Restrict force pushes | Enabled | org | Configured (org ruleset `non_fast_forward` rule) | Force pushes are prevented on all protected branches |
| Restrict deletions | Enabled | org | Configured (org ruleset) | Prevent deletion of protected branches |

Branch protections should only be bypassed by team members with elevated permissions under special documented circumstances (e.g. by team leads or admin with a documented paper trail explaining the rationale).

## Code Review

- [CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners) ([aranya](https://github.com/aranya-project/aranya/blob/main/.github/CODEOWNERS)) have been defined based on corresponding team leads and subject matter experts. Those who have reviewed sections of code or worked on that code before may additionally be considered a code owner. *(repo-level: `.github/CODEOWNERS` file in each repo)*
- Before merging PRs, review is required from at least one code owner and at least one other internal engineer. External contributor reviews do not count toward required approvals. *(enforced by branch protection settings above)*
- Security-critical changes and release PRs require approval from at least 2 team leads, code owners, or key stakeholders.
- All code must be human-reviewed before others are expected to review a PR, including any AI-generated code.

## CI/CD

CI/CD runs on `main` and all PRs/feature branches. Workflow files are **repo-level** (committed in each repo's `.github/workflows/` directory). Required status checks are also **repo-level** since each repo has different workflows and jobs.

| Repo | Workflows | Required status checks (rulesets) |
|---|---|---|
| aranya | [`.github/workflows/`](https://github.com/aranya-project/aranya/tree/main/.github/workflows) | [Rulesets settings](https://github.com/aranya-project/aranya/settings/rules) |
| aranya-core | [`.github/workflows/`](https://github.com/aranya-project/aranya-core/tree/main/.github/workflows) | [Rulesets settings](https://github.com/aranya-project/aranya-core/settings/rules) |

The release-critical workflows are [`release.yml`](https://github.com/aranya-project/aranya/blob/main/.github/workflows/release.yml) and [`publish.yml`](https://github.com/aranya-project/aranya/blob/main/.github/workflows/publish.yml) (aranya) and [`release-plz.yml`](https://github.com/aranya-project/aranya-core/blob/main/.github/workflows/release-plz.yml) (aranya-core). These handle tagging, publishing crates to crates.io, and uploading release artifacts.

Additional CI/CD policies:

- CI/CD includes security vulnerability scans, [cargo vet](https://mozilla.github.io/cargo-vet/), linting, unit tests, integration tests, formatting, etc.
- Release workflows create tags, publish crates to crates.io, and upload release artifacts. They trigger on pushes to `main` and `release/**/*` branches: [`release.yml`](https://github.com/aranya-project/aranya/blob/main/.github/workflows/release.yml) and [`publish.yml`](https://github.com/aranya-project/aranya/blob/main/.github/workflows/publish.yml) (aranya) and [`release-plz.yml`](https://github.com/aranya-project/aranya-core/blob/main/.github/workflows/release-plz.yml) (aranya-core).
- CI/CD runners are only available to users within our GitHub organization, with proper repo permissions assigned to them. External users require manual approval to run CI/CD jobs on our runners. *(org-level: [Actions settings](https://github.com/organizations/aranya-project/settings/actions) > Fork pull request workflows > Require approval for all outside collaborators)* This prevents unwanted accumulation of cost on ephemeral cloud runners and potential exploitation of self-hosted runners.
- All branch protection checks must pass before merging.

## Release Environment Protections

Release workflows ([`release.yml`](https://github.com/aranya-project/aranya/blob/main/.github/workflows/release.yml) and [`publish.yml`](https://github.com/aranya-project/aranya/blob/main/.github/workflows/publish.yml) in aranya, [`release-plz.yml`](https://github.com/aranya-project/aranya-core/blob/main/.github/workflows/release-plz.yml) in aranya-core) use a [GitHub Environment](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment) to gate access to release secrets and provide an additional approval step. Environment settings *(repo-level)*: [aranya](https://github.com/aranya-project/aranya/settings/environments), [aranya-core](https://github.com/aranya-project/aranya-core/settings/environments).

| Setting | Value | Level | Workflow files | Notes |
|---|---|---|---|---|
| Deployment branches | `main` and `release/**/*` | env-level: `release` | -- | Restricts which branches can deploy to this environment |
| Required reviewers | At least 1 team lead or release lead | env-level: `release` | -- | Human approval gate before release workflows proceed |
| Workflow `environment: release` | Referenced in release jobs | repo (workflow) | [`release.yml`](https://github.com/aranya-project/aranya/blob/main/.github/workflows/release.yml) (aranya), [`release-plz.yml`](https://github.com/aranya-project/aranya-core/blob/main/.github/workflows/release-plz.yml) (aranya-core) | Required for environment protections to take effect |

Required reviewers is a [built-in GitHub feature](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments) for environment protections. When a workflow job references an environment with required reviewers, GitHub pauses the workflow and notifies the designated reviewers. The workflow cannot proceed until a reviewer approves the deployment in the GitHub Actions UI. No third-party actions are needed.

The `release` environment is configured in both [aranya](https://github.com/aranya-project/aranya/settings/environments) and [aranya-core](https://github.com/aranya-project/aranya-core/settings/environments). The release workflow jobs in both repos reference it:

```yaml
# aranya release.yml (https://github.com/aranya-project/aranya/blob/main/.github/workflows/release.yml)
jobs:
  tag:
    environment: release
    ...
```

```yaml
# aranya-core release-plz.yml (https://github.com/aranya-project/aranya-core/blob/main/.github/workflows/release-plz.yml)
jobs:
  release-plz-release:
    environment: release
    ...
```

This prevents an attacker from modifying a workflow on an unprotected branch to trigger an unauthorized release, since the environment will block execution and deny access to secrets.

## Secrets Management

Release credentials are scoped to the `release` environment rather than stored as repo-level secrets, so unprotected branches cannot access them. GitHub does not support org-level environments ([community request](https://github.com/orgs/community/discussions/15379)), so environment-scoped secrets must be duplicated in each repo's `release` environment that needs them.

| Secret name | Scope | Workflow files | Location |
|---|---|---|---|
| `ARANYA_BOT_CRATESIO_CARGO_LOGIN_KEY` | env-level: `release` | [`release.yml`](https://github.com/aranya-project/aranya/blob/main/.github/workflows/release.yml) (aranya), [`release-plz.yml`](https://github.com/aranya-project/aranya-core/blob/main/.github/workflows/release-plz.yml) (aranya-core) | Settings > Environments > [`release`](https://github.com/aranya-project/aranya/settings/environments) > Environment secrets in each repo |

`ARANYA_BOT_CRATESIO_CARGO_LOGIN_KEY` is stored in the `release` environment in both repos ([aranya](https://github.com/aranya-project/aranya/settings/environments), [aranya-core](https://github.com/aranya-project/aranya-core/settings/environments)). The workflows reference this secret as `secrets.ARANYA_BOT_CRATESIO_CARGO_LOGIN_KEY`. Because org-level environments are not available, the secret is configured separately in each repo's `release` environment.


- The crates.io API key is rotated after each release to limit the window of exposure if a key is compromised (see [Post-Release Checklist](/release-process/#post-release-checklist)).
