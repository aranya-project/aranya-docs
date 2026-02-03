---
layout: page
title: Cargo Vet
permalink: "/vet/"
---

# Cargo Vet Best Practices

## Overview

[Cargo Vet](https://mozilla.github.io/cargo-vet/) is a tool for verifying that third-party Rust dependencies have been audited by trusted entities. It helps ensure supply chain security by tracking which crates have been reviewed and by whom.

This document describes our process for auditing dependencies, recording findings, and leveraging third-party audits from trusted organizations.

### Why We Use Cargo Vet

**Defense against supply chain attacks.** Third-party dependencies are a significant attack vector. Malicious code can be introduced through compromised crate updates, typosquatting, or maintainer account takeovers. By auditing dependencies, we verify that the code we're pulling into our projects is safe and does what it claims to do.

**Awareness of our dependency footprint.** Cargo vet forces us to be conscious of what dependencies we're using and when they're being updated. Every new dependency or version change requires explicit action—either an audit, an exemption, or importing a trusted third-party audit. This prevents dependencies from silently changing without review.

**High bar for adding new dependencies.** We should only add new dependencies if they are truly needed. Each dependency:
- Increases our attack surface
- Adds audit burden for the team
- May introduce transitive dependencies we also need to audit
- Creates ongoing maintenance work as versions update

Before adding a new dependency, consider:
- Can this functionality be implemented reasonably in-house?
- Is the dependency well-maintained and from a trusted source?
- How many transitive dependencies does it bring in?
- Is the crate widely used and already audited by organizations we trust?

The goal is not to avoid all dependencies, but to make deliberate, informed decisions about what code we trust to run in our systems.

## When Audits Are Required

You will need to audit dependencies in the following scenarios:

### Adding a New Dependency

When you add a new crate to `Cargo.toml`, CI will fail until the dependency is audited or exempted. For new dependencies:

1. Check if a third-party audit already exists (cargo-vet will suggest imports)
2. If not, perform a full audit using `cargo vet inspect`
3. Certify with `cargo vet certify <crate> <version>`

**Alternative: Exemption for trusted publishers**

For dependencies from widely-known, trusted publishers (e.g., `serde`, `tokio`, `rand`) that release frequently, you may add an exemption instead of auditing each version:

```bash
cargo vet add-exemption some-crate 1.0.0
```

This is appropriate when:
- The crate is from a well-established maintainer or organization
- The crate is widely used in the Rust ecosystem
- Auditing every release would be impractical due to release frequency
- The crate is already trusted by organizations whose audits we import

You can later replace exemptions with trusted publisher entries for ongoing trust:

```bash
cargo vet trust some-crate some-publisher
```

### Updating a Dependency Version

When you update an existing dependency to a new version, you need a delta audit covering the version change:

1. Review the changes using `cargo vet diff <crate> <old-version> <new-version>`
2. Certify the delta with `cargo vet certify <crate> <old-version> <new-version>`

If there's no existing audit chain to the new version, you may need multiple delta audits or a full audit of the new version.

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
6. Certify the delta and reference the advisory in the audit notes:
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

**Consider a patch release:** When patching a vulnerability in a dependency, consider whether a patch release of our own crates is needed. Downstream users of our crates may be affected by the same vulnerability and should be notified or provided with an updated version that includes the fix.

### Transitive Dependency Updates

When a direct dependency updates its own dependencies, you may need to audit those transitive updates. Run `cargo vet check` after any `Cargo.lock` changes to identify gaps.

### Removing a Dependency

When you remove a dependency from the project, run `cargo vet prune` to clean up stale audit entries and exemptions:

```bash
cargo vet prune
```

This keeps the `supply-chain/` files clean and removes entries for crates no longer in use.

## Installation

Install cargo-vet via cargo:

```bash
cargo install cargo-vet
```

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

### File Management: Generated vs Manual

**Developers typically do not need to manually edit these files.** The cargo-vet commands handle file modifications automatically. However, understanding what each file contains helps when reviewing changes.

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

**Typical workflow:**
```bash
# These commands modify the files for you
cargo vet certify some-crate 1.0.0      # Updates audits.toml
cargo vet add-exemption other-crate 2.0.0  # Updates config.toml
cargo vet trust crate-name publisher    # Updates audits.toml
cargo vet prune                         # Cleans up both files
cargo vet fmt                           # Formats all files consistently
```

All changes to `supply-chain/` files should be committed to version control along with the code changes that triggered them.

### Configuring Third-Party Imports

We leverage audits from trusted third parties to reduce duplication of effort. The aranya repository imports audits from the following trusted organizations:

```toml
[imports.actix]
url = "https://raw.githubusercontent.com/actix/supply-chain/main/audits.toml"

[imports.aranya-core]
url = "https://raw.githubusercontent.com/aranya-project/aranya-core/refs/heads/main/supply-chain/audits.toml"

[imports.bytecode-alliance]
url = "https://raw.githubusercontent.com/bytecodealliance/wasmtime/main/supply-chain/audits.toml"

[imports.cargo-vet]
url = "https://raw.githubusercontent.com/mozilla/cargo-vet/refs/heads/main/supply-chain/audits.toml"

[imports.embark]
url = "https://raw.githubusercontent.com/EmbarkStudios/rust-ecosystem/main/audits.toml"

[imports.fermyon]
url = "https://raw.githubusercontent.com/fermyon/spin/main/supply-chain/audits.toml"

[imports.google]
url = "https://raw.githubusercontent.com/google/supply-chain/main/audits.toml"

[imports.google-rust-crate-audits]
url = "https://raw.githubusercontent.com/google/rust-crate-audits/main/audits.toml"

[imports.isrg]
url = "https://raw.githubusercontent.com/divviup/libprio-rs/main/supply-chain/audits.toml"

[imports.mozilla]
url = "https://raw.githubusercontent.com/mozilla/supply-chain/main/audits.toml"

[imports.zcash]
url = "https://raw.githubusercontent.com/zcash/rust-ecosystem/main/supply-chain/audits.toml"
```

You can discover additional trusted audit sources in the [cargo-vet registry](https://github.com/mozilla/cargo-vet/blob/main/registry.toml).

Note: Imports are not transitive. You cannot import another organization's list of imports; trust relationships must be explicit.

Run `cargo vet` after adding imports to fetch and cache the audit data.

### Trusting Internal Crate Publishers

For crates published by your organization, you can trust all versions from a specific publisher rather than auditing each release individually. This is appropriate when:

- The crates are developed and reviewed internally
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
[[trusted.aranya-crypto]]
criteria = "safe-to-deploy"
user-id = 293722 # aranya-project-bot
start = "2024-10-16"
end = "2030-12-19"

[[trusted.aranya-runtime]]
criteria = "safe-to-deploy"
user-id = 293722 # aranya-project-bot
start = "2024-10-16"
end = "2030-12-19"

[[trusted.spideroak-crypto]]
criteria = "safe-to-deploy"
user-id = 293722 # aranya-project-bot
start = "2025-01-23"
end = "2026-06-13"
```

The trusted crates include:
- `aranya-crypto`, `aranya-crypto-derive`, `aranya-crypto-ffi`
- `aranya-runtime`, `aranya-client`, `aranya-daemon`, `aranya-daemon-api`
- `aranya-policy-*` (ast, compiler, derive, lang, module, vm, etc.)
- `aranya-fast-channels`, `aranya-buggy`, `aranya-trouble`
- `spideroak-crypto`, `spideroak-crypto-derive`, `spideroak-base58`
- And other internal crates

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

If all dependencies are covered by audits or exemptions, the check passes. If there are gaps, cargo-vet provides detailed output showing:

- Which crates need auditing
- Suggested actions to resolve gaps (marked as "Certain" or "Speculative")
- Available third-party audits that could fill gaps

### Understanding Check Output

When `cargo vet check` fails, the output categorizes suggestions:

- **Certain** - Actions that will definitely resolve the issue
- **Speculative** - Actions that may help but aren't guaranteed

Address issues top-down, starting with the first suggestion.

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
- For code-generating crates (build dependencies, proc macros), reasonable usage must output code meeting the above criteria

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

This shows only the changes between versions, which is much faster than reviewing the entire crate when updating from a previously-audited version.

Example workflow when updating a dependency:

```bash
# See what changed
cargo vet diff serde 1.0.193 1.0.195

# After review, certify the delta
cargo vet certify serde 1.0.193 1.0.195
```

## Recording Audits

### Certifying a Crate

After reviewing a crate, record the audit:

```bash
# Full audit of a specific version
cargo vet certify <crate> <version>

# Delta audit between versions
cargo vet certify <crate> <old-version> <new-version>
```

The command prompts for criteria and notes. Always provide meaningful notes explaining the rationale.

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

[[audits.tokio]]
who = "Bob Reviewer <bob@example.com>"
criteria = "safe-to-deploy"
delta = "1.35.0 -> 1.36.0"
notes = """
Minor release with bug fixes. Reviewed changes to task scheduler.
No new unsafe code. Memory ordering changes are correct.
"""
```

### Writing Effective Audit Notes

Notes should document the following key aspects:

1. **Unsafe code status** - Whether unsafe is used, forbidden, or documented
2. **Network access** - Any networking code present
3. **File I/O** - Any filesystem operations and their scope
4. **Key findings** - Notable patterns or areas of concern

When certifying, cargo-vet will prompt you with the criteria definition reminding you what to verify. For `safe-to-deploy`, you must "review enough to fully reason about the behavior of all unsafe blocks and usage of powerful imports."

Example notes from real audits:

```toml
# Parser/encoder crate - document unsafe, network, and file I/O status
[[audits.asn1-rs]]
who = "Developer <dev@example.com>"
criteria = "safe-to-deploy"
version = "0.7.1"
notes = """
Parser/encoder for ASN.1 BER/DER data. Unsafe code is forbidden.
No networking code. Reader/writer interface provided for
serializing/deserializing types to/from files.
"""

# Proc macro crate - note compile-time execution
[[audits.asn1-rs-derive]]
who = "Developer <dev@example.com>"
criteria = "safe-to-deploy"
version = "0.6.0"
notes = "Derive macros for asn1-rs. No unsafe, networking, or file I/O code."

# Crate with documented unsafe
[[audits.deranged]]
who = "Developer <dev@example.com>"
criteria = "safe-to-deploy"
delta = "0.4.0 -> 0.5.5"
notes = """
Improvements to API ergonomics. Adds a DefaultOutput trait.
Documented use of unsafe code. No network or file I/O code.
"""

# Data encoding crate - note where unsafe is used
[[audits.data-encoding]]
who = "Developer <dev@example.com>"
criteria = "safe-to-deploy"
version = "2.9.0"
notes = """
Data encoding such as base64. No network or file I/O code.
Unsafe is used for direct buffer manipulation when encoding.
"""

# Certificate/crypto related crate
[[audits.x509-parser]]
who = "Developer <dev@example.com>"
criteria = "safe-to-deploy"
version = "0.18.0"
notes = """
X.509 parser. Unsafe code forbidden. We rely on PEM parsing for
the certgen tool. No networking or file I/O code.
"""

# System interface crate - more thorough notes needed
[[audits.sysinfo]]
who = "Developer <dev@example.com>"
criteria = "safe-to-deploy"
version = "0.36.1"
notes = """
This crate does what it says, using a lot of system API calls
(some unofficially documented; for example, Windows doesn't publicly
provide a way to get info from other processes so it has to use ntapi).
It's segmented well so only the code for the platform being compiled
for gets added. This does use a lot of unsafe for the above reason of
needing to make a bunch of system API calls, some of which are calling
into other languages like Objective-C, but I didn't see anything
obviously malicious or incorrect.
"""

# Serialization crate with unsafe for performance
[[audits.postcard]]
who = "Developer <dev@example.com>"
criteria = "safe-to-deploy"
version = "1.1.3"
notes = """
I have audited both the 1.1.1 codebase, as well as the 1.1.3 delta.
Most changes were nominal, this crate does what it says on the tin.
There is a handful of unsafe, but to my knowledge it's both commented
to explain the rationale and seems safe on first glance, mostly used
to remove bounds checks to make it run faster since it's basically
a compression library.
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

If you discover a crate version that fails criteria:

```bash
cargo vet record-violation <crate> <version>
```

This prevents the version from being used and warns other projects importing your audits.

## Best Practices for Reviews

### Audit Checklist

When auditing a crate, systematically check each of these areas and document your findings in the notes:

#### 1. Unsafe Code

Search for `unsafe` blocks and evaluate each one:

```bash
# In the crate source directory
grep -rn "unsafe" --include="*.rs" .
```

For each unsafe block, verify:
- Is the safety invariant documented in a `// SAFETY:` comment?
- Are the preconditions actually guaranteed by the calling code?
- Could the unsafe code be triggered by malicious input?

Document in notes: "Unsafe code is forbidden" or "Documented use of unsafe for [purpose]" or "Contains unsafe in [location] for [reason]"

#### 2. Network Access

Search for networking code:

```bash
grep -rn "TcpStream\|UdpSocket\|reqwest\|hyper\|http::\|https::\|connect\|bind" --include="*.rs" .
```

Check for:
- HTTP/HTTPS clients
- Socket operations
- DNS lookups
- Any outbound connections

Document in notes: "No networking code" or "Makes requests to [destination] for [purpose]"

#### 3. File I/O

Search for filesystem operations:

```bash
grep -rn "std::fs\|File::\|read_to_string\|write_all\|OpenOptions\|create_dir\|remove" --include="*.rs" .
```

Check for:
- File reads/writes
- Directory operations
- Path traversal vulnerabilities
- Whether I/O is scoped to expected locations

Document in notes: "No file I/O code" or "Reader/writer interface for caller to manage I/O" or "Reads [what] from [where]"

#### 4. Build Scripts (`build.rs`)

Build scripts run during compilation with full system access:

```bash
# Check if build.rs exists
ls build.rs 2>/dev/null && echo "Has build script"
```

If present, examine for:
- Network downloads (downloading code at build time)
- Arbitrary code execution
- Writing outside of `OUT_DIR`
- Environment variable manipulation

#### 5. Proc Macros

Procedural macros run at compile time. Check `Cargo.toml`:

```bash
grep "proc-macro" Cargo.toml
```

Proc macros warrant thorough review because they:
- Execute arbitrary code during compilation
- Can access the filesystem and network
- Have access to the full compilation environment

#### 6. FFI and External Dependencies

Check for foreign function interfaces:

```bash
grep -rn "extern \"C\"\|#\[link\]\|bindgen\|cc::Build" --include="*.rs" .
```

FFI code needs review of:
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
- Build scripts that download or execute code
- Suspiciously complex code for simple functionality

### Review Depth by Crate Type

**High scrutiny:**
- Proc macros and build scripts (compile-time code execution)
- Crypto crates
- Network/async runtime crates
- Crates with significant unsafe code

**Standard review:**
- Application logic crates
- Data structure implementations
- Serialization libraries

**Light review (for delta audits):**
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
4. **Document your own findings** - Audit notes should reflect your manual review, not just AI-generated summaries.

The responsibility for the audit remains with the human reviewer. AI is a tool to help you be more thorough, not a way to delegate the review.

## Maintenance

### Pruning Unused Entries

When dependencies are removed from the project, their audits and exemptions become stale. Use `cargo vet prune` to clean up entries for dependencies no longer in use:

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

## Typical Audit Workflow

### Full Audit of a New Crate

```bash
# 1. Check what needs auditing
cargo vet check

# 2. Inspect the crate source
cargo vet inspect some-crate 1.0.0

# 3. Review using the checklist above, then certify
cargo vet certify some-crate 1.0.0
```

When you run `cargo vet certify`, it will:
1. Guess the appropriate criteria based on your current `check` or `suggest` status
2. Display the criteria definition (reminding you what to verify)
3. Prompt for notes
4. Automatically remove any exemption that's no longer needed

### Delta Audit When Updating

```bash
# 1. See the diff between versions
cargo vet diff some-crate 1.0.0 1.1.0

# 2. Review changes, focusing on:
#    - New unsafe code
#    - New dependencies
#    - Changes to network/file I/O
#    - Changes to build.rs or proc macros

# 3. Certify the delta
cargo vet certify some-crate 1.0.0 1.1.0
```

For delta audits, verify that the changes preserve the criteria properties. Don't just check that the diff "looks okay" - confirm that security-relevant properties are maintained.

### Viewing Crate Source

Multiple viewing modes are available:

```bash
# Download and open locally (default)
cargo vet inspect some-crate 1.0.0 --mode local

# View on Sourcegraph
cargo vet inspect some-crate 1.0.0 --mode sourcegraph

# View on diff.rs
cargo vet inspect some-crate 1.0.0 --mode diff.rs
```

## Pull Request Responsibilities

### PR Author Responsibilities

The PR author who adds or updates a dependency is responsible for the audit:

1. **Manually review all dependency changes** - Use `cargo vet inspect` for new crates or `cargo vet diff` for version updates. Do not skip this step.

2. **Run `cargo vet check` locally** - Verify all dependencies pass before pushing.

3. **Certify or exempt dependencies** - Use `cargo vet certify` after reviewing, or `cargo vet add-exemption` for trusted publishers.

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

We run cargo-vet as part of our security checks in CI. This blocks PRs that introduce unaudited dependencies.

### GitHub Actions Workflow

The security checks are defined in `.github/workflows/security.yml`:

```yaml
name: "Security Checks"

permissions:
  contents: read

on:
  push:
    branches: ["main"]
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  security-checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: ./.github/actions/setup

      - name: Run cargo security checks
        run: cargo make security
```

### Cargo Make Tasks

We use [cargo-make](https://github.com/sagiegurari/cargo-make) to define our build tasks. The security task runs three checks in sequence:

In `Makefile.toml`:

```toml
[tasks.security]
category = "security"
description = "Run security checks"
run_task = { name = [
    "cargo-audit",
    "cargo-deny",
    "cargo-vet",
] }

[tasks.cargo-vet]
category = "security"
toolchain = "stable"
install_crate = { crate_name = "cargo-vet", version = "0.10.1", binary = "cargo-vet", test_arg = "-V" }
command = "cargo"
args = ["vet", "check"]
```

This configuration:
- Installs cargo-vet 0.10.1 automatically if not present
- Runs `cargo vet check` to verify all dependencies are audited
- Fails the CI job if any unaudited dependencies are found

### Running Security Checks Locally

Before pushing changes, run the security checks locally:

```bash
# Run all security checks (audit, deny, vet)
cargo make security

# Or run just cargo-vet
cargo make cargo-vet

# Or run cargo-vet directly
cargo vet check
```

### When CI Fails Due to Unaudited Dependencies

If the security check fails because of a new or updated dependency:

1. **Check what's needed locally:**
   ```bash
   cargo vet check
   ```

2. **Review the crate** using inspect (for new crates) or diff (for updates):
   ```bash
   # For a new dependency
   cargo vet inspect some-crate 1.0.0

   # For an updated dependency
   cargo vet diff some-crate 1.0.0 1.1.0
   ```

3. **Certify or exempt** the dependency:
   ```bash
   # After reviewing, certify
   cargo vet certify some-crate 1.0.0

   # Or add a temporary exemption if you can't audit immediately
   cargo vet add-exemption some-crate 1.0.0
   ```

4. **Commit the supply-chain changes** with your PR:
   ```bash
   git add supply-chain/
   git commit -m "chore: audit some-crate 1.0.0"
   ```

### Other Security Checks

The `cargo make security` task also runs:

- **cargo-audit** - Checks for known security vulnerabilities in dependencies
- **cargo-deny** - Checks licenses, bans specific crates, and detects duplicate dependencies

## Quick Reference

| Task | Command |
|------|---------|
| Check audit status | `cargo vet check` |
| See backlog items | `cargo vet suggest` |
| Inspect a crate | `cargo vet inspect <crate> <version>` |
| View diff between versions | `cargo vet diff <crate> <v1> <v2>` |
| Certify a full audit | `cargo vet certify <crate> <version>` |
| Certify a delta audit | `cargo vet certify <crate> <v1> <v2>` |
| Add exemption | `cargo vet add-exemption <crate> <version>` |
| Trust a publisher | `cargo vet trust <crate> <publisher>` |
| Clean up unused entries | `cargo vet prune` |
| Format config files | `cargo vet fmt` |

## Summary

1. **Run `cargo vet check`** to identify audit gaps
2. **Use `cargo vet diff`** for incremental reviews when updating dependencies
3. **Document findings thoroughly** - note unsafe code, network access, and file I/O status
4. **Import audits** from trusted third parties to reduce duplication
5. **Trust internal publishers** (e.g., `aranya-project-bot`) for your own crates
6. **Use `cargo vet add-exemption`** for trusted publishers; use exemptions sparingly and work to reduce them over time
7. **Focus review effort** on high-risk crates (proc macros, build scripts, unsafe, crypto)
8. **Verify delta audits** preserve security properties, don't just check the diff looks okay
