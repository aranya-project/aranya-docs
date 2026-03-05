---
layout: page
title: Release Process
permalink: "/release-process/"
---

# Release Process

## Release Overview

Major releases will generally occur on a 6-week cadence. Special releases or patch releases may also occur between major releases to include certain feature sets or address security vulnerabilities and critical bugs.

## Automation Markers

Throughout this document, tasks are marked to indicate their level of automation:

- **(manual)** - Requires human action with no automation support
- **(automated)** - Fully automated by CI/CD workflows; human action is limited to verification

## Release Security

See [Release Security Controls](/release-security-controls/) for detailed documentation of branch protections, CI/CD workflows, environment protections, and secrets management that secure the release pipeline. These controls also serve as our automated QA process: peer review ensures test coverage on PRs, CI runs automated tests on every PR and release, and required status checks and approvals must pass before merging.

## Pre-Release Checklist

### Week 1

- **(manual)** Create a planning milestone to decide which features to include in the release. Have this reviewed by product manager and engineering leadership. Provide milestone to leadership so they have visibility into the features we're targeting. (release lead)
- **(manual)** Verify that the documentation is up-to-date: crate rustdocs, the [documentation website](https://aranya-project.github.io/aranya-docs/), specs, release process docs, Doxygen docs, etc. Most docs should be updated alongside code changes, but this step catches anything that was missed. (product manager)

### Week 5

- **(manual)** Hold a meeting with relevant stakeholders (leadership, developers) to review the expected feature set and timeline. The default is to release whatever is on main, but this is the opportunity to flag exceptions (e.g., delaying to land a high-priority feature). (product manager)
- **(manual)** Distribute changelog/release notes internally before the software release is completed. (release lead)
- **(manual)** Define a PR merge order based on feature priorities and dependencies. (release lead)
- **(manual)** Communicate with team before release about merging in PRs ahead of time, especially aranya-core PRs. (release lead)
- **(manual)** Block off time on relevant developer and DevOps team member calendars to support the release. (product manager)
- **(manual)** Verify any new crates merged into the main branch have been published to crates.io. It's especially important to publish any new crates from the aranya-core repo ahead of the release because it is a dependency of the aranya repo. Regular rotation of the crates.io credential would prevent expiration-related failures; without it, the credential may expire unnoticed between releases.
- **(manual)** Verify that rustdocs build without warnings: `cargo make gen-docs-nightly`

### Week 6

The main branch should always be in a releasable state. In general, whatever is on main at the scheduled release date is what gets released. Changes to timing or feature sets are the exception, not the rule (e.g., waiting for a customer-driven feature or following up with a patch release shortly after).

- **(manual)** Hold a go/no-go meeting with leadership and relevant developers to confirm the release schedule and flag any exceptions. (release lead)

### PR Merge Deadline (2 days before release)

Any PRs the team wants to incorporate into the release should be merged at least 2 days before the scheduled release date. This ensures all intended changes land before the code freeze begins.

## Assumptions

Code merged into main (or any protected branch we plan to release from) that is not behind a feature flag is assumed to be a completed feature from the perspective of the release process. Completeness is determined by the development team during PR review, which evaluates code quality and test coverage. Incomplete or unstable features should be staged on feature branches or hidden behind feature flags (e.g., `preview` for APIs approaching stability, `experimental` for early-stage work). This allows the aranya repo to run `cargo update` to get the latest versions of all aranya-core crates without incorporating partially implemented features.

## Aranya-Core Release Process (1 day before Aranya release)

Crates in the aranya-core repo should be published to crates.io regularly as changes are available on the main branch. We don't want to tie aranya-core crate version bumps to Aranya releases, but in practice they may often happen at the same time.

### Tools

Install these tools first:

```bash
cargo install release-plz
cargo install cargo-semver-checks
```

### Aranya-Core Release Steps

A code freeze prevents new changes from landing while a release is in progress. Only release-critical fixes should be merged during a freeze. The overall release process typically takes 2 days since aranya depends on aranya-core crates published to crates.io. The aranya-core code freeze begins when the aranya-core release starts (one day before the aranya release) and ends after the aranya-core release is complete.

1. **(manual)** Communicate the code freeze to the team. (release lead)

2. **(manual)** Before releasing aranya-core, open a PR in aranya that patches aranya-core deps with the main branch of aranya-core. This verifies the changes compile/run and catches compatibility issues early.

3. **(manual)** Open a PR on aranya-core to release new versions. Look at crate diffs since last release and apply semantic versioning to each crate. `release-plz update` can help decide what version to use for each crate.

   When the aranya-crypto crate is updated, it often results in a breaking change to most of the other crates in aranya-core. release-plz is not able to set the correct version automatically. Therefore, it is often required to run `release-plz update -p <crate>` and `release-plz set-version <crate>@version` manually:

   ```bash
   release-plz update -p aranya-policy-ifgen-build --allow-dirty
   release-plz set-version aranya-policy-ifgen-build@0.6.0
   ```

4. **(manual)** Merge the aranya-core release PR into `main`.

5. **(automated)** CI automatically publishes new crates or crates with updated versions to crates.io after the release PR is merged.

6. **(manual)** Verify that the release workflow passed and that the updated crates are visible on crates.io. If release-plz indicates a crate could not be published due to an "authentication error", contact DevOps to refresh the credential and update `CARGO_REGISTRY_TOKEN` in the GitHub actions workflow.

7. **(manual)** Verify aranya builds successfully with the newly released aranya-core crates. (release lead)

## Aranya Release Process (release day)

The aranya repo contains the daemon, client libraries, and C API. Aranya releases are versioned independently from aranya-core -- all crates in the aranya repo share the same version number per semver guidelines.

### Aranya Release Steps

The aranya code freeze begins when the aranya release starts and ends after the aranya release is complete. Tasks to complete on the day of the release:

1. **(manual)** Announce to leadership, team leads, and DevOps that the release process is starting. (release lead)
   - Example: "Starting Aranya v[VERSION] release. Expected completion: [DATE]. Please hold non-essential PRs."
2. **(manual)** Open a PR to bump crate versions for the release, including the latest aranya-core dependency versions. All crates in the aranya repo are set to the same version per semver guidelines, making this straightforward to automate. Can do this a day before release or on day of release. (release lead)
3. **(manual)** Check that all CI/CD jobs have passed on the `main` branch before merging.
4. **(manual)** Merge the release PR into `main`.
5. **(automated)** Once the release PR is merged, CI/CD workflows automatically:
   - Create a new release tag based on the aranya repo crate versions
   - Upload artifacts (executables, libraries, C headers, Rust docs, Doxygen docs) to the GitHub release
   - Publish crates to crates.io
   - Publish C API Doxygen docs to the gh-pages branch
6. **(manual)** Verify that the publish.yml and release.yml workflows succeeded.
7. **(manual)** Verify that expected aranya-* crates were released on crates.io: https://crates.io/search?q=aranya
   - See [aranya/crates](https://github.com/aranya-project/aranya/tree/main/crates) for a list of crates that should have been released.
8. **(manual)** Verify that release artifacts were attached to the GitHub release.
9. **(manual)** Verify that docs.rs pages built correctly for all Aranya crates. See [aranya/crates](https://github.com/aranya-project/aranya/tree/main/crates) for a list of crates to verify. If docs are not yet available, check the [docs.rs build queue](https://docs.rs/releases/queue).
10. **(manual)** Update C API docs landing page URLs with the newly released Doxygen docs (verify existing links are correct). The landing page lives in the [aranya-project.github.io](https://github.com/aranya-project/aranya-project.github.io) repo at https://aranya-project.github.io/aranya-docs/capi/
11. **(manual)** Add release notes using GitHub's autogenerate feature. Include anything special about the release that end users should know. Release notes must be reviewed by engineering leadership before publishing. (release lead)
12. **(manual)** Have a product owner, team lead, release manager, and/or product engineer review the release: release notes, CI workflows, published docs, uploaded artifacts, and crates.io listings. (product manager)
13. **(manual)** Announce the release internally to the entire company and all leadership stakeholders. (release lead)
    - Example: "Aranya v[VERSION] released. [1-2 sentence summary]. Release notes: [LINK]"
14. **(manual)** Schedule a product release retrospective for release process improvements.

### Release PR Guidelines

Release PRs are version-bump-only PRs. All feature work must be merged before the release PR is opened. The release PR's sole purpose is to update crate versions and dependency metadata.

#### PR Title

Use the conventional commit format: `release: X.Y.Z`

Examples: `release: 5.0.0`, `release: 4.1.0`, `release: 4.1.1`

#### PR Description

All release PRs should include:

1. **Version bump summary** -- A one-line description of the version change (e.g., "Bump all workspace crate versions from 4.1.0 to 5.0.0").
2. **Prerequisite PRs** (if any) -- List any PRs that must be merged before the release PR (e.g., "Merge this PR first: #509").

Major/minor release PRs should additionally include:

3. **Headline features** -- A brief list of notable features or changes included in the release (e.g., "Release Aranya 4.0.0 including: Custom roles RBAC, AFC security enhancements").

Patch release PRs should additionally include:

4. **Security advisory reference** -- Link to the RustSec advisory, Dependabot alert, or bug report that prompted the patch (e.g., "Patch release for https://rustsec.org/advisories/RUSTSEC-2026-0007").
5. **Cherry-pick details** -- List the cherry-picked commits with their original PR references (e.g., "Cherry-picks: eccd7a0d Update `bytes` to resolve security vulnerability warning (#703)").
6. **Impact assessment** -- Brief explanation of whether the vulnerability directly affects our code or is a defensive patch for downstream consumers.

#### Expected File Changes

Release PRs should only touch version and dependency metadata files:

- `Cargo.toml` -- Workspace-level version bumps for all crates
- `Cargo.lock` -- Regenerated lockfile reflecting the version bump
- `supply-chain/*` -- Patch releases only. Normal releases handle dependency audits on the feature PRs that merge into main before the release.

Source code changes (`*.rs`) should not appear in a release PR. If they do, it likely means feature work was not merged before the release.

#### Branch Conventions

| Release Type | Head Branch | Base Branch |
|---|---|---|
| Major/Minor | `release-X.Y.Z` | `main` |
| Patch | `patch-release-X.Y.Z` | `release/patch/X.Y.Z` (the protected base branch created from the release tag being patched) |

#### CI/Workflow Fix PRs

Occasionally, release-related CI or workflow issues need to be fixed separately from the release itself. These are not versioned releases and use different conventions:

- **Title:** Use `chore:` prefix (e.g., `chore: allow release from release-4.1.0-base branch`)
- **Description:** Link the failing CI run, explain the root cause, and describe the fix
- **Files:** CI/build configuration only (e.g., `Cargo.toml` publish flags, workflow files). No version bumps.

## Post-Release Checklist

- **(manual)** Rotate the crates.io API key so it doesn't interfere with the next release. This reduces the risk of someone maliciously publishing crates with a compromised key. Rotation is performed by DevOps: generate a new token at [crates.io account settings](https://crates.io/settings/tokens), then update `ARANYA_BOT_CRATESIO_CARGO_LOGIN_KEY` in the GitHub environment secrets for both [aranya](https://github.com/aranya-project/aranya/settings/environments) and [aranya-core](https://github.com/aranya-project/aranya-core/settings/environments).

## Release Issue Template

Copy the template below into a new GitHub issue to track release progress. Replace `[VERSION]` and `[DATE]` with the appropriate values.

````markdown
# Aranya v[VERSION] Release Checklist

**Target Release Date:** [DATE]
**Release Lead:** @[USERNAME]

## Code Freeze (1 day before release)

- [ ] Communicate code freeze to the team
- [ ] Release aranya-core crates to crates.io
- [ ] Verify aranya builds with newly released aranya-core crates

## Release Day

### Pre-Merge

- [ ] Announce release process starting to leadership, team leads, and DevOps
- [ ] Open PR to bump crate versions
- [ ] Verify all CI/CD jobs pass on `main` branch
- [ ] Merge the release PR

### Post-Merge Verification

- [ ] Verify publish.yml and release.yml workflows succeeded
- [ ] Verify aranya-* crates released on [crates.io](https://crates.io/search?q=aranya)
- [ ] Verify release artifacts attached to GitHub release
- [ ] Verify docs.rs pages built correctly for all crates
- [ ] Update C API docs landing page URLs
- [ ] Add release notes to GitHub release (must be reviewed by engineering leadership before publishing)
- [ ] Have product owner/team lead review the release (release notes, CI workflows, published docs, uploaded artifacts, crates.io listings)

### Announcements

- [ ] Announce release internally to company and leadership
- [ ] Schedule release retrospective

## Post-Release

- [ ] Rotate crates.io API key
````

## Patch Releases

Patch releases address security vulnerabilities or critical bugs that cannot wait for the next major release. Even if our code doesn't directly trigger a vulnerable code path, a patch release may be warranted as a defensive measure if downstream dependencies could be impacted.

Patch releases should ideally not contain breaking API changes, though this may be unavoidable if the patch itself requires an API change. This requires backporting or cherry-picking fixes from the main branch onto the release commit being patched rather than releasing directly from main.

### Determining When to Issue a Patch Release

Common events that may prompt a patch release:

- **Security vulnerability in a dependency** -- discovered via [RustSec advisories](https://rustsec.org/advisories/), [Dependabot alerts](https://docs.github.com/en/code-security/dependabot/dependabot-alerts/about-dependabot-alerts), external contributor reports, or internal review. The vulnerability must either directly impact us or a downstream dependency. If you cannot prove that there are no downstream dependencies impacted, then a defensive patch release is required.
- **Security vulnerability in our code** -- discovered by internal developers, external contributors, security audits, or a [RustSec advisory](https://rustsec.org/advisories/) filed against one of our published crates.
- **Critical behavioral regression** -- a bug that significantly impacts functionality and cannot wait for the next scheduled release.

Once the issue is identified:

1. Patch the vulnerability or fix the bug on the main branch first.
2. Discuss with engineering leadership whether a patch release is required, considering:
   - Does our code directly use the vulnerable code path?
   - Could any downstream dependencies be impacted?
   - What is the severity of the vulnerability or regression?

### Patch Release Process

1. **(manual)** Determine the patch version X.Y.Z. Increment the patch number from the original release (e.g., 5.0.0 becomes 5.0.1). If the patch contains a breaking API change, increment the major version instead (e.g., 6.0.0). See [semver](https://semver.org/#summary) for details.

2. **(manual)** Create a base branch from the original release tag. This is the protected branch that release workflows trigger on when the patch PR is merged into it:
   ```bash
   git checkout -b release/patch/X.Y.Z v<original-version>
   git push origin release/patch/X.Y.Z
   ```

3. **(manual)** Update CI configuration to allow releases from the base branch. Modify the release workflow to permit releases from `release/patch/*`. See [this example PR](https://github.com/aranya-project/aranya/pull/706) for the specific workflow changes required.

4. **(manual)** Create a patch release branch from the base branch. This is the working branch where fixes are cherry-picked and versions are bumped:
   ```bash
   git checkout -b patch-release-X.Y.Z release/patch/X.Y.Z
   ```

5. **(manual)** Cherry-pick the fix from main:
   ```bash
   git cherry-pick <commit-hash>
   ```

6. **(manual)** Bump the version to X.Y.Z and update changelogs.

7. **(manual)** Open a PR targeting the base branch with the version bump and cherry-picked fixes. Once approved, merge the patch release branch into the base branch. **Note:** Release base branches (`release/**/*`) should be configured as protected branches. See [Release Security Controls](/release-security-controls/) for details.

8. **(manual)** Follow the [Aranya Release Steps](#aranya-release-steps) to complete the release from the base branch.

9. **(manual)** Document the release with clear notes explaining the vulnerability and why the patch was issued, even if the codebase wasn't directly affected.


## Future Improvements

The following improvements have been identified but not yet implemented:

### Process Gaps

- **Protected release branches** - Configure `release/**/*` wildcard branch protection rule at the org or repo level so patch release PRs require the same review and CI gates as releases from `main`. See [Release Security Controls](/release-security-controls/) for details and tracking under [aranya#730](https://github.com/aranya-project/aranya/issues/730).
- **Rollback procedure** - Document steps for handling failed releases, including yanking crates from crates.io, reverting tags, or issuing hotfixes.
- **Failure handling in Automated Workflow** - Document recovery steps if publish.yml or release.yml fails partway through.

### Automation Opportunities

- **Release issue template in .github repo** - Add the release checklist as a GitHub issue template in the `aranya-project/.github` repo so issues can be created directly from the template without copying from this document.
- **Automate verification tasks** - Steps 6-8 (verifying workflows succeeded, crates published, artifacts attached) could be automated with a script.
- **Calendar blocking** - Could be partially automated with a calendar integration or template invite.
- **Rustdocs warning check** - Could be automated as a CI check rather than a manual pre-release task.

### Risk Mitigation

- **Credential expiration monitoring** - Add recurring reminders or automated alerts for credential expiration instead of relying on manual calendar entries.
- **Release checklist sign-off** - Add a sign-off step where the release lead confirms all items are complete before announcing.
