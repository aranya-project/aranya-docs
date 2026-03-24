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

Cargo-vet defines two [built-in criteria](https://mozilla.github.io/cargo-vet/built-in-criteria.html): `safe-to-run` (no surprising filesystem, network, or system resource usage) and `safe-to-deploy` (no serious security vulnerabilities, with full reasoning about unsafe blocks and powerful imports). `safe-to-deploy` implies `safe-to-run`—it is the strictly stronger criterion. All audits should use the `safe-to-deploy` criteria because Aranya crates are deployed to production environments exposed to untrusted input. If an audit can only certify a dependency as `safe-to-run`, the team should discuss whether that dependency can be included in Aranya before proceeding. Document your findings in audit notes, including whether areas of concern are actually used by our code. See the [cargo-vet documentation on recording audits](https://mozilla.github.io/cargo-vet/recording-audits.html) for details on the audit file format.

Example audit note:
```
Parser/encoder library. Contains documented unsafe code for buffer
manipulation during encoding. No networking code. Reader/writer
interface allows caller to manage file I/O.
```

### Auditing Large Diffs

Some dependencies produce diffs that are too large to review line-by-line (e.g., `-sys` crates with vendored C code, crates with auto-generated bindings). As a guideline, diffs over **1,000 lines** should use this structured process to narrow the review surface to a manageable size. See [#191](https://github.com/aranya-project/aranya-docs/issues/191) for background and [aranya PR #758](https://github.com/aranya-project/aranya/pull/758) for a concrete example (aws-lc-sys 413K-line diff reduced to 7 reviewable files).

#### 1. Narrow the Review Surface

Determine what code is actually compiled for your codebase:

- **Feature flags** - Check which features are active with `cargo tree -p <crate> -e features -f '{p} {f}' --depth 0` (use `--all-features` to see features that are conditional on your own crate's features). Disable unused features. Pay attention to `default` features that may include code you don't use. Code behind inactive feature gates does not need to be reviewed for the current audit, but note that enabling a new feature later would require auditing that feature's code across all versions since the last exemption — `cargo-vet` does not track feature changes, so this must be identified manually.
- **Platforms** - Identify which platform-specific files are compiled for your CI targets and development machines. Per-platform files for platforms you don't build on can be skipped.
- **APIs** - Determine which APIs from the dependency your code actually calls. Code paths you don't exercise are lower priority (though still compiled).

#### 2. Identify Auto-Generated vs. Hand-Written Code

Large diffs often consist mostly of auto-generated code. Signs that a file is auto-generated:

- **Generator header comment** at the top of the file (e.g., `/* automatically generated by rust-bindgen 0.72.1 */`, `// @generated`, `// This file is auto-generated`). Check the first few lines of any large `.rs` file.
- **Highly repetitive structure** - uniform `extern "C"` blocks, `pub const` declarations, `bindgen_test_layout_*` functions, or `#[repr(C)]` struct definitions with no logic.
- **No imports or module declarations** - auto-generated FFI files typically contain only declarations, not `use` statements, `mod` blocks, or function bodies with control flow.
- **File naming patterns** - platform-specific suffixes (`*_x86_64.rs`, `*_aarch64.rs`), `bindings.rs`, or files in `generated-src/` directories.

Common categories of auto-generated or vendored content:

- **FFI bindings** - Generated by bindgen or similar tools. Verify the header, grep for non-declaration code that shouldn't be there.
- **Vendored C/C++** - Upstream library source. Too large for line-by-line Rust-style review. Where possible, verify the vendored code matches the upstream source for the specified version (e.g., compare against the upstream git tag). Any delta between the vendored code and upstream may indicate tampering. Note: a coordinated attacker who controls both the crate and the upstream repository could bypass this check. For high-risk dependencies, a full audit of vendored C/C++ code may be warranted, though this requires a different review approach than Rust code (C/C++ has fewer built-in safety guarantees). Covered by exemptions when full review is not feasible.
- **Generated headers** - Typically symbol renaming macros. Verify no executable code.
- **Per-platform build configs** - Often auto-generated source file lists. Verify entries are only source files (`.c`, `.S`, `.asm`), not scripts or executables.

Everything else is hand-written code and the primary focus of manual review. When in doubt, compare the file's structure against known auto-generated files in the same crate — auto-generated files within a project are structurally consistent with each other.

#### 3. Audit Unsafe Code

List all unsafe locations in both versions and compare them directly. Counting alone is not reliable — if the same number of unsafe blocks were added and removed, the counts would match but the code could be entirely different.

```bash
# List all unsafe locations in old version
grep -rn "unsafe {" ~/.cache/cargo-vet/src/<crate>-<old>/src/lib.rs \
  ~/.cache/cargo-vet/src/<crate>-<old>/builder/ | sed 's|.*/src/||'

# List all unsafe locations in new version
grep -rn "unsafe {" ~/.cache/cargo-vet/src/<crate>-<new>/src/lib.rs \
  ~/.cache/cargo-vet/src/<crate>-<new>/builder/ | sed 's|.*/src/||'

# Diff the two lists to see exactly what was added/removed
diff <(grep -rn "unsafe {" ~/.cache/cargo-vet/src/<crate>-<old>/src/lib.rs \
       ~/.cache/cargo-vet/src/<crate>-<old>/builder/ | sed 's|.*/src/||; s|.*/builder/|builder/|') \
     <(grep -rn "unsafe {" ~/.cache/cargo-vet/src/<crate>-<new>/src/lib.rs \
       ~/.cache/cargo-vet/src/<crate>-<new>/builder/ | sed 's|.*/src/||; s|.*/builder/|builder/|')
```

For each new unsafe block, review the surrounding context and verify it falls into an expected category (FFI calls, static mut reads, env::set_var) and is not introducing a new unsafe pattern. For each removed unsafe block, verify the replacement is correct (e.g., safe Rust arithmetic replacing an FFI call).

#### 4. Audit Networking and File Operations

Search for new networking or file system operations in the diff:

```bash
# Networking (filter out const declarations and comments)
cargo vet diff <crate> <old> <new> --mode=local 2>&1 \
  | grep "^+" | grep -v "aws-lc/\|//\|const " \
  | grep -iE "http|socket|connect|download|fetch|quic|websocket"

# File operations
cargo vet diff <crate> <old> <new> --mode=local 2>&1 \
  | grep "^+" | grep -v "aws-lc/" \
  | grep -iE "std::fs|File::create|File::open|write_all|read_to_string|remove_file|remove_dir|create_dir"

# Process execution
grep -rE "Command::new|process::Command" \
  ~/.cache/cargo-vet/src/<crate>-<new>/src/ \
  ~/.cache/cargo-vet/src/<crate>-<new>/builder/
```

Any matches in runtime code (not build scripts) require careful review. Matches in build scripts should be verified against expected build tool invocations.

#### 5. Verify Checked-In Binaries

If the crate includes prebuilt binary objects (`.obj`, `.o`, `.a`, `.lib`, `.dll`, `.so`):

```bash
# Find all binaries
find ~/.cache/cargo-vet/src/<crate>-<new>/ -type f \
  \( -name "*.obj" -o -name "*.o" -o -name "*.a" -o -name "*.lib" \)

# Compare against old version (check for new additions)
diff <(find ~/.cache/cargo-vet/src/<crate>-<old>/ -name "*.obj" -exec basename {} \; | sort) \
     <(find ~/.cache/cargo-vet/src/<crate>-<new>/ -name "*.obj" -exec basename {} \; | sort)
```

Verify that binaries can be reproduced from source. Rebuild one or more from the vendored source and compare. Binary diffs should only contain timestamps and build paths, not code differences.

Similarly, if the crate includes auto-generated code (e.g., FFI bindings), consider regenerating it from source using the same tool version (noted in the file header) and comparing against the checked-in version. This can catch code injection hiding in auto-generated files.

#### 6. Cross-Reference Release Notes

Compare the crate's changelog, release notes, or README against the actual code changes. Verify that:
- Claimed security fixes are present in the diff
- No undocumented changes appear that weren't mentioned in the release
- New features or modules align with what was announced

#### 7. AI-Assisted Review

For auto-generated files too large for manual review, use AI tools to scan for anomalies:
- Hand-written code mixed into auto-generated files
- Obfuscated code or unusual encoding
- Backdoor patterns in crypto code (hardcoded keys, weakened parameters)
- Unexpected imports or dependencies

AI-assisted review is not a substitute for manual review of hand-written code. Always verify AI findings manually and provide references for any claims. Disclose AI-assisted review in audit notes.

#### 8. Document Findings

Audit notes for large diffs should include:
- Which platforms and features were reviewed
- Unsafe code locations (before and after, by file)
- What was manually reviewed vs. AI-assisted vs. covered by exemption
- Specific findings (e.g., "3 unsafe FFI calls replaced with safe Rust")
- Verification commands others can run to reproduce your findings


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

1. Manually review dependency changes using `cargo vet inspect` or `cargo vet diff`. Reviewing every line is not required, especially for large changes—use your judgement to focus on code that is likely to be problematic. For large diffs, follow the [Auditing Large Diffs](#auditing-large-diffs) process.
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

