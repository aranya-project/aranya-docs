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
- **(partially-automated)** - Can be assisted by AI tools but requires human review and judgment
- **(automated)** - Fully automated by CI/CD workflows; human action is limited to verification

## Release Security

This section documents the security controls that protect the release pipeline.

### Branch Protections

- `main` is a protected branch used for normal product releases (major and minor versions).
- `patch/**/*` branches are used for patch releases and must be protected with a wildcard branch protection rule. — **TODO** ([aranya#721](https://github.com/aranya-project/aranya/issues/721))
- Release PRs (targeting `main` or `patch/**/*`) require at least 2 internal approvals.
- Branch protections should only be bypassed by team members with elevated permissions under special documented circumstances (e.g. by team leads or admin with a documented paper trail explaining the rationale).

### Code Review

- [CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners) ([aranya](https://github.com/aranya-project/aranya/blob/main/.github/CODEOWNERS)) have been defined based on corresponding team leads and subject matter experts. Those who have reviewed sections of code or worked on that code before may additionally be considered a code owner.
- Before merging PRs, review is required from at least one code owner and at least one other internal engineer. External contributor reviews do not count toward required approvals.
- Security-critical changes and release PRs require approval from at least 2 team leads, code owners, or key stakeholders.

### CI/CD

- CI/CD runs on `main` and all feature branches.
- Checks include security vulnerability scans, [cargo vet](https://mozilla.github.io/cargo-vet/) <!-- TODO: link to internal cargo vet spec when available -->, linting, unit tests, integration tests, formatting, etc.
- `main` and `patch/**/*` branches run additional publish/release workflows that create tags, publish crates to crates.io, and upload release artifacts. These workflows are not triggered on other branches.
- CI/CD runners are only available to users within our GitHub organization, with proper repo permissions assigned to them. External users require manual approval to run CI/CD jobs on our runners. This prevents unwanted accumulation of cost on ephemeral cloud runners and potential exploitation of self-hosted runners.
- Each repo must configure a set of required status checks (CI/CD jobs) that must pass before a PR can be merged.
- All branch protection checks must pass before merging.

### Release Environment Protections

- Release workflows should use a GitHub Environment with deployment branch restrictions limiting access to `main` and `patch/**/*`. — **TODO** ([aranya#722](https://github.com/aranya-project/aranya/issues/722))
- Required reviewers on the environment provide an additional approval gate before release workflows proceed. — **TODO** ([aranya#722](https://github.com/aranya-project/aranya/issues/722))
- This prevents an attacker from modifying a workflow on an unprotected branch to trigger an unauthorized release, since the environment will block execution and deny access to secrets.

### Secrets Management

- Release credentials (e.g., `CARGO_REGISTRY_TOKEN`) should be scoped to the release environment rather than stored as repo-level secrets, so unprotected branches cannot access them. — **TODO** ([aranya#722](https://github.com/aranya-project/aranya/issues/722))
- The crates.io API key is rotated after each release to limit the window of exposure if a key is compromised (see [Post-Release Checklist](#post-release-checklist)).

## Pre-Release Checklist

There will be tickets and meetings created during a release cycle to coordinate the release:
- Mid-cycle meeting for pre-release checklist
- End of cycle meeting for release checklist

### Week 1

- **(manual)** Create a planning milestone to decide which features to include in the release. Have this reviewed by product manager and engineering leadership. Provide milestone to leadership so they have visibility into the features we're targeting. (release lead)
- **(partially-automated)** Verify that the documentation is up-to-date. AI can flag potential areas where docs may be out-of-date. (product manager)

### Week 5

- **(manual)** Hold a meeting with relevant stakeholders (leadership, developers) to confirm feature set and timeline. (product manager)
- **(partially-automated)** Distribute changelog/release notes internally before the software release is completed. (release lead)
- **(manual)** Define a PR merge order based on feature priorities and dependencies. (release lead)
- **(manual)** Communicate with team before release about merging in PRs ahead of time, especially aranya-core PRs. (release lead)
- **(manual)** Block off time on relevant developer and DevOps team member calendars to support the release. (product manager)
- **(manual)** Verify any new crates merged into the main branch have been published to crates.io. It's especially important to publish any new crates from the aranya-core repo ahead of the release because it is a dependency of the aranya repo. If release-plz indicates a crate could not be published due to an "authentication error", contact DevOps to refresh the credential and update `CARGO_REGISTRY_TOKEN` in the GitHub actions workflow. Mark expiration date of credential in calendar to confirm with DevOps that the credential is valid before attempting the next aranya-core release.
- **(manual)** Verify that rustdocs build without warnings: `cargo make gen-docs-nightly`

### Week 6

- **(manual)** Hold a go/no-go meeting with leadership and relevant developers to decide when/what to release. (release lead)

### Code Freeze (3 days before release)

A code freeze on aranya-core and aranya begins 3 work days before the scheduled release. This ensures adequate time to:
- Release aranya-core one day before the aranya release
- Have a full day to release aranya without other code changes needing to land

During the code freeze:
- **(manual)** Communicate the code freeze to the team. Only release-critical fixes should be merged. (release lead)
- **(manual)** Release aranya-core crates to crates.io. This is often delegated to engineers who have been closely involved in the aranya-core code changes. (release lead)
- **(manual)** Verify aranya builds successfully with the newly released aranya-core crates. (release lead)

## Aranya-Core Release Process

Crates in the aranya-core repo should be published to crates.io regularly as changes are available on the main branch. Crates in the aranya repo can be released less frequently depending on which feature sets need to be released.

We don't want to tie aranya-core crate version bumps to Aranya releases, but in practice they may often happen at the same time.

### Tools

Install these tools first:

```bash
cargo install release-plz
cargo install cargo-semver-checks
```

### Assumptions

Crates merged into the main branch of the aranya-core repo should implement completed features. Incomplete features should be staged on feature branches or hidden behind feature flags. This allows the aranya repo to run `cargo update` to get the latest versions of all the aranya-core crates without worrying about incorporating partially implemented features.

### Process

1. **(partially-automated)** Before releasing aranya-core, open a PR in aranya that patches aranya-core deps with the main branch of aranya-core. This verifies the changes compile/run and catches compatibility issues early. AI can open the PR, but manual review is required.

2. **(manual)** Open a PR on aranya-core to release new versions. Look at crate diffs since last release and apply semantic versioning to each crate. `release-plz update` can help decide what version to use for each crate.

   The aranya-crypto crate is updated often and results in a breaking change to most of the other crates in aranya-core. release-plz is not able to set the correct version automatically. Therefore, it is often required to run `release-plz update -p <crate>` and `release-plz set-version <crate>@version` manually:

   ```bash
   release-plz update -p aranya-policy-ifgen-build --allow-dirty
   release-plz set-version aranya-policy-ifgen-build@0.6.0
   ```

3. **(partially-automated)** When releasing Aranya, open a PR to bump crate versions to use the latest aranya-core dependency versions. All crates in the aranya repo are set to the same version per semver guidelines, making this straightforward to automate.

## Release Checklist

Tasks to complete on the day of the release:

1. **(manual)** Announce to leadership, team leads, and DevOps that the release process is starting. (release lead)
   - Example: "Starting Aranya v[VERSION] release. Expected completion: [DATE]. Please hold non-essential PRs."

2. **(partially-automated)** Open a PR to bump crate versions for the release. Can do this a day before release or on day of release. (release lead)

3. **(manual)** Check that all CI/CD jobs have passed on the `main` branch before merging.

4. **(manual)** Merge the release PR.

5. **(automated)** Once the release PR is merged, CI/CD workflows automatically:
   - Create a new release tag based on the aranya repo crate versions
   - Upload artifacts (executables, libraries, C headers, Rust docs, Doxygen docs) to the GitHub release
   - Publish crates to crates.io
   - Publish C API Doxygen docs to the gh-pages branch

6. **(manual)** Verify that the publish.yml and release.yml workflows succeeded.

7. **(manual)** Verify that expected aranya-* crates were released on crates.io: https://crates.io/search?q=aranya
   - See [aranya/crates](https://github.com/aranya-project/aranya/tree/main/crates) for a list of crates that should have been released.

8. **(manual)** Verify that release artifacts were attached to the GitHub release.

9. **(partially-automated)** Add release notes using GitHub's autogenerate feature. Include anything special about the release that end users should know. If using AI to generate release notes, ensure it has context for all commits, PRs, and past release notes. Release notes must be reviewed by engineering leadership before publishing. (release lead)

10. **(manual)** Have a product owner, team lead, release manager, and/or product engineer review the release: release notes, CI workflows, published docs, uploaded artifacts, and crates.io listings. (product manager)

11. **(manual)** Announce the release internally to the entire company and all leadership stakeholders. (release lead)
    - Example: "Aranya v[VERSION] released. [1-2 sentence summary]. Release notes: [LINK]"

12. **(manual)** Schedule a product release retrospective for release process improvements.

## Post-Release Checklist

- **(manual)** Rotate the crates.io API key so it doesn't interfere with the next release. This reduces the risk of someone maliciously publishing crates with a compromised key.
- **(partially-automated)** Update C API docs landing page URLs with the newly released Doxygen docs (verify existing links are correct): https://aranya-project.github.io/aranya-docs/capi/
- **(manual)** Check the published docs.rs website for all Aranya crates (sometimes CI builds the docs but the official website fails to build the docs correctly). See [aranya/crates](https://github.com/aranya-project/aranya/tree/main/crates) for a list of crates to verify. If docs are not yet available, check the [docs.rs build queue](https://docs.rs/releases/queue).

## Release Issue Template

Copy the template below into a new GitHub issue to track release progress. Replace `[VERSION]` and `[DATE]` with the appropriate values.

````markdown
# Aranya v[VERSION] Release Checklist

**Target Release Date:** [DATE]
**Release Lead:** @[USERNAME]

## Code Freeze (3 days before release)

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
- [ ] Verify docs.rs pages built correctly
- [ ] Update C API docs landing page URLs
- [ ] Add release notes to GitHub release
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

### When to Issue a Patch Release

1. A security vulnerability is discovered in a dependency (e.g., via [RustSec advisories](https://rustsec.org/advisories/)). The vulnerability must either directly impact us or a downstream dependency. If you cannot prove that there are no downstream dependencies impacted, then a defensive patch release is required.
2. Patch the vulnerability on the main branch first.
3. Discuss with engineering leadership whether a patch release is required, considering:
   - Does our code directly use the vulnerable code path?
   - Could any downstream dependencies be impacted?
   - What is the severity of the vulnerability?

### Patch Release Process

1. **(manual)** Create a base branch from the release tag being patched:
   ```bash
   git checkout -b patch/X.Y.Z vX.Y.Z
   git push origin patch/X.Y.Z
   ```

2. **(manual)** Update CI configuration to allow releases from the base branch. Modify the release workflow to permit releases from `patch/X.Y.Z`. See [this example PR](https://github.com/aranya-project/aranya/pull/706) for the specific workflow changes required.

3. **(partially-automated)** Create a patch release branch targeting the base branch:
   ```bash
   git checkout -b release-X.Y.<Z+1> patch/X.Y.Z
   ```

4. **(partially-automated)** Cherry-pick the fix from main:
   ```bash
   git cherry-pick <commit-hash>
   ```

5. **(partially-automated)** Bump the version and update changelogs. If the base version is X.Y.Z, the patch release will be X.Y.(Z+1). If the patch contains a breaking API change, increment the major version instead: (X+1).Y.Z. See [semver](https://semver.org/#summary) for details.

6. **(partially-automated)** Open a PR targeting the base branch with the version bump and cherry-picked fixes. Once approved, merge the patch release branch into the base branch. **Note:** Patch release base branches (`patch/**/*`) should be configured as protected branches. See [Release Security](#release-security) for details.

7. **(manual)** Follow the standard Release Checklist to complete the release from the base branch.

8. **(partially-automated)** Document the release with clear notes explaining the vulnerability and why the patch was issued, even if the codebase wasn't directly affected.

## QA Process

TODO: Define testing, regression, process, and communication procedures.

## Using AI to Assist with Releases

AI tools can help with tasks marked **(partially-automated)** throughout this document. When using AI for release tasks:

1. Point the AI to this release process documentation for context.
2. Provide example PRs from past releases as references:
   - Major releases: [4.0.0](https://github.com/aranya-project/aranya/pull/618), [3.0.0](https://github.com/aranya-project/aranya/pull/512), [2.0.0](https://github.com/aranya-project/aranya/pull/465), [1.0.0](https://github.com/aranya-project/aranya/pull/389)
   - Minor releases: [4.1.0](https://github.com/aranya-project/aranya/pull/679), [0.6.0](https://github.com/aranya-project/aranya/pull/276)
   - Patch releases: [4.1.1](https://github.com/aranya-project/aranya/pull/705), [0.6.1](https://github.com/aranya-project/aranya/pull/284)
   - CI/workflow fixes: [allow release from patch branch](https://github.com/aranya-project/aranya/pull/706), [don't publish examples](https://github.com/aranya-project/aranya/pull/623)

For patch releases, provide AI with context on the vulnerability being patched (e.g., RustSec advisory links, affected crates, severity).

AI can assist with:
- Generating changelogs and release notes
- Creating version bump PRs
- Cherry-picking fixes for patch releases
- Updating the website docs in [aranya-project.github.io](https://github.com/aranya-project/aranya-project.github.io) with a link to the latest Doxygen docs for the C API
- Updating the website docs to reflect changes in Aranya's design, feature set, or application-facing APIs

AI is not recommended for aranya-core release PRs. Determining what version to bump crates to is complex, as transitive dependencies can cause breaking changes in non-obvious ways.

The release lead remains responsible for reviewing AI-generated content and ensuring the release process is followed correctly.

**Note:** When updating this document, also update `skills/release/SKILL.md` to keep the AI skill in sync with the release process.

## Future Improvements

The following improvements have been identified but not yet implemented:

### Process Gaps

- **Rollback procedure** - Document steps for handling failed releases, including yanking crates from crates.io, reverting tags, or issuing hotfixes.
- **Failure handling in Automated Workflow** - Document recovery steps if publish.yml or release.yml fails partway through.

### Automation Opportunities

- **Release issue template in .github repo** - Add the release checklist as a GitHub issue template in the `aranya-project/.github` repo so issues can be created directly from the template without copying from this document.
- **Automate verification tasks** - Steps 6-8 (verifying workflows succeeded, crates published, artifacts attached) could have a script or AI assistance to check automatically.
- **Calendar blocking** - Could be partially automated with a calendar integration or template invite.
- **Rustdocs warning check** - Could be automated as a CI check rather than a manual pre-release task.

### Risk Mitigation

- **Credential expiration monitoring** - Add recurring reminders or automated alerts for credential expiration instead of relying on manual calendar entries.
- **Release checklist sign-off** - Add a sign-off step where the release lead confirms all items are complete before announcing.
