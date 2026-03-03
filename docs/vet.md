---
layout: page
title: Cargo Vet
permalink: "/vet/"
---

# Cargo Vet Best Practices

## Overview

[Cargo Vet](https://mozilla.github.io/cargo-vet/) is a tool for verifying that third-party Rust dependencies have been audited by trusted entities. This document describes our internal development process for auditing dependencies using cargo-vet.

### Key Concepts

- **Supply chain attack** - An attack targeting the software development or distribution process, such as compromising upstream packages or publishing malicious packages.
- **Typosquatting** - Publishing a malicious package with a name similar to a popular package (e.g., `serdes` instead of `serde`), relying on a developer mistyping a dependency name.
- **Transitive dependency** - A dependency of a dependency. If your project depends on crate A, and A depends on B, then B is a transitive dependency.
- **Relative audit** - An audit that reviews only the changes between two versions of a crate, rather than the entire codebase.

### Defending Against Supply Chain Attacks

Supply chain attacks target the software development process through typosquatting, compromised updates, and account takeovers. Each dependency increases attack surface, audit burden, and potential for forced patch releases. Our audit process defends against these threats through multiple layers:

- **Version pinning** - All dependencies are pinned to specific versions in `Cargo.lock`, preventing automatic updates. Any version change requires an explicit commit and must pass cargo-vet checks.
- **Mandatory audits** - New dependencies and version updates must be audited, exempted, or trusted before CI will pass and the PR can be merged. This forces deliberate decisions about new dependencies and their transitive dependencies.
- **Human review** - Audits require manual code inspection, not just automated checks. Reviewers verify audit quality and can request re-audits.
- **Trusted imports** - We import audits from organizations in the [cargo-vet registry](https://github.com/mozilla/cargo-vet/blob/main/registry.toml) and select others (like AWS) based on reviewer judgment, leveraging community review efforts while maintaining our own verification standards.

## Getting Started

Install cargo-vet with `cargo install cargo-vet`. For commands and detailed usage, run `cargo vet --help` or see the [official documentation](https://mozilla.github.io/cargo-vet/).

### Repository Setup

New repositories should be initialized with `cargo vet init`. After initialization:

1. Configure third-party audit imports (see [aranya config.toml](https://github.com/aranya-project/aranya/blob/main/supply-chain/config.toml) for an example, and the [cargo-vet registry](https://github.com/mozilla/cargo-vet/blob/main/registry.toml) for additional sources)
2. Run `cargo vet` to fetch imported audits
3. Audit or exempt remaining dependencies not covered by imports

## When Audits Are Required

- **Adding a new dependency** - CI will fail until the dependency is audited, exempted, or trusted
- **Updating a dependency version** - A relative audit is needed covering the version change
- **Patching a vulnerability** - Prioritize the audit and reference the [advisory](https://rustsec.org/advisories/) in your notes
- **Transitive dependency updates** - Run `cargo vet check` after any `Cargo.lock` changes

When patching a vulnerability, consider whether a patch release of our own crates is needed. Even if our code is not directly impacted, downstream dependencies of our crates may be affected.

## Exemptions and Trust

For dependencies from well-established maintainers or widely-used crates, you may add an exemption for a specific version instead of performing a full audit. Subsequent version updates must still be audited as diffs from the exempted version. Exemptions should be temporary and can be reduced over time by auditing or adding trust entries.

You can also trust publishers directly using `cargo vet trust`. This is appropriate for:
- External maintainers whose review processes we believe meet our standards. The team evaluates this on a case-by-case basis (e.g., tokio-rs for async runtime crates).
- Internal crates—we trust all `aranya-*` and `spideroak-*` crates published by `aranya-project-bot` because they go through our internal review process and are published via a secured CI/CD pipeline

For crates in your workspace that aren't published to crates.io, manually set `audit-as-crates-io = false` in the crate's `Cargo.toml` `[package]` section to skip auditing.

## Audit Requirements

### Initial Audits

For initial audits, evaluate the overall quality of the crate: does it have tests, documentation, and specs? Is unsafe code minimal and well-documented? Is the project actively maintained? These signals help assess whether the crate is trustworthy.

### Diff Audits (Updates)

The primary goal of diff audits is to catch malicious changes introduced in updates. Watch for red flags like obfuscated code, hardcoded network addresses, checked-in binaries, or build scripts that download code.

### General Guidance

Cargo-vet defines two [built-in criteria](https://mozilla.github.io/cargo-vet/built-in-criteria.html): `safe-to-run` (no surprising filesystem, network, or system resource usage) and `safe-to-deploy` (no serious security vulnerabilities, with full reasoning about unsafe blocks and powerful imports). Document your findings in audit notes, including whether areas of concern are actually used by our code. See the [cargo-vet documentation on recording audits](https://mozilla.github.io/cargo-vet/recording-audits.html) for details on the audit file format.

Example audit note:
```
Parser/encoder library. Contains documented unsafe code for buffer
manipulation during encoding. No networking code. Reader/writer
interface allows caller to manage file I/O.
```


## Workflow

This example shows the typical commands used when auditing dependencies:

```bash
# Check what needs auditing
cargo vet check

# Review a new crate (opens source for inspection)
cargo vet inspect some-crate 1.0.0

# Review changes between versions (opens diff in browser)
cargo vet diff some-crate 1.0.0 1.1.0

# After review, certify the crate
cargo vet certify some-crate 1.0.0           # Full audit
cargo vet certify some-crate 1.0.0 1.1.0     # Relative audit

# Or add an exemption for trusted crates
cargo vet add-exemption some-crate 1.0.0

# Trust a publisher for all their crates
cargo vet trust some-crate some-publisher

# Clean up after removing dependencies
cargo vet prune

# Format supply-chain files
cargo vet fmt

# Verify CI check will pass before pushing
cargo make cargo-vet
```

## Pull Request Responsibilities

### PR Author

1. Manually review dependency changes using `cargo vet inspect` or `cargo vet diff`. Reviewing every line is not required, especially for large changes—use your judgement to focus on code that is likely to be problematic.
2. Certify, exempt, or trust dependencies with meaningful audit notes
3. Run `cargo make cargo-vet` locally to verify CI will pass
4. Commit `supply-chain/` changes with your PR
5. Be prepared to justify new dependencies

### PR Reviewer

- Verify audit notes are present and meaningful (reject empty or superficial notes, notes reused across multiple crates in the same PR, or wording that suggests AI-generated or copy-pasted content)
- Review exemption justifications
- Spot-check high-risk changes (crypto, unsafe, network/filesystem)
- Question whether new dependencies are truly necessary
- Ensure CI passes

Reviewers should consider re-auditing when the dependency handles security-sensitive operations, the notes seem incomplete, the author is new to the process, or anything was flagged during review of the dependency or audit notes.

### Recording Violations

If you discover a crate version that fails criteria, communicate with the team so it can be evaluated before recording a violation with `cargo vet record-violation`.

## CI Integration

PRs with unaudited dependencies will fail CI checks and cannot be merged into protected branches.

