---
layout: page
title: Cargo Vet
permalink: "/vet/"
---

# Cargo Vet Best Practices

## Overview

[Cargo Vet](https://mozilla.github.io/cargo-vet/) is a tool for verifying that third-party Rust dependencies have been audited by trusted entities. It helps ensure supply chain security by tracking which crates have been reviewed and by whom.

This document describes our process for auditing dependencies, documenting audit results, and leveraging third-party audits from trusted organizations.

### Why We Use Cargo Vet

**Defense against [supply chain attacks](#supply-chain-attack).** Third-party dependencies are a significant attack vector. Malicious code can be introduced through compromised crate updates, [typosquatting](#typosquatting), or maintainer account takeovers. By auditing dependencies, we verify that the code we're pulling into our projects is safe and does what it claims to do.

**Awareness of our dependency footprint.** Cargo vet forces us to be conscious of what dependencies we're using and when they're being updated. Every new dependency or version change requires explicit action: either an audit, an exemption, or importing a trusted third-party audit. This prevents dependencies from silently changing without review.

**High bar for adding new dependencies.** We should only add new dependencies if they are truly needed. Each dependency:
- Increases our attack surface
- Increases the chance that a reported vulnerability may force a patch release
- Adds audit burden for the team
- May introduce [transitive dependencies](#transitive-dependency) we also need to audit
- Creates ongoing maintenance work as versions update

Before adding a new dependency, consider:
- Can this functionality be implemented reasonably in-house?
- Is the dependency well-maintained and from a trusted source?
- How many [transitive dependencies](#transitive-dependency) does it bring in?
- Is the crate widely used and already audited by organizations we trust?

The goal is not to avoid all dependencies, but to make deliberate, informed decisions about what code we trust to run in our systems.

## Installation

Install cargo-vet via cargo:

```bash
cargo install cargo-vet
```

Run `cargo vet --help` for a full list of available commands. This spec is not intended to fully document cargo-vet. The spec is intended to document our internal development process that utilizes cargo-vet.

## When Audits Are Required

You will need to audit dependencies in the following scenarios:

### Adding a New Dependency

When you add a new crate to `Cargo.toml`, CI will fail until the dependency is audited or exempted. Follow the [Audit Workflow](#audit-workflow) to review and certify the new crate.

**Alternative: Exemption for trusted publishers**

For dependencies from well-established maintainers or organizations, you may add an exemption instead of auditing each version. This is appropriate when:
- The crate is widely used in the Rust ecosystem
- Auditing every release would be impractical due to release frequency
- The crate is already trusted by organizations whose audits we import
- The crate is developed internally and goes through our own peer review process

### Updating a Dependency Version

When you update an existing dependency to a new version, you need a [relative audit](#relative-audit) covering the version change. Follow the [Audit Workflow](#audit-workflow) using `cargo vet diff` to review only the changes between versions.

If there's no existing audit chain to the new version, you may need multiple [relative audits](#relative-audit) or a full audit of the new version.

### Patching a Reported Vulnerability

We learn about vulnerabilities in our dependencies through the [RustSec Advisory Database](https://rustsec.org/), which tracks security vulnerabilities in Rust crates. The `cargo-audit` tool (which runs as part of `cargo make security`) checks our dependencies against this database and fails CI if any known vulnerabilities are found.

When `cargo-audit` reports a vulnerability:

```
error: Vulnerable crates found!

ID:       RUSTSEC-2024-XXXX
Crate:    some-crate
Version:  1.0.0
Title:    Buffer overflow in parse function
URL:      https://rustsec.org/advisories/RUSTSEC-2024-XXXX
Solution: Upgrade to >=1.0.1
```

To resolve:

1. Review the advisory at the RustSec URL to understand the vulnerability
2. Update the vulnerable dependency to a patched version
3. Run `cargo vet check` to see what audits are needed for the new version
4. Prioritize the audit since this is a security-critical update
5. Review the diff carefully, paying attention to the security fix and any other changes
6. Certify the diff and reference the advisory in the audit notes:
   ```toml
   [[audits.some-crate]]
   who = "Developer <dev@example.com>"
   criteria = "safe-to-deploy"
   delta = "1.0.0 -> 1.0.1"
   notes = "Security update addressing RUSTSEC-2024-XXXX. Reviewed fix in src/parser.rs."
   ```

You can also check for vulnerabilities manually:

```bash
# Run cargo-audit directly
cargo audit

# Or run all security checks
cargo make security
```

**Consider a patch release:** When patching a vulnerability in a dependency, consider whether a patch release of our own crates is needed. Even if our code is not directly impacted by the vulnerability, downstream dependencies of our crates may use the vulnerable dependency in a way that is affected.

### Transitive Dependency Updates

When a direct dependency updates its own dependencies, you may need to audit those [transitive](#transitive-dependency) updates. Run `cargo vet check` after any `Cargo.lock` changes to identify gaps.

### Removing a Dependency

When you remove a dependency from the project, run `cargo vet prune` to clean up stale audit entries and exemptions. See [Pruning Unused Entries](#pruning-unused-entries) for more details on when to run this command.

## Repository Setup

### Initializing a New Repository

To add cargo-vet to a repository that doesn't have it configured:

```bash
cargo vet init
```

This creates the `supply-chain/` directory with the following files:

- `config.toml` - Configuration including imports and exemptions
- `audits.toml` - Audit records performed by our team
- `imports.lock` - Cached third-party audit data

The `init` command automatically adds all current dependencies to the exemptions list, allowing teams to address the backlog incrementally rather than blocking on a full audit.

After initialization:

1. **Configure third-party audit imports** - Add imports from trusted organizations to `config.toml` (see [Configuring Third-Party Imports](#configuring-third-party-imports)). This reduces the number of crates you need to audit yourself.

2. **Run `cargo vet`** - This fetches the imported audits and shows which dependencies still need to be audited or exempted.

3. **Audit or exempt remaining dependencies** - Since no audits exist yet for the repository, you must [certify](#certifying-a-crate) or exempt every dependency not covered by imports. This is a significant initial effort, but subsequent audits will only cover new or updated dependencies.

### File Management: Generated vs Manual

**Developers typically do not need to manually edit these files.** The cargo-vet commands handle file modifications automatically. However, understanding what each file contains helps when reviewing changes.

All files in the `supply-chain/` directory are TOML format. Run `cargo vet fmt` to ensure consistent formatting after any manual edits.

| File | Generated By | Manual Editing |
|------|--------------|----------------|
| `audits.toml` | `cargo vet certify`, `cargo vet trust` | Rarely needed; can edit notes or fix errors |
| `config.toml` | `cargo vet init`, `cargo vet add-exemption`, `cargo vet import` | May manually add imports or policy settings |
| `imports.lock` | `cargo vet` (automatic fetch) | **Never edit manually** |

**audits.toml** - Contains your team's audit entries and trusted publisher entries. Generated when you run:
- `cargo vet certify` - Adds audit entries after reviewing a crate
- `cargo vet trust` - Adds trusted publisher entries

**config.toml** - Contains configuration, imports, and exemptions. Generated/modified when you run:
- `cargo vet init` - Creates initial config with exemptions for existing deps
- `cargo vet add-exemption` - Adds exemption entries
- `cargo vet import` - Adds import entries for third-party audits
- `cargo vet prune` - Removes unused exemptions and imports

You may manually edit `config.toml` to add imports or adjust policy settings, but most operations can be done via commands.

**imports.lock** - Cache of fetched third-party audits. Automatically generated and updated when you run `cargo vet`. Never edit this file manually; it will be regenerated.

See the [Audit Workflow](#audit-workflow) for the complete process. All changes to `supply-chain/` files should be committed to version control along with the code changes that triggered them, so they can be reviewed together in a PR.

<a id="configuring-third-party-imports"></a>
### Configuring Third-Party Imports

We leverage audits from trusted third parties to reduce duplication of effort. See the [aranya config.toml](https://github.com/aranya-project/aranya/blob/main/supply-chain/config.toml) for an example of how we configure imports from trusted organizations like Mozilla, Google, and others.

You can discover additional trusted audit sources in the [cargo-vet registry](https://github.com/mozilla/cargo-vet/blob/main/registry.toml).

Note: Imports are not transitive. You cannot import another organization's list of imports; trust relationships must be explicit.

Run `cargo vet` after adding imports to fetch and cache the audit data.

### Trusting Internal Crate Publishers

For crates published by your organization, you can trust all versions from a specific publisher rather than auditing each release individually. This is appropriate when:

- The crates are developed and reviewed internally, with security controls preventing unreviewed code from being merged into protected branches that are released to crates.io
- Publishing is done through a trusted CI/CD pipeline
- The publisher account is secured (e.g., a bot account with restricted access)

#### Aranya Crate Trust Configuration

We trust all `aranya-*` and `spideroak-*` crates published by `aranya-project-bot` (crates.io user ID 293722). This bot account is used by our CI/CD pipeline to publish releases.

To trust all crates from this publisher:

```bash
cargo vet trust --all aranya-project-bot
```

This adds `[[trusted.*]]` entries to `audits.toml` for each crate:

```toml
[[trusted.some-crate]]
criteria = "safe-to-deploy"
user-id = 293722 # aranya-project-bot
start = "2024-10-16"
end = "2030-12-19"
```

#### Trust Entry Fields

| Field | Description |
|-------|-------------|
| `criteria` | The audit criteria to trust for (usually `safe-to-deploy`) |
| `user-id` | The crates.io user ID of the publisher |
| `start` | Trust versions published on or after this date |
| `end` | Trust versions published before this date (must be renewed) |

#### Renewing Trust Entries

Trust entries have expiration dates. To renew entries that are expiring:

```bash
# Renew all wildcard audits expiring within 6 weeks
cargo vet renew --expiring

# Renew a specific crate
cargo vet renew aranya-crypto
```

#### Workspace Member Policy

For crates in your workspace that aren't published to crates.io, configure them in `config.toml` to skip auditing:

```toml
[policy.aranya-daemon]
audit-as-crates-io = false

[policy.aranya-example]
audit-as-crates-io = false
criteria = "safe-to-run"  # Lower criteria for examples/tests
```

Setting `audit-as-crates-io = false` tells cargo-vet these are first-party crates that don't need external auditing.

## Checking Audit Status

### Running Cargo Vet Check

To see which dependencies need to be audited:

```bash
cargo vet check
```

If all dependencies are covered by audits or exemptions, the check passes. If there are gaps, cargo-vet provides detailed output showing which crates need auditing and suggested actions to resolve gaps.

Suggestions are categorized as:

- **Certain** - Actions that will definitely resolve the audit gap (e.g., a specific crate version needs to be audited)
- **Speculative** - Actions that may help but cargo-vet cannot guarantee they will fully resolve the gap (e.g., importing audits from a third party that might cover the crate)

Address issues starting with the "Certain" suggestions first.

### Checking for Backlog Items

To see low-priority review items when check passes:

```bash
cargo vet suggest
```

This temporarily removes exemptions to show what remains in the backlog.

## Reviewing Dependencies

### Audit Criteria

Cargo-vet uses two built-in criteria:

**safe-to-run** - The crate can be safely executed in controlled environments. It must not:
- Read or write data from sensitive or unrelated parts of the filesystem
- Install software or reconfigure the device
- Connect to untrusted network endpoints
- Misuse system resources (e.g., cryptocurrency mining)

**safe-to-deploy** - The crate is safe for production use handling untrusted input. This implies safe-to-run and additionally requires:
- Reviewers must fully reason about the behavior of all unsafe blocks and powerful imports
- Attackers must not be able to manipulate runtime behavior in exploitable or surprising ways
- For code-generating crates ([build dependencies](#build-script), [proc macros](#proc-macro)), reasonable usage must output code meeting the above criteria

For most dependencies, use `safe-to-deploy`.

### Inspecting a Crate

To review a specific version of a crate:

```bash
cargo vet inspect <crate> <version>
```

This fetches the source code for review. You can also view on external services:

```bash
cargo vet inspect <crate> <version> --mode sourcegraph
cargo vet inspect <crate> <version> --mode diff.rs
```

### Reviewing Diffs Between Versions

For incremental reviews when updating a dependency:

```bash
cargo vet diff <crate> <old-version> <new-version>
```

This opens a web browser to [Sourcegraph](https://sourcegraph.com/) showing only the changes between versions, which is much faster than reviewing the entire crate when updating from a previously-audited version.

## Recording Audits

<a id="certifying-a-crate"></a>
### Certifying a Crate

After reviewing a crate, record the audit:

```bash
# Full audit of a specific version
cargo vet certify <crate> <version>

# [Relative audit](#relative-audit) between versions
cargo vet certify <crate> <old-version> <new-version>
```

When you run `cargo vet certify`, it will interactively:
- Suggest the appropriate criteria based on how the crate is used
- Display the criteria definition as a reminder of what to verify
- Prompt you to enter notes documenting your review
- Automatically remove any exemption that's no longer needed

Always provide meaningful notes explaining the rationale.

### Audit Entry Format

Audits are recorded in `audits.toml`:

```toml
[[audits.serde]]
who = "Alice Developer <alice@example.com>"
criteria = "safe-to-deploy"
version = "1.0.195"
notes = """
Reviewed serialization logic. No unsafe code in public API paths.
All unsafe blocks are well-documented and handle edge cases correctly.
No network access or filesystem operations outside of user-provided writers.
"""
```

### Writing Effective Audit Notes

Notes should document the following key aspects:

1. **Unsafe code status** - Whether unsafe is used, forbidden, or documented
2. **Network access** - Any networking code present
3. **File I/O** - Any filesystem operations and their scope
4. **Key findings** - Notable patterns or areas of concern
5. **Relevance to our usage** - Whether areas of concern (e.g., specific APIs or features) are actually used by our code

When certifying, cargo-vet will prompt you with the criteria definition reminding you what to verify. For `safe-to-deploy`, you must "review enough to fully reason about the behavior of all unsafe blocks and usage of powerful imports."

Example audit note:

```toml
[[audits.some-crate]]
who = "Developer <dev@example.com>"
criteria = "safe-to-deploy"
version = "1.0.0"
notes = """
Parser/encoder library. Contains documented unsafe code for buffer
manipulation during encoding. No networking code. Reader/writer
interface allows caller to manage file I/O.
"""
```

### Note Format Guidelines

A good audit note answers these questions:

| Question | Example Response |
|----------|-----------------|
| Is unsafe code used? | "Unsafe code is forbidden" or "Documented use of unsafe for X" |
| Is there network access? | "No networking code" or "Makes HTTP requests to crates.io" |
| Is there file I/O? | "No file I/O code" or "Reader/writer interface for caller to manage I/O" |
| What does the crate do? | "Parser/encoder for ASN.1 BER/DER data" |
| Any concerns? | "Uses system API calls, some unofficially documented" |

### Trusting External Publishers

For crates maintained by known trusted external authors (e.g., Microsoft for Windows crates):

```bash
cargo vet trust <crate> <publisher>
```

This records that you trust all versions of the crate published by that author. Example from our audits:

```toml
[[trusted.windows]]
criteria = "safe-to-deploy"
user-id = 64539 # Kenny Kerr (kennykerr)
start = "2021-01-15"
end = "2026-07-28"
notes = "windows and related crates are provided directly from Microsoft, and are generated from Windows metadata."
```

Use sparingly and only for:
- Well-known maintainers with established reputations
- Official crates from major organizations (Microsoft, Google, etc.)
- Crates with automated generation from trusted sources

## Exemptions

### Adding Exemptions

For dependencies that cannot be immediately audited:

```bash
cargo vet add-exemption <crate> <version>
```

Exemptions should be temporary. Track them and work to reduce the exemption list over time.

### Exemption Policy

Add exemptions in `config.toml` with documentation:

```toml
[exemptions.some-crate]
version = "1.0.0"
criteria = "safe-to-deploy"
notes = "TODO: Audit by Q2. Low risk - only used in tests."
suggest = false  # Don't suggest auditing this yet
```

Use `suggest = false` for exemptions you're not ready to address.

### Recording Violations

If you discover a crate version that fails criteria, communicate with the team so it can be evaluated before recording a violation.

```bash
cargo vet record-violation <crate> <version>
```

This prevents the version from being used and warns other projects importing your audits.

## Best Practices for Reviews

### Audit Checklist

When auditing a crate, systematically check each of these areas and document your findings in the notes:

#### 1. Unsafe Code

**Searching for patterns:** When reviewing via Sourcegraph (opened by `cargo vet diff`), use Sourcegraph's search bar or your browser's find function (Ctrl+F/Cmd+F). For local inspection with `cargo vet inspect`, you can use grep commands in the downloaded source directory.

First, check if the crate has forbidden unsafe code by searching for `forbid(unsafe_code)` or `deny(unsafe_code)`. If unsafe is forbidden, you can skip detailed unsafe review since it won't compile.

Otherwise, search for `unsafe` blocks and evaluate each one. For each unsafe block, verify:
- Is the safety invariant documented in a `// SAFETY:` comment?
- Are the preconditions actually guaranteed by the calling code?
- Could the unsafe code be triggered by malicious input?

Document in notes: "Unsafe code is forbidden" or "Documented use of unsafe for [purpose]" or "Contains unsafe in [location] for [reason]"

#### 2. Network Access

Search for networking patterns: `TcpStream`, `UdpSocket`, `reqwest`, `hyper`, `http::`, `quinn`, `quic`, `connect`, `bind`, `accept`, `lookup`, `resolve`, `ping`, `icmp`.

Check for:
- HTTP/HTTPS clients
- QUIC connections
- Socket operations
- DNS lookups
- ICMP/ping
- Any inbound or outbound connections

Document in notes: "No networking code" or "Makes requests to [destination] for [purpose]"

#### 3. File I/O

Search for filesystem patterns: `std::fs`, `File::`, `read_to_string`, `write_all`, `OpenOptions`, `create_dir`, `remove`.

Check for:
- File reads/writes
- Directory operations
- Path traversal vulnerabilities
- Whether I/O is scoped to expected locations

Document in notes: "No file I/O code" or "Reader/writer interface for caller to manage I/O" or "Reads [what] from [where]"

#### 4. [Build Scripts](#build-script) (`build.rs`)

Check if `build.rs` exists. [Build scripts](#build-script) run during compilation with full system access.

If present, examine for:
- Network downloads (downloading code at build time)
- Arbitrary code execution
- Writing outside of `OUT_DIR`
- Environment variable manipulation

#### 5. [Proc Macros](#proc-macro)

Check `Cargo.toml` for `proc-macro = true`. [Proc macros](#proc-macro) warrant thorough review because they:
- Execute arbitrary code during compilation
- Can access the filesystem and network
- Have access to the full compilation environment

#### 6. [FFI](#ffi) and External Dependencies

Search for [foreign function interface](#ffi) patterns: `extern "C"`, `#[link]`, `bindgen`, `cc::Build`.

[FFI](#ffi) code needs review of:
- Memory safety at language boundaries
- Correct handling of null pointers
- Buffer size validation
- Resource cleanup

#### 7. Cryptography

For crates that handle crypto:
- Verify they use established libraries (ring, RustCrypto, aws-lc-rs)
- Check for hand-rolled crypto implementations
- Verify secure random number generation
- Check for timing-safe comparisons

### Red Flags

Be cautious of:

- Obfuscated code or unusual encoding
- Network requests to hardcoded addresses
- Filesystem access outside expected paths
- Unused dependencies that seem unrelated to functionality
- [Build scripts](#build-script) that download or execute code
- Suspiciously complex code for simple functionality

### Review Depth by Crate Type

**High scrutiny:**
- [Proc macros](#proc-macro) and [build scripts](#build-script) (compile-time code execution)
- Crypto crates
- Network/async runtime crates
- Crates with significant unsafe code
- Crates with checked-in binary files

**Standard review:**
- Application logic crates
- Data structure implementations
- Serialization libraries

**Light review (for [relative audits](#relative-audit)):**
- Patch version updates with minimal changes
- Dependency-only updates

### Using AI Tools for Review Assistance

AI tools (such as LLMs) can be helpful for reviewing dependencies, but they are **not a substitute for manual review**. Use AI as a supplementary tool, not a replacement for human judgment.

**What AI can help with:**
- Summarizing what a crate does and identifying its main functionality
- Searching for patterns like unsafe code, network calls, or file I/O
- Explaining complex code sections
- Cross-referencing claims in documentation against actual implementation
- Identifying potential red flags for further manual investigation

**Limitations of AI review:**
- AI may miss subtle security issues or logic errors
- AI can hallucinate or make incorrect claims about code behavior
- AI cannot fully reason about complex security invariants
- AI lacks context about your specific security requirements and threat model

**Recommended workflow:**
1. **Manual review first** - Form your own assessment of the crate before using AI tools. This ensures your judgment is not biased by AI-generated summaries or conclusions.
2. **Use AI to verify and supplement** - After your manual review, use AI to check for things you might have missed or to get a second perspective.
3. **Verify AI claims** - If AI identifies potential issues, manually verify them. If AI says code is safe, don't take that as authoritative.
4. **Document your own findings** - Audit notes should reflect your manual review, not AI-generated summaries.

The responsibility for the audit remains with the human reviewer. AI is a tool to help you be more thorough, not a way to delegate the review.

**Note:** These recommendations cannot be easily enforced. A reviewer may choose to rely on AI assistance exclusively, and PR reviewers may not notice unless something suspicious appears in the audit notes. Ultimately, this comes down to individual integrity and professional responsibility.

## Maintenance

<a id="pruning-unused-entries"></a>
### Pruning Unused Entries

Use `cargo vet prune` to clean up stale audit entries and exemptions:

```bash
cargo vet prune
```

**When to run `cargo vet prune`:**

- **After removing a dependency** - When you remove a crate from `Cargo.toml`, run prune to clean up its audit/exemption entries
- **After a dependency update removes transitive deps** - Updating a dependency may remove transitive dependencies that are no longer needed
- **After refactoring that changes the dependency tree** - Feature flag changes or conditional compilation changes may affect which deps are used
- **Periodically as maintenance** - Run occasionally to catch any stale entries that accumulated over time
- **Before submitting a PR that touches dependencies** - Ensures you're not carrying stale entries

This removes unused entries from `audits.toml` and `config.toml`, and cleans up unused imports from third parties.

### Regenerating Configuration

Update exemptions automatically when dependencies change:

```bash
cargo vet regenerate exemptions
```

### Formatting

Keep configuration files consistently formatted:

```bash
cargo vet fmt
```

<a id="audit-workflow"></a>
## Audit Workflow

This section provides a consolidated workflow for auditing dependencies. See [Certifying a Crate](#certifying-a-crate) for details on the interactive certification process.

### 1. Check What Needs Auditing

Always start by running:

```bash
cargo vet check
```

This shows which crates need audits and suggests actions to resolve gaps.

### 2. Review the Crate

**For a new crate** (no prior audit exists):

```bash
cargo vet inspect some-crate 1.0.0
```

This opens the crate source for review. Alternative viewing modes:
- `--mode local` - Download and open locally (default)
- `--mode sourcegraph` - View on Sourcegraph
- `--mode diff.rs` - View on diff.rs

**For an updated crate** (prior version was audited):

```bash
cargo vet diff some-crate 1.0.0 1.1.0
```

This opens a diff in Sourcegraph showing only the changes between versions.

### 3. Perform the Review

Use the [Audit Checklist](#audit-checklist) to guide your review. Focus on:
- Unsafe code
- Network access
- File I/O
- Build scripts and proc macros
- FFI boundaries

For [relative audits](#relative-audit), verify that changes preserve security properties. Don't just check that the diff "looks okay."

### 4. Record the Audit

**For a new crate:**

```bash
cargo vet certify some-crate 1.0.0
```

**For an updated crate:**

```bash
cargo vet certify some-crate 1.0.0 1.1.0
```

**Alternative: Add an exemption** for trusted publishers or internal crates:

```bash
cargo vet add-exemption some-crate 1.0.0
```

### 5. Commit Changes

Commit all changes to `supply-chain/` files along with your code changes so they can be reviewed together in the PR.

## Pull Request Responsibilities

### PR Author Responsibilities

The PR author who adds or updates a dependency is responsible for the audit:

1. **Manually review all dependency changes** - Use `cargo vet inspect` for new crates or `cargo vet diff` for version updates. Do not skip this step.

2. **Run `cargo vet check` locally** - Verify all dependencies pass before pushing.

3. **Certify or exempt dependencies** - [Certify](#certifying-a-crate) with `cargo vet certify` after reviewing, or use `cargo vet add-exemption` for trusted publishers.

4. **Write meaningful audit notes** - Document what you reviewed: unsafe code status, network access, file I/O, and any concerns. Notes should reflect your manual review findings.

5. **Commit supply-chain changes** - Include changes to `supply-chain/` files in your PR.

6. **Justify new dependencies** - Be prepared to explain why a new dependency is needed and why alternatives were not suitable.

### PR Reviewer Responsibilities

PR reviewers are **not expected to re-audit all dependency diffs** that the author has already reviewed. However, reviewers should:

1. **Verify audit notes are present and meaningful** - Check that the author documented their findings. Reject PRs with empty or superficial notes like "looks fine" or "no issues."

2. **Check that the criteria is appropriate** - Ensure `safe-to-deploy` is used for production dependencies, not just `safe-to-run`.

3. **Review exemption justifications** - If exemptions were added instead of audits, verify the rationale (e.g., trusted publisher, widely-used crate).

4. **Spot-check high-risk changes** - For dependencies that touch crypto, unsafe code, or network/filesystem access, reviewers may choose to independently verify the author's findings.

5. **Question new dependencies** - Ask whether the dependency is truly necessary and if alternatives were considered.

6. **Ensure CI passes** - The `cargo vet check` in CI must pass before merging.

### When Reviewers Should Re-audit

Reviewers should consider independently reviewing the dependency diff when:

- The dependency handles cryptography, authentication, or security-sensitive operations
- The audit notes seem incomplete or raise concerns
- The dependency has significant unsafe code
- The dependency is new and unfamiliar to the team
- The author is new to the audit process

### Summary of Responsibilities

| Task | Author | Reviewer |
|------|--------|----------|
| Manually review dependency diffs | **Required** | Optional (spot-check) |
| Run `cargo vet check` | **Required** | Verified by CI |
| Write audit notes | **Required** | Verify quality |
| Certify or exempt | **Required** | Review decision |
| Justify new dependencies | **Required** | Question if unclear |
| Verify CI passes | Check locally | **Required** before merge |

## CI Integration

We run cargo-vet as part of our security checks in CI via `cargo make security`. This blocks PRs that introduce unaudited dependencies.

The security task runs `cargo vet check` along with other security checks (`cargo-audit`, `cargo-deny`). If any unaudited dependencies are found, the CI job fails.

### Running Security Checks Locally

Before pushing changes, run cargo-vet locally:

```bash
cargo make cargo-vet
```

### When CI Fails Due to Unaudited Dependencies

Run `cargo vet check` locally to see what's needed, then follow the [Audit Workflow](#audit-workflow) to resolve the gaps.

## Definitions

<a id="build-script"></a>
**Build script** - A Rust file (`build.rs`) that runs at compile time before the crate is built. Build scripts have full system access and can download files, run commands, and modify the build environment.

<a id="relative-audit"></a>
**Relative audit** - An audit that reviews only the changes between two versions of a crate, rather than the entire codebase. More efficient than a full audit when updating from a previously-audited version.

<a id="ffi"></a>
**FFI (Foreign Function Interface)** - A mechanism that allows Rust code to call functions written in other languages (typically C) and vice versa. FFI code requires careful review because it bypasses Rust's safety guarantees.

<a id="proc-macro"></a>
**Proc macro (procedural macro)** - A Rust macro that runs arbitrary code at compile time to generate or transform source code. Proc macros have full system access during compilation, similar to build scripts.

<a id="supply-chain-attack"></a>
**Supply chain attack** - An attack that targets the software development or distribution process rather than the final application directly. In the context of dependencies, this includes compromising upstream packages, injecting malicious code into updates, or publishing malicious packages that masquerade as legitimate ones.

<a id="transitive-dependency"></a>
**Transitive dependency** - A dependency of a dependency. If your project depends on crate A, and crate A depends on crate B, then B is a transitive dependency of your project. Transitive dependencies must also be audited.

<a id="typosquatting"></a>
**Typosquatting** - A [supply chain attack](#supply-chain-attack) where an attacker publishes a malicious package with a name very similar to a popular package (e.g., `serdes` instead of `serde`), hoping developers will install it by mistake due to a typo.
