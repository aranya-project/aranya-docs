---
layout: page
title: Cargo Vet
permalink: "/vet/"
---

# Cargo Vet Best Practices

## Overview

[Cargo Vet](https://mozilla.github.io/cargo-vet/) is a tool for verifying that third-party Rust dependencies have been audited by trusted entities. This document describes our internal development process for auditing dependencies using cargo-vet.

For cargo-vet installation, commands, and detailed usage, run `cargo vet --help` or see the [official documentation](https://mozilla.github.io/cargo-vet/).

### Why We Use Cargo Vet

**Defense against [supply chain attacks](#supply-chain-attack).** Third-party dependencies are a significant attack vector. Malicious code can be introduced through compromised crate updates, [typosquatting](#typosquatting), or maintainer account takeovers. By auditing dependencies, we verify that the code we're pulling into our projects is safe and does what it claims to do.

**Awareness of our dependency footprint.** Every new dependency or version change requires explicit action: either an audit, an exemption, or importing a trusted third-party audit. This prevents dependencies from silently changing without review.

**High bar for adding new dependencies.** Each dependency:
- Increases our attack surface
- Increases the chance that a reported vulnerability may force a patch release
- Adds audit burden for the team
- May introduce [transitive dependencies](#transitive-dependency) we also need to audit

Before adding a new dependency, consider whether it is truly necessary and how many transitive dependencies it brings in.

## When Audits Are Required

- **Adding a new dependency** - CI will fail until the dependency is audited or exempted
- **Updating a dependency version** - A [relative audit](#relative-audit) is needed covering the version change
- **Patching a vulnerability** - Prioritize the audit and reference the advisory in your notes
- **Transitive dependency updates** - Run `cargo vet check` after any `Cargo.lock` changes

When patching a vulnerability, consider whether a patch release of our own crates is needed. Even if our code is not directly impacted, downstream dependencies of our crates may be affected.

### Exemptions

For dependencies from well-established maintainers or widely-used crates, you may add an exemption instead of auditing each version. This is also appropriate for crates developed internally that go through our own peer review process.

Exemptions should be temporary. Track them and work to reduce the exemption list over time.

## Repository Setup

New repositories should be initialized with `cargo vet init`. After initialization:

1. Configure third-party audit imports from trusted organizations (see [aranya config.toml](https://github.com/aranya-project/aranya/blob/main/supply-chain/config.toml) for an example)
2. Run `cargo vet` to fetch imported audits
3. Audit or exempt remaining dependencies not covered by imports

Additional trusted audit sources can be found in the [cargo-vet registry](https://github.com/mozilla/cargo-vet/blob/main/registry.toml).

### Trusting Internal Publishers

We trust all `aranya-*` and `spideroak-*` crates published by `aranya-project-bot`. This is appropriate because:
- The crates are developed and reviewed internally
- Security controls prevent unreviewed code from being merged into protected branches
- Publishing is done through a trusted CI/CD pipeline

For crates in your workspace that aren't published to crates.io, configure them with `audit-as-crates-io = false` to skip auditing.

## Workflow Example

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

## Review Requirements

### What to Look For

When auditing a crate, check for:

1. **Unsafe code** - Is it forbidden, documented, or concerning?
2. **Network access** - Any connections, DNS lookups, or socket operations?
3. **File I/O** - Any filesystem operations outside expected scope?
4. **[Build scripts](#build-script) and [proc macros](#proc-macro)** - These run at compile time with full system access
5. **[FFI](#ffi)** - Foreign function interfaces bypass Rust's safety guarantees
6. **Cryptography** - Should use established libraries, not hand-rolled implementations

**High scrutiny crates:** Proc macros, build scripts, crypto crates, network/async runtimes, crates with significant unsafe code, crates with checked-in binary files.

**Red flags:** Obfuscated code, hardcoded network addresses, filesystem access outside expected paths, build scripts that download code.

### Writing Audit Notes

Audit notes should document:
- Unsafe code status (forbidden, documented, or present)
- Network access (none, or what/where)
- File I/O (none, or what/where)
- Whether areas of concern are actually used by our code

Example:
```
Parser/encoder library. Contains documented unsafe code for buffer
manipulation during encoding. No networking code. Reader/writer
interface allows caller to manage file I/O.
```

### Using AI Tools

AI tools can help summarize crates and search for patterns, but they are **not a substitute for manual review**. Audit notes should reflect your manual review, not AI-generated summaries. The responsibility remains with the human reviewer.

## Pull Request Responsibilities

### PR Author

1. Manually review all dependency changes using `cargo vet inspect` or `cargo vet diff`
2. Run `cargo vet check` locally before pushing
3. Certify or exempt dependencies with meaningful audit notes
4. Commit `supply-chain/` changes with your PR
5. Be prepared to justify new dependencies

### PR Reviewer

1. Verify audit notes are present and meaningful (reject empty or superficial notes)
2. Review exemption justifications
3. Spot-check high-risk changes (crypto, unsafe, network/filesystem)
4. Question whether new dependencies are truly necessary
5. Ensure CI passes

Reviewers should consider re-auditing when the dependency handles security-sensitive operations, the notes seem incomplete, or the author is new to the process.

### Recording Violations

If you discover a crate version that fails criteria, communicate with the team so it can be evaluated before recording a violation with `cargo vet record-violation`.

## CI Integration

We run `cargo vet check` as part of CI via `cargo make cargo-vet`. PRs with unaudited dependencies will fail.

If CI fails, run `cargo vet check` locally to see what's needed, then audit or exempt the dependencies.

## Definitions

<a id="build-script"></a>
**Build script** - A Rust file (`build.rs`) that runs at compile time with full system access.

<a id="relative-audit"></a>
**Relative audit** - An audit that reviews only the changes between two versions of a crate, rather than the entire codebase.

<a id="ffi"></a>
**FFI (Foreign Function Interface)** - A mechanism allowing Rust to call functions in other languages, bypassing Rust's safety guarantees.

<a id="proc-macro"></a>
**Proc macro** - A Rust macro that runs arbitrary code at compile time with full system access.

<a id="supply-chain-attack"></a>
**Supply chain attack** - An attack targeting the software development or distribution process, such as compromising upstream packages or publishing malicious packages.

<a id="transitive-dependency"></a>
**Transitive dependency** - A dependency of a dependency. If your project depends on crate A, and A depends on B, then B is a transitive dependency.

<a id="typosquatting"></a>
**Typosquatting** - Publishing a malicious package with a name similar to a popular package (e.g., `serdes` instead of `serde`).
