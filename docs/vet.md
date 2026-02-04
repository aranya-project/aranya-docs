---
layout: page
title: Cargo Vet
permalink: "/vet/"
---

# Cargo Vet Best Practices

## Overview

[Cargo Vet](https://mozilla.github.io/cargo-vet/) is a tool for verifying that third-party Rust dependencies have been audited by trusted entities. This document describes our internal development process for auditing dependencies using cargo-vet.

### Why We Use Cargo Vet

- Defense against [supply chain attacks](#supply-chain-attack) ([typosquatting](#typosquatting), compromised updates, account takeovers)
- Prevents dependencies from silently changing without review
- Forces deliberate decisions about new dependencies and their [transitive dependencies](#transitive-dependency)
- Each dependency increases attack surface, audit burden, and potential for forced patch releases

## Getting Started

Install cargo-vet with `cargo install cargo-vet`. For commands and detailed usage, run `cargo vet --help` or see the [official documentation](https://mozilla.github.io/cargo-vet/).

### Repository Setup

New repositories should be initialized with `cargo vet init`. After initialization:

1. Configure third-party audit imports (see [aranya config.toml](https://github.com/aranya-project/aranya/blob/main/supply-chain/config.toml) for an example, and the [cargo-vet registry](https://github.com/mozilla/cargo-vet/blob/main/registry.toml) for additional sources)
2. Run `cargo vet` to fetch imported audits
3. Audit or exempt remaining dependencies not covered by imports

## When Audits Are Required

- **Adding a new dependency** - CI will fail until the dependency is audited or exempted
- **Updating a dependency version** - A [relative audit](#relative-audit) is needed covering the version change
- **Patching a vulnerability** - Prioritize the audit and reference the advisory in your notes
- **Transitive dependency updates** - Run `cargo vet check` after any `Cargo.lock` changes

When patching a vulnerability, consider whether a patch release of our own crates is needed. Even if our code is not directly impacted, downstream dependencies of our crates may be affected.

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
```

## Audit Requirements

Focus on unsafe code, network access, file I/O, [build scripts](#build-script), [proc macros](#proc-macro), and [FFI](#ffi). Watch for red flags like obfuscated code, hardcoded network addresses, or build scripts that download code. Document your findings in audit notes, including whether areas of concern are actually used by our code. See the [cargo-vet documentation on recording audits](https://mozilla.github.io/cargo-vet/recording-audits.html) for detailed guidance.

Example audit note:
```
Parser/encoder library. Contains documented unsafe code for buffer
manipulation during encoding. No networking code. Reader/writer
interface allows caller to manage file I/O.
```

### Using AI Tools

AI tools can help summarize crates and search for patterns, but they are **not a substitute for manual review**. Audit notes should reflect your manual review, not AI-generated summaries. The responsibility remains with the human reviewer.

## Exemptions and Trust

For dependencies from well-established maintainers or widely-used crates, you may add an exemption instead of auditing each version. Exemptions should be temporary—track them and work to reduce the list over time.

You can also trust publishers directly using `cargo vet trust`. This is appropriate for:
- Well-known external maintainers (e.g., Microsoft for Windows crates)
- Internal crates—we trust all `aranya-*` and `spideroak-*` crates published by `aranya-project-bot` because they go through our internal review process and are published via a secured CI/CD pipeline

For crates in your workspace that aren't published to crates.io, configure them with `audit-as-crates-io = false` to skip auditing.

## Pull Request Responsibilities

### PR Author

1. Manually review all dependency changes using `cargo vet inspect` or `cargo vet diff`
2. Run `cargo vet check` locally before pushing
3. Certify or exempt dependencies with meaningful audit notes
4. Commit `supply-chain/` changes with your PR
5. Be prepared to justify new dependencies

### PR Reviewer

- Verify audit notes are present and meaningful (reject empty or superficial notes)
- Review exemption justifications
- Spot-check high-risk changes (crypto, unsafe, network/filesystem)
- Question whether new dependencies are truly necessary
- Ensure CI passes

Reviewers should consider re-auditing when the dependency handles security-sensitive operations, the notes seem incomplete, or the author is new to the process.

### Recording Violations

If you discover a crate version that fails criteria, communicate with the team so it can be evaluated before recording a violation with `cargo vet record-violation`.

## CI Integration

PRs with unaudited dependencies will fail CI.

## Definitions

<a id="build-script"></a>**Build script** - A Rust file (`build.rs`) that runs at compile time with full system access.
<a id="ffi"></a>**FFI (Foreign Function Interface)** - A mechanism allowing Rust to call functions in other languages, bypassing Rust's safety guarantees.
<a id="proc-macro"></a>**Proc macro** - A Rust macro that runs arbitrary code at compile time with full system access.
<a id="relative-audit"></a>**Relative audit** - An audit that reviews only the changes between two versions of a crate, rather than the entire codebase.
<a id="supply-chain-attack"></a>**Supply chain attack** - An attack targeting the software development or distribution process, such as compromising upstream packages or publishing malicious packages.
<a id="transitive-dependency"></a>**Transitive dependency** - A dependency of a dependency. If your project depends on crate A, and A depends on B, then B is a transitive dependency.
<a id="typosquatting"></a>**Typosquatting** - Publishing a malicious package with a name similar to a popular package (e.g., `serdes` instead of `serde`).
