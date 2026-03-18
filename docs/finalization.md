---
layout: page
title: BFT Consensus Finalization
permalink: "/finalization/"
---

# Finalization

This specification uses [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) keywords (MUST, MUST NOT, SHOULD, SHOULD NOT, MAY) for normative requirements.

## Overview

Finalization is the process by which commands become permanent. All ancestors of a Finalize command MUST become permanent once the command is committed to the graph. **[FIN-001]** Only commands in the ancestry of the Finalize command are considered finalized; commands on unmerged branches MUST NOT be finalized, and branches MUST NOT finalize in parallel. **[FIN-005, FIN-006]** Once finalized, commands MUST NOT be recallable by future merges. **[FIN-002]** Commands on branches that conflict with the finalized braid MUST be permanently recalled. **[FIN-008]** This bounds the impact of long partitions and adversarial branching by guaranteeing that accepted commands remain accepted.

Finalization has two components:

1. **Finalization policy** -- The on-graph commands, facts, and policy rules that enforce finalization invariants. Any device can verify a Finalize command independently.
2. **BFT consensus protocol** -- The off-graph protocol that drives agreement among finalizers on what to finalize. The consensus protocol produces the inputs (agreed-upon head, collected signatures) that the policy consumes.

## Terminology

| Term | Definition |
|---|---|
| Finalizer set | The group of devices authorized to participate in finalization consensus |
| Finalizer | A device in the finalizer set |
| Finalize command | A certified (multi-signature) graph command whose ancestors all become permanent. Certified commands have no author; each signature is a certifier. |
| Finalization round | The full process of producing a Finalize command for a specific sequence number. May contain multiple consensus rounds if proposals fail. |
| Consensus round | A single propose-prevote-precommit cycle within a finalization round. If the proposal fails or times out, the round number increments and a new consensus round begins with the next proposer. |
| Parent of the Finalize command | The graph command that the Finalize command is appended to. All ancestors of the Finalize command become permanent. Consensus decides this. |
| FactDB Merkle root | A hash over the entire FactDB state at a given point in the graph, represented in policy as a `FactRoot` struct (see [Policy Definitions](#policy-definitions)). Agreement on the Merkle root implies agreement on all derived state (sequence number, finalizer set, pending updates). |
| Proposer | The finalizer selected by the BFT protocol's deterministic round-robin to propose a parent for the Finalize command for a given consensus round |
| Prevote | First-stage vote indicating a finalizer considers the proposal valid |
| Precommit | Second-stage vote indicating a finalizer is ready to commit the proposal |
| Quorum (`q`) | The minimum number of finalizers required for a consensus decision |
| Sequence number (seq) | Identifies a finalization round; increments with each successful Finalize command |

### Formulas

| Variable | Formula | Description |
|---|---|---|
| `n` | | Finalizer set size (1 to 7) |
| `f` | `⌊(n - 1) / 3⌋` | Maximum number of Byzantine (malicious or faulty) finalizers the protocol can tolerate |
| `q` | `⌊(n * 2) / 3⌋ + 1` | Quorum size -- the minimum number of finalizers required for a consensus decision. Ensures safety as long as at most `f` finalizers are Byzantine. |

## Scope

Finalization MUST apply only to persistent control plane commands on the DAG -- the commands that manage team membership, roles, labels, and AFC channel configuration. Ephemeral commands and AFC data plane traffic MUST NOT be subject to finalization. **[FIN-003]**

## Design Goals

1. **Safety** -- A Finalize command requires a quorum of valid signatures from the current finalizer set. Because any two quorums overlap, no two valid conflicting Finalize commands can exist in the graph. Any device can independently verify a Finalize command by checking the signatures in its envelope.
2. **Availability** -- Finalization tolerates up to `f` faulty or offline finalizers. Non-finalizer devices continue operating normally (publishing commands, syncing) regardless of whether finalization is active.
3. **Periodic and on-demand** -- Finalization is triggered periodically (delay-based scheduling) or on demand (e.g. daemon restart). The BFT protocol selects the proposer automatically.

## Architecture

The finalization system spans multiple layers of the Aranya stack. The aranya-core runtime does not depend on or know about the consensus implementation. This separation allows applications to choose their own consensus algorithm if needed -- the finalization policy on the graph is consensus-agnostic and only cares that the Finalize command carries a valid quorum of signatures.

```
┌─────────────────────────────────────────────────────┐
│                    aranya-daemon                    │
│                                                     │
│  ┌───────────────────┐  ┌───────────────────┐       │
│  │ Consensus Manager │  │   Sync Manager    │       │
│  │                   │  │                   │       │
│  │ ┌───────────────┐ │  │ ┌───────────────┐ │       │
│  │ │  Consensus    │ │  │ │ Sync Protocol │ │       │
│  │ │  Protocol     │ │  │ │ (aranya-core) │ │       │
│  │ │ (aranya-core) │ │  │ └───────────────┘ │       │
│  │ └──────┬────────┘ │  │                   │       │
│  │        │          │  │                   │       │
│  │        ▼          │  │                   │       │
│  │ ┌───────────────┐ │  │                   │       │
│  │ │ Finalization  │ │  │                   │       │
│  │ │ Policy        │ │  │                   │       │
│  │ └───────────────┘ │  │                   │       │
│  └────────┬──────────┘  └────────┬──────────┘       │
│           │                      │                  │
│      ┌────┴──────────────────────┤                  │
│      ▼                           ▼                  │
│  ┌─────────────────┐  ┌──────────────────────────┐  │
│  │ aranya-core     │  │  QUIC Transport          │  │
│  │ Runtime         │  │  (shared by consensus    │  │
│  │                 │  │   and sync managers)     │  │
│  │ ┌─────────────┐ │  └──────────────────────────┘  │
│  │ │Finalization │ │                                │
│  │ │FFIs (plugin)│ │                                │
│  │ └─────────────┘ │                                │
│  └─────────────────┘                                │
└─────────────────────────────────────────────────────┘
```

Key architectural boundaries:

- **Consensus manager** and **sync manager** orchestrate their respective protocols and deliver messages via the shared QUIC transport. They are daemon-layer components.
- **Consensus protocol** and **sync protocol** are transport-agnostic crates in the `aranya-core` repository. Both produce and consume messages that the daemon delivers via the transport layer. Neither depends on QUIC directly.
- **QUIC transport** is shared by both managers. The daemon multiplexes consensus and sync streams on the same QUIC connections.
- **Finalization policy** is part of the daemon layer and depends on the aranya-core runtime.
- **Finalization FFIs** are an optional runtime plugin for operations the policy language cannot express directly (certified envelopes, quorum verification).

## Threat Model

### Fault Model

The consensus protocol assumes the standard BFT fault model: at most `f` of the `n` finalizers may be Byzantine (malicious or arbitrarily faulty). We do not know in advance which nodes are Byzantine. The protocol must be safe regardless of which nodes are faulty, and live as long as a quorum (`q`) of honest, online nodes can communicate.

### Why Multi-Party Finalization

Single-finalizer mode (where the owner is the sole finalizer) is used for the initial implementation. Multi-party consensus improves both availability and resilience to state loss. Availability improves because finalization authority is distributed across a set of finalizers rather than concentrated in a single device. Resilience to state loss improves because a single finalizer that loses its state (e.g. after a crash or restore from backup) could finalize a command that conflicts with a previous finalization, deadlocking the team; with multi-party consensus, a quorum of finalizers would all need to lose state for this to occur. The security of multi-party finalization is still bounded by devices with the `UpdateFinalizerSet` permission -- a compromised device with this permission can undermine the finalizer set in either model.

| Concern | Single finalizer (owner) | Multi-party (BFT) |
|---|---|---|
| **Availability** | Owner offline = finalization halts | Finalization authority is distributed across a finalizer set; finalization continues as long as a quorum of finalizers is online |
| **Compromised finalizer set manager** | Can finalize arbitrary state | Same -- a device with `UpdateFinalizerSet` permission can replace the finalizer set. Security is equivalent in both models. |
| **Compromised non-owner finalizer** | N/A (no other finalizers) | Requires quorum agreement; single compromised finalizer limited to liveness disruption |
| **Accountability** | No independent verification | Multiple independent verifications; misbehavior detectable via vote logs |

### Attack Vectors and Mitigations

| Attack | Description | Mitigation |
|---|---|---|
| **Malicious proposer** | Proposes an invalid or self-serving parent for the Finalize command | Every finalizer independently verifies the proposal and prevotes nil if invalid. Quorum cannot be reached without honest agreement. |
| **Blocking finalization** | Byzantine finalizer withholds votes to prevent quorum | Quorum requires `q`, not unanimity. Up to `f` unresponsive finalizers are tolerated. Offline proposer times out and rotation selects the next. |
| **Equivocation** | Finalizer sends conflicting votes in the same consensus round | Malachite detects equivocation with cryptographic evidence. Tendermint guarantees safety regardless. Owner can remove the finalizer via `UpdateFinalizerSet`. |
| **Compromised finalizer set manager** | Device with `UpdateFinalizerSet` permission replaces the set with devices they control | Owner is the trust anchor (determines initial set in `Init` and controls permission delegation). Two-phase update requires quorum to sync and agree before the change is applied. Operational controls (monitoring, access restriction) are the primary defense. |
| **Command hiding** | Malicious node withholds commands from finalizers to cause them to finalize an incomplete view of the graph | Mitigated by sufficient network connectivity -- non-malicious nodes forward commands to finalizers through other paths. The network is assumed well-connected enough that a single malicious node cannot deny availability of graph commands. |
| **Stale finalization** | Proposer finalizes a point far behind the current head | Only delays finalization of recent commands. Round-robin rotation gives the next proposer a chance. Persistent stale proposals are detectable in vote logs. |
| **Network partition** | Attacker isolates finalizers to cause conflicting finalizations | Quorum requirement ensures at most one partition can finalize. Minority partition halts finalization; graph operations continue. Devices converge when the partition heals. |
| **Replay / duplicate Finalize** | Attacker replays a valid Finalize command | The graph rejects duplicate commands with the same command ID. Different signature subsets produce the same command ID (payload-derived), so replays are identical commands. A forged Finalize with a different payload would fail the quorum signature check. |
| **Non-finalizer impersonation** | A non-finalizer node sends consensus messages to influence voting | All consensus messages are signed by the sender's signing key and verified against the current finalizer set. Messages from non-finalizers are dropped. |
| <a id="precommit-signature-safety"></a>**Precommit signature collection** | Byzantine node collects signatures from precommit messages and publishes a Finalize command before honest nodes observe the consensus decision | A quorum of precommit-signatures requires a quorum of precommits, which IS the Tendermint consensus decision. The Byzantine node can only publish a valid Finalize for the proposal that honest nodes voted for. Tendermint's locking mechanism (which operates at the prevote level) prevents two different proposals from each accumulating a quorum of precommit-signatures — any two quorums overlap by at least `f+1` honest nodes, and locked honest nodes will not sign a different proposal. The Byzantine fault tolerance threshold (`f` out of `n = 3f+1`) is unchanged. |
| **Malformed Finalize envelope** | Byzantine finalizer commits a Finalize command with a quorum of valid signatures plus injected invalid signatures (e.g., garbage signature at the start of the list) to cause other nodes to reject the command | `verify_certified_quorum` fails fast on any invalid signature, rejecting the entire command. This does not cause a denial of service: the malformed command is not added to honest nodes' graphs, so when an honest finalizer later syncs a valid Finalize command with the same command ID, it is accepted normally. An honest node never produces an envelope with invalid signatures, so failing fast avoids unnecessary computation without affecting availability. |

## Finalizer Set

The finalizer set is the group of devices authorized to participate in finalization consensus. Finalizer devices do not need to be members of the team -- they only need a signing key to participate in consensus and can sync graph commands like any other device. This allows dedicated finalization infrastructure that is separate from the team's member devices. The team creator (or owner, for later updates) must know the finalizer's public signing key at the time the finalizer is added to the set. The finalizer set can only be changed by devices with the `UpdateFinalizerSet` permission through a dedicated `UpdateFinalizerSet` command.

In the future, finalizers may not need to be devices at all, since all that matters is a signing key. For MVP, finalizers are assumed to be devices.

### Initialization

The initial finalizer set MUST be established in the team's `Init` command. **[FSET-001]** The `Init` command MUST support 1 to 7 optional finalizer fields (`finalizer1` through `finalizer7`), each containing a public signing key. **[FSET-002]** The caller specifies 1 to 7 finalizers. If no finalizers are specified in `Init`, the team owner's public signing key MUST be used as the sole initial finalizer. **[FSET-003]** All specified finalizer keys MUST be unique and valid public signing keys. **[FSET-011]**

Public signing keys (not key IDs) are stored on-graph because they are required for signature verification during consensus. The finalizer count and quorum are stored explicitly in the `FinalizerSet` fact so that the consensus protocol does not need to derive them implicitly.

### Set Size and Quorum

The maximum supported finalizer set size MUST be 7 for the initial implementation. **[FSET-004]** The BFT algorithm supports any size, but the policy language's lack of collection types requires fixed fields (one per finalizer). 7 fields provides up to 2 Byzantine fault tolerance while keeping the policy definitions manageable. (Malachite refers to the finalizer set as the "validator set".)

Quorum size MUST be `⌊(n * 2) / 3⌋ + 1` where `n` is the finalizer set size. **[FSET-005]** The daemon computes this using malachite's `ThresholdParam::min_expected` and passes it as an action field (see [Finalizer Set Validation](#finalizer-set-validation)). Quorum values for each set size (see [Formulas](#formulas)):

| `n` | `f` | `q` |
|---|---|---|
| 1 | 0 | 1 |
| 2 | 0 | 2 |
| 3 | 0 | 3 |
| 4 | 1 | 3 |
| 5 | 1 | 4 |
| 6 | 1 | 5 |
| 7 | 2 | 5 |

Sizes following `n = 3f + 1` (`1`, `4`, `7`) give maximum fault tolerance for the fewest nodes.

### Changing the Finalizer Set

The finalizer set is changed through a two-phase process. Only devices with the `UpdateFinalizerSet` permission MUST be allowed to publish an `UpdateFinalizerSet` command. **[FSET-009]**

1. **Request phase.** An `UpdateFinalizerSet` command MUST NOT immediately change the active finalizer set. **[FSET-006]** Instead, it MUST create a `PendingFinalizerSetUpdate` fact that stages the new set. All specified finalizer keys in an `UpdateFinalizerSet` command MUST be unique and valid public signing keys.
2. **Apply phase.** The next `Finalize` command MUST automatically apply any pending finalizer set update by replacing the `FinalizerSet` fact with the values from the pending update and consuming the `PendingFinalizerSetUpdate` fact. **[FSET-007]** Because all finalizers agree on the same parent command during consensus, and the FactDB is deterministic for a given parent, they are guaranteed to agree on whether a pending update exists. If no pending update exists, finalization proceeds without changing the set.

This two-phase approach ensures that all finalizers have a globally consistent view of the finalizer set at each consensus round. If the `UpdateFinalizerSet` command directly modified the `FinalizerSet` fact, different finalizers could have different views of the set depending on which graph commands they had synced, causing quorum verification to produce inconsistent results across devices. Agreement on a common parent during consensus ensures all finalizers share the same FactDB state (including any pending update) before voting.

The set can grow or shrink freely, but once a team has 4 or more finalizers, the set MUST NOT shrink below 4. **[FSET-008]** 4 is the smallest set size with Byzantine fault tolerance (f=1), so this prevents losing BFT safety once established.

The owner determines the initial set in `Init` and controls which devices receive the `UpdateFinalizerSet` permission.

Because set changes are only applied atomically by `Finalize` commands, the finalizer set is always globally consistent -- all devices that have processed the same `Finalize` commands agree on the same set.

If a second `UpdateFinalizerSet` is published before the next finalization, the `PendingFinalizerSetUpdate` fact MUST be replaced with the new values. **[FSET-010]** The next finalization round picks up whatever pending update exists at that point.

**Known limitation:** Because finalizer set changes are applied through the `Finalize` command, a set change cannot proceed if finalization itself is stalled.

## Finalization Policy

This section defines the on-graph commands, facts, and policy rules that enforce finalization. The policy is evaluated independently by every device -- it does not depend on or interact with the off-graph consensus protocol.

### Certified Commands

The Finalize command MUST use certified authentication instead of single-author authentication. **[CERT-001]** Each signature represents a certifier -- a finalizer that endorsed the command. Certified commands have no author. This is necessary because finalization represents agreement by a quorum of finalizers, not the action of a single device.

This requires a **new command type** in the `aranya-core` runtime. Existing commands assume a single author with a single signature, and the command ID is computed over the serialized fields, command name, parent ID, author sign ID, and signature. The certified command type differs in two ways: it extends the envelope to carry multiple certifier signatures instead of one, and the command ID MUST be computed from the payload only — excluding signatures and signer identities. This exclusion is critical because different finalizers may independently commit the same Finalize command with different signature subsets, and all must produce the same command ID.

Key properties of certified commands:

- **Signatures MUST be stored in the envelope, not the payload.** **[CERT-002]** The envelope MUST carry up to 7 optional `(signing_key_id, signature)` pairs, matching the maximum finalizer set size. The payload contains only the command fields (factdb_merkle_root). Unlike regular commands (where the command ID includes the author sign ID and signature), the certified command ID MUST be computed from the payload only — excluding all signatures and signer identities. Different valid subsets of certifier signatures MUST produce the same command ID for the same payload. **[CERT-003]**
- **Multiple certifiers.** Instead of a single `get_author()` check, the policy verifies that the envelope contains a quorum of valid signatures from the current finalizer set. Each signature is a certifier endorsing the command.
- **Construction and verification are separated.** Unlike regular commands where seal and open are both policy blocks, certified commands split these responsibilities:
  - **Construction (daemon-side):** The daemon constructs the certified envelope using a dedicated finalization runtime module (see [Certified Command Implementation](#certified-command-implementation)). This happens outside the policy pipeline — there is no seal block for certified commands.
  - **Verification (policy-side):** The policy has `open_certified(envelope)` and `verify_certified_quorum(envelope, finalizer_set)` FFIs to verify and process the pre-built envelope (see [New FFIs](#new-ffis)).

#### Certified Command Implementation

Certified command construction is handled by a dedicated **finalization runtime module** in `aranya-core` that abstracts the certified command lifecycle. The daemon calls this module to construct envelopes and sign commands; the policy VM calls it (via FFIs) to verify them. The module internally uses `aranya-crypto` for digest computation and signing, keeping the daemon decoupled from low-level crypto details.

**Digest and ID computation.** Certified commands use a two-layer hash structure that parallels regular commands but excludes author and signature:

```
certified_digest = H("CertifiedPolicyCommand-v1", command_name, parent_id, payload)
certified_cmd_id = H("CertifiedCommandId-v1", certified_digest)
```

Compare with regular commands: `digest = H("SignPolicyCommand-v1", author_sign_id, command_name, parent_id, payload)` and `cmd_id = H("PolicyCommandId-v1", digest, signature)`. The different domain separators prevent cross-protocol attacks (a regular command signature cannot be reused as a certified command signature, and vice versa). The exclusion of `author_sign_id` and `signature` ensures all certifiers produce the same digest and the same command ID regardless of who signs or which signatures are included.

**`CertifiedEnvelope` struct:**

```rust
struct CertifiedEnvelope {
    parent_id: CmdId,
    command_id: CmdId,
    command_name: String,
    payload: Vec<u8>,              // Serialized command fields
    certifier_signatures: Vec<(SigningKeyId, Signature)>,  // Up to 7 pairs
    // No author_id — certified commands have no author
}
```

**Finalization runtime module (new crate or module in `aranya-core`):**

Daemon-facing API (construction):
- `certified_command_id(command_name, parent_id, payload)` → `CmdId` -- Computes the certified digest and derives the command ID as described above. Used by the proposer to include the command ID in the proposal, and by each finalizer to verify it matches before signing.
- `sign_certified(signing_key, command_name, parent_id, payload)` → `(SigningKeyId, Signature)` -- Computes the certified digest and signs it with the provided signing key. Returns the signer's key ID and signature. Each certifier signs the same digest, producing a different signature over identical content. Used by each finalizer during the precommit phase.
- `build_certified_envelope(command_name, parent_id, payload, signatures)` → `CertifiedEnvelope` -- Constructs the complete envelope. Computes the command ID internally via `certified_command_id`. The `signatures` parameter contains all `(SigningKeyId, Signature)` pairs collected from precommit messages. Used by each finalizer when committing the Finalize command.

Policy-facing API (verification, exposed as FFIs):
- `open_certified(envelope)` → deserialized command fields -- Recomputes `certified_command_id(command_name, parent_id, payload)` from the envelope's fields and verifies it matches the envelope's `command_id`. Returns an error if the ID does not match (indicating a tampered or malformed envelope). On success, deserializes and returns the command fields. Does not verify certifier signatures — that is handled separately by `verify_certified_quorum`.
- `verify_certified_quorum(envelope, finalizer_set)` -- Verifies a quorum of valid certifier signatures (see [New FFIs](#new-ffis) for detailed behavior including fail-fast optimizations).

**Runtime action API:**
- A new action type MUST accept a pre-built `CertifiedEnvelope` and a parent command ID for commit. **[CMT-004]** The runtime:
  1. Verifies the specified parent exists in the local graph (action-at-parent).
  2. Skips the seal block — the envelope is already constructed by the daemon.
  3. Runs the command's `open` block (`open_certified`) to verify the command ID and deserialize the payload.
  4. Runs the command's `policy` block (quorum verification, Merkle root check, sequence check, pending update application).
  5. If all checks pass, commits the command to the graph at the specified parent.

### Finalize Command

The set of commands that happen before a Finalize command is strictly the set of its ancestors. This makes all ancestors permanent. The Finalize command is the only graph command produced by finalization.

Properties:

- **Priority**: The Finalize command MUST carry the `finalize: true` attribute, which gives it the highest possible priority in the braid -- higher than any numeric priority value any other command can hold. **[FPOL-001]** This priority is not a numeric value -- it is enforced by the runtime as an absolute ordering above all other commands. The runtime's braid ordering logic MUST recognize this attribute as a special case and sort any command carrying it before all siblings regardless of their numeric priority. This is distinct from the existing numeric priority system and requires a dedicated ordering rule in the braid construction code. Other commands may be appended to the same parent as siblings, but the `finalize: true` attribute guarantees the Finalize command precedes them. The runtime MUST ensure that finalized commands can never be preceded by new commands in the braid -- this is enforced by the `finalize: true` attribute's braid ordering guarantee combined with the requirement that new commands can only be appended to the Finalize command or its descendants. **[FIN-007]**
- **Fields**:
  - The Finalize command MUST contain exactly one payload field: `factdb_merkle_root` (typed as `struct FactRoot`) **[FPOL-002]** -- the FactDB Merkle root at the parent of the Finalize command. The parent position in the graph is determined by action-at-parent (see [Action-at-Parent](#action-at-parent)), not by a payload field. Everything else is either implicit in the DAG position or derivable from the FactDB state that the Merkle root certifies (sequence number from `LatestFinalizeSeq`, finalizer set from the `FinalizerSet` fact, pending updates from `PendingFinalizerSetUpdate`). Finalizers independently compute this from their local FactDB and verify it matches before voting in consensus (see [Pre-Consensus Validation](#pre-consensus-validation)). The Merkle root also enables FactDB distribution: new members can receive the FactDB at a finalization point and verify it against the Merkle root without replaying the entire graph (see [Future Work](#future-work)).
- **Envelope**: Contains multiple `(signing_key_id, signature)` pairs from the finalizers that certified this command. Only finalizers that participated are included.
- **Policy checks**:
  - The Finalize command policy MUST verify that the envelope contains a quorum of valid signatures from unique members of the current finalizer set (via `verify_certified_quorum`). **[FPOL-003]**
  - The Finalize command policy MUST verify that the `factdb_merkle_root` matches the FactDB Merkle root at the parent of the Finalize command (obtained via the `verify_factdb_merkle_root` FFI). **[FPOL-004]**
  - The derived sequence number (`LatestFinalizeSeq.seq + 1`) MUST be sequential.
- **Side effects**:
  - The Finalize command MUST update the `LatestFinalizeSeq` singleton fact to the next sequence number, derived as `LatestFinalizeSeq.seq + 1`. **[FPOL-005]**
  - If a `PendingFinalizerSetUpdate` fact exists when the Finalize command is evaluated, the Finalize command MUST apply it atomically (see [Changing the Finalizer Set](#changing-the-finalizer-set)). **[FPOL-006]** Agreement on the parent guarantees all finalizers agree on whether a pending update exists.
  - The Finalize command MUST emit a `FinalizerSetChanged` effect containing the current `FinalizerSet` so the daemon can update its consensus participation state and peer set. **[FPOL-009]**

### Finalize Ordering Guarantee

All Finalize commands in the graph MUST form a chain -- for any two Finalize commands, one MUST be an ancestor of the other. **[FIN-004]** Policy MUST reject Finalize commands with a duplicate sequence number; multiple Finalize commands MAY exist in the graph as part of the finalization chain, but no two MAY share the same seq. **[FPOL-007]** This is enforced by:

1. The BFT consensus protocol ensures only one Finalize command is produced per finalization round.
2. The sequence number is derived from the FactDB (`LatestFinalizeSeq.seq + 1`), so each Finalize command deterministically advances the sequence. Since the `LatestFinalizeSeq` is updated by the prior Finalize command, the new Finalize MUST be a descendant of it in the graph. Because finalization covers ancestors, and each Finalize is a descendant of the prior one, the finalized set can only grow forward -- it is impossible to finalize an older point after a newer one.
3. Multiple finalizers committing the same Finalize produce the same command ID (see [Certified Commands](#certified-commands)). When synced to other nodes, the graph rejects duplicate commands with the same ID at the graph layer — no weaving or policy evaluation occurs for the duplicate.


### Action-at-Parent

The Finalize command must be committed at a specific parent — the graph command that consensus agreed upon — rather than at the current head of the graph. This is necessary because unrelated commands may arrive between consensus completing and the Finalize command being committed. If the Finalize command were always appended to the head, the parent could change from what was agreed upon, invalidating the FactDB Merkle root.

This requires a change to the runtime's action API. Currently, all actions append to the head of the graph. The runtime's action API MUST accept an optional parent parameter: **[CMT-003]**

- **`action(command, parent: None)`** — Current behavior. The command MUST be appended to the head of the graph. All existing commands continue to use this mode.
- **`action(command, parent: Some(command_id))`** — The command MUST be appended to the specified parent instead of the head. The runtime MUST verify the specified parent exists in the local graph before committing; if it does not exist, the action MUST fail.

The Finalize command is the only command that uses the explicit parent mode. The daemon passes the agreed-upon parent from consensus when committing the Finalize command.

Action-at-parent may create a sibling of the current head (increasing graph width), since other commands may have been appended to the head after the agreed-upon parent. This does not violate graph width assumptions in a meaningful way for finalization, because the `finalize: true` attribute ensures the Finalize command is always ordered first among siblings in the braid. The next command any device appends will be a descendant of the Finalize command (or a descendant of a later head), so graph width returns to normal immediately.

### FactDB Merkle Root Verification

The `verify_factdb_merkle_root` FFI obtains the current FactDB Merkle root and compares it to the expected value. The runtime implements this FFI using the storage API, which computes the Merkle root incrementally and stores it on disk as part of the storage format.

Before consensus, each finalizer validates the proposal using an ephemeral command that verifies the Merkle root without persisting anything to the graph:

```policy
ephemeral command VerifyFinalizationProposal {
    fields {
        factdb_merkle_root struct FactRoot,
    }

    seal { return seal(serialize(this)) }
    open { return deserialize(open(envelope)) }

    policy {
        check team_exists()

        // Verify the proposer's claimed Merkle root matches our local FactDB state.
        check verify_factdb_merkle_root(this.factdb_merkle_root)
    }
}
```

The finalizer evaluates this ephemeral command at the proposed parent. If it succeeds, the Merkle roots match and the finalizer proceeds to vote. If it fails, the finalizer prevotes nil.

### Policy Definitions

#### FactRoot Struct

The FactDB Merkle root is wrapped in a policy struct to provide compile-time type safety. This prevents accidental mixing with other `bytes` values and makes the intent explicit without requiring a new built-in type.

```policy
struct FactRoot {
    value bytes,
}
```

#### Facts

The following facts are used by the finalization commands. All are singleton facts (empty key `[]`).

```policy
fact FinalizerSet[]=>{
    num_finalizers int,
    quorum_size int,
    f1_pub_sign_key option[bytes],
    f2_pub_sign_key option[bytes],
    f3_pub_sign_key option[bytes],
    f4_pub_sign_key option[bytes],
    f5_pub_sign_key option[bytes],
    f6_pub_sign_key option[bytes],
    f7_pub_sign_key option[bytes],
}

fact LatestFinalizeSeq[]=>{seq int}

fact PendingFinalizerSetUpdate[]=> {
    num_finalizers int,
    quorum_size int,
    new_finalizer1_pub_sign_key option[bytes],
    new_finalizer2_pub_sign_key option[bytes],
    new_finalizer3_pub_sign_key option[bytes],
    new_finalizer4_pub_sign_key option[bytes],
    new_finalizer5_pub_sign_key option[bytes],
    new_finalizer6_pub_sign_key option[bytes],
    new_finalizer7_pub_sign_key option[bytes],
}
```

- **`FinalizerSet`** -- The current set of finalizers, their count, and the quorum size. Created by `Init`, updated by `Finalize` when a pending update exists.
- **`LatestFinalizeSeq`** -- The last completed finalization sequence number. Created at 0 by `Init`, incremented by each `Finalize` command.
- **`PendingFinalizerSetUpdate`** -- Stages a finalizer set change. Created by `UpdateFinalizerSet`, consumed by the next `Finalize` command.

#### Init Command Changes

The `Init` command is extended with finalizer fields (see [Initialization](#initialization)). The `Init` command MUST create an initial `LatestFinalizeSeq` singleton fact with seq 0 so the first Finalize command's sequential check has no special case. **[FPOL-008]**

See [Finalizer Set Validation](#finalizer-set-validation) for validation details.

```policy
command Init {
    fields {
        // ... existing fields ...
        finalizer1_pub_sign_key option[bytes],
        finalizer2_pub_sign_key option[bytes],
        finalizer3_pub_sign_key option[bytes],
        finalizer4_pub_sign_key option[bytes],
        finalizer5_pub_sign_key option[bytes],
        finalizer6_pub_sign_key option[bytes],
        finalizer7_pub_sign_key option[bytes],
        // Quorum size computed by the daemon from the consensus
        // protocol (malachite ThresholdParam::min_expected).
        quorum_size int,
    }

    // ... existing seal/open ...

    policy {
        // ... existing init logic ...

        // Validate finalizer set (1 to 7 finalizers).
        // Returns the count of non-None keys, or an error if
        // no keys are provided or duplicates are found.
        // The runtime defaults to the team owner's signing key
        // before creating this command if none are provided.
        let n = validate_finalizer_keys(
            this.finalizer1_pub_sign_key, this.finalizer2_pub_sign_key,
            this.finalizer3_pub_sign_key, this.finalizer4_pub_sign_key,
            this.finalizer5_pub_sign_key, this.finalizer6_pub_sign_key,
            this.finalizer7_pub_sign_key,
        )

        finish {
            create LatestFinalizeSeq[]=>{seq: 0}
            create FinalizerSet[]=>{
                num_finalizers: n,
                quorum_size: this.quorum_size,
                f1_pub_sign_key: this.finalizer1_pub_sign_key,
                f2_pub_sign_key: this.finalizer2_pub_sign_key,
                f3_pub_sign_key: this.finalizer3_pub_sign_key,
                f4_pub_sign_key: this.finalizer4_pub_sign_key,
                f5_pub_sign_key: this.finalizer5_pub_sign_key,
                f6_pub_sign_key: this.finalizer6_pub_sign_key,
                f7_pub_sign_key: this.finalizer7_pub_sign_key,
            }
        }
    }
}
```

#### Finalize Command

```policy
command Finalize {
    attributes {
        finalize: true
    }

    fields {
        factdb_merkle_root struct FactRoot,
    }

    // No seal block — the daemon constructs the certified envelope
    // directly using the finalization runtime module.
    open { return deserialize(open_certified(envelope)) }

    policy {
        check team_exists()

        // Look up the current finalizer set for quorum verification.
        let finalizer_set = lookup FinalizerSet[]

        // Verify that the envelope has a quorum of valid, unique
        // certifier signatures from the finalizer set.
        check verify_certified_quorum(envelope, finalizer_set)

        // Verify the FactDB Merkle root matches the locally computed root.
        check verify_factdb_merkle_root(this.factdb_merkle_root)

        // Derive the next sequence number from the LatestFinalizeSeq singleton.
        let latest = lookup LatestFinalizeSeq[]
        let next_seq = latest.seq + 1

        // Check for a pending finalizer set update before the finish block.
        // Agreement on the parent guarantees all finalizers agree on
        // whether a pending update exists.
        let pending = lookup PendingFinalizerSetUpdate[]

        // Policy terminates after executing a finish block, so use
        // branching to handle both cases in a single finish.
        if pending is some {
            finish {
                update LatestFinalizeSeq[] to {seq: next_seq}
                update FinalizerSet[] to {
                    num_finalizers: pending.num_finalizers,
                    quorum_size: pending.quorum_size,
                    f1_pub_sign_key: pending.new_finalizer1_pub_sign_key,
                    f2_pub_sign_key: pending.new_finalizer2_pub_sign_key,
                    f3_pub_sign_key: pending.new_finalizer3_pub_sign_key,
                    f4_pub_sign_key: pending.new_finalizer4_pub_sign_key,
                    f5_pub_sign_key: pending.new_finalizer5_pub_sign_key,
                    f6_pub_sign_key: pending.new_finalizer6_pub_sign_key,
                    f7_pub_sign_key: pending.new_finalizer7_pub_sign_key,
                }
                delete PendingFinalizerSetUpdate[]
                emit FinalizerSetChanged {finalizer_set: finalizer_set}
            }
        } else {
            finish {
                update LatestFinalizeSeq[] to {seq: next_seq}
                emit FinalizerSetChanged {finalizer_set: finalizer_set}
            }
        }
    }
}
```

#### UpdateFinalizerSet Command

The `UpdateFinalizerSet` command stages a finalizer set change (see [Changing the Finalizer Set](#changing-the-finalizer-set)). Only devices with the `UpdateFinalizerSet` permission can publish it.

```policy
command UpdateFinalizerSet {
    fields {
        new_finalizer1_pub_sign_key option[bytes],
        new_finalizer2_pub_sign_key option[bytes],
        new_finalizer3_pub_sign_key option[bytes],
        new_finalizer4_pub_sign_key option[bytes],
        new_finalizer5_pub_sign_key option[bytes],
        new_finalizer6_pub_sign_key option[bytes],
        new_finalizer7_pub_sign_key option[bytes],
        // Quorum size computed by the daemon from the consensus
        // protocol (malachite ThresholdParam::min_expected).
        quorum_size int,
    }

    seal { return seal(serialize(this)) }
    open { return deserialize(open(envelope)) }

    policy {
        check team_exists()

        // Only devices with the UpdateFinalizerSet permission can update the set.
        let author = get_author(envelope)
        check has_permission(author, UpdateFinalizerSet)

        // Validate the new finalizer set.
        // Returns the count of non-None keys, or an error if
        // no keys are provided or duplicates are found.
        let new_count = validate_finalizer_keys(
            this.new_finalizer1_pub_sign_key, this.new_finalizer2_pub_sign_key,
            this.new_finalizer3_pub_sign_key, this.new_finalizer4_pub_sign_key,
            this.new_finalizer5_pub_sign_key, this.new_finalizer6_pub_sign_key,
            this.new_finalizer7_pub_sign_key,
        )

        // Once a team has 4+ finalizers, it cannot shrink below 4.
        let current = lookup FinalizerSet[]
        if current.num_finalizers >= 4 {
            check new_count >= 4
        }

        // Stage the update. The next Finalize command will apply it
        // automatically. If a pending update already exists, replace it.
        let existing = lookup PendingFinalizerSetUpdate[]
        if existing is some {
            finish {
                delete PendingFinalizerSetUpdate[]
                create PendingFinalizerSetUpdate[]=>{
                    num_finalizers: new_count,
                    quorum_size: this.quorum_size,
                    new_finalizer1_pub_sign_key: this.new_finalizer1_pub_sign_key,
                    new_finalizer2_pub_sign_key: this.new_finalizer2_pub_sign_key,
                    new_finalizer3_pub_sign_key: this.new_finalizer3_pub_sign_key,
                    new_finalizer4_pub_sign_key: this.new_finalizer4_pub_sign_key,
                    new_finalizer5_pub_sign_key: this.new_finalizer5_pub_sign_key,
                    new_finalizer6_pub_sign_key: this.new_finalizer6_pub_sign_key,
                    new_finalizer7_pub_sign_key: this.new_finalizer7_pub_sign_key,
                }
            }
        } else {
            finish {
                create PendingFinalizerSetUpdate[]=>{
                    num_finalizers: new_count,
                    quorum_size: this.quorum_size,
                    new_finalizer1_pub_sign_key: this.new_finalizer1_pub_sign_key,
                    new_finalizer2_pub_sign_key: this.new_finalizer2_pub_sign_key,
                    new_finalizer3_pub_sign_key: this.new_finalizer3_pub_sign_key,
                    new_finalizer4_pub_sign_key: this.new_finalizer4_pub_sign_key,
                    new_finalizer5_pub_sign_key: this.new_finalizer5_pub_sign_key,
                    new_finalizer6_pub_sign_key: this.new_finalizer6_pub_sign_key,
                    new_finalizer7_pub_sign_key: this.new_finalizer7_pub_sign_key,
                }
            }
        }
    }
}
```

#### New FFIs

FFI functions must be pure functions — they take inputs and return outputs without side effects. Each FFI below exists because the operation cannot be expressed in the policy language. All fact operations and effect emissions are performed in policy code.

- **`validate_finalizer_keys(f1..f7)`** -- Takes up to 7 `option[bytes]` keys. Returns the count of non-None keys on success, or an error if no keys are provided or if any non-None keys are duplicates. *Required as FFI because the policy language lacks iteration — counting non-None optional fields and checking all 21 pairwise combinations cannot be expressed inline.* Used by `Init` and `UpdateFinalizerSet` commands.
- **`verify_certified_quorum(envelope, finalizer_set)`** -- Verifies that the certified envelope contains a quorum of valid certifier signatures from the `FinalizerSet`. MUST fail fast if the number of signatures in the envelope is less than `finalizer_set.quorum_size` — this avoids verifying any signatures when quorum is impossible. Otherwise, verifies signatures one by one: matches each signing key ID against the public signing keys in the finalizer set, then verifies the signature against the command content. MUST return an error if any signature is invalid (bad signature, key not in finalizer set, or duplicate key) — an honest node would never produce an envelope with invalid signatures, so their presence indicates a malformed or tampered command. MUST stop verifying after `quorum_size` valid signatures and return success — remaining signatures beyond quorum do not need to be verified. *Required as FFI because cryptographic signature verification is not available in the policy language.*
- **`verify_factdb_merkle_root(expected_root)`** -- Compares the expected root against the current FactDB Merkle root. Returns true if the roots match. Used by both the `Finalize` command and the `VerifyFinalizationProposal` ephemeral command. *Required as FFI because the Merkle root is computed by the storage layer and passed into the policy VM via context — the policy language has no way to access storage-layer state directly.*
- **`open_certified(envelope)`** -- Verifies the certified command ID matches the payload and deserializes the fields. Does not verify certifier signatures — that is handled by `verify_certified_quorum` in the policy block. *Required as FFI because cryptographic envelope operations are not available in the policy language.*

#### Finalizer Set Validation

Both commands use `validate_finalizer_keys` to validate and count the provided keys. The `quorum_size` is passed as an action field, computed by the daemon using the consensus protocol's threshold parameters (malachite `ThresholdParam::min_expected`). This keeps the quorum formula outside of policy, so the policy does not embed assumptions about the consensus protocol.

- **Init command**: Calls `validate_finalizer_keys` (returns error or count). The `quorum_size` is provided by the daemon. The runtime defaults to the team owner's signing key before creating the command if none are specified by the caller.
- **UpdateFinalizerSet command**: Same key validation, plus policy enforces the no-shrink-below-4 rule: if the current `FinalizerSet` has 4+ finalizers, the new count must also be >= 4. The `quorum_size` is provided by the daemon.

#### Effects

The `Finalize` command MUST emit a `FinalizerSetChanged` effect containing the current `FinalizerSet` using the policy `emit` statement. The daemon listens for this effect to update its consensus participation state and peer set without re-querying the FactDB.

## BFT Consensus Protocol

This section defines the off-graph protocol that drives agreement among finalizers. The consensus protocol determines what to finalize and collects the signatures needed for the Finalize command. It does not directly interact with the graph -- it produces inputs that the finalization policy consumes.

The protocol is based on Tendermint and integrated via the [malachite](https://github.com/circlefin/malachite) library, which provides a standalone Rust implementation of the Tendermint algorithm. See [Library Selection](#library-selection) for the rationale.

### Initial Implementation

The initial implementation uses the team owner as the sole finalizer (single-finalizer mode). This provides finalization and truncation support without the complexity of multi-party BFT consensus. Teams can upgrade to a larger finalizer set (up to 7) when BFT safety is needed.

### Single Finalizer

When the finalizer set contains exactly one member, the BFT consensus protocol MUST be skipped. **[CONS-009]** The sole finalizer MUST publish a `Finalize` command directly using the generalized certified command type with a single signature. This satisfies the quorum check (quorum of 1 is 1) and keeps the command type consistent regardless of finalizer set size.

This is safe because the finalizer set is always established by a single authoritative source -- the `Init` command or a prior `Finalize` command that applied a pending update. Two devices cannot independently believe they are the sole finalizer at the same sequence number:

- At team creation, all devices process the same `Init` command and agree on the initial set.
- After a `Finalize` command applies a set change, the change was agreed upon by the previous quorum (they verified the pending update before voting). Devices that haven't synced this `Finalize` are still operating at the previous sequence number and cannot produce a valid `Finalize` at the new sequence number (the sequential check would fail).

### Triggering Finalization

All finalization triggers use the same scheduling mechanism: an effect that sets a delay before the next finalization round. The daemon tracks one pending schedule at a time -- a shorter delay overwrites the current schedule. Finalization scheduling MUST use a delay (not wall clock time); the daemon MUST track the delay locally. **[TRIG-003]**

1. **Periodic scheduling.** The `Init` command MUST emit an effect that schedules the first finalization after a configured delay. **[TRIG-001]** Each successful `Finalize` command MUST emit an effect scheduling the next one. **[TRIG-002]**
2. **Daemon restart.** When a finalizer daemon starts or restarts, it MUST attempt to trigger finalization unconditionally. **[TRIG-004]** The daemon MUST NOT skip the attempt based on local delay state -- it relies on other finalizers to prevote nil if finalization was too recent. This avoids the daemon needing to persist scheduling state across restarts.
3. **On-demand.** Any finalizer MUST be able to request immediate finalization by emitting a scheduling effect with a zero delay. **[TRIG-006]** This overwrites any pending periodic schedule, triggering finalization immediately. After the resulting `Finalize` command completes, the normal periodic schedule is re-established.

In all cases, the initiating finalizer MUST NOT necessarily become the proposer -- the proposer MUST be selected by the deterministic proposer rotation of the BFT algorithm (see [Agreement](#phase-1-agreement)). **[TRIG-007]** If multiple finalizers trigger concurrently, the consensus protocol MUST resolve to a single proposal. **[TRIG-005]** Redundant trigger attempts are harmless.

### Finalization Round

A finalization round produces a single Finalize command for a specific sequence number. It may span multiple consensus rounds if proposals fail. Each consensus round is a single propose-prevote-precommit cycle. Since signatures are attached to precommit messages, a finalizer commits the Finalize command as soon as it has collected a quorum of signatures — without waiting for the consensus protocol to report a decision (see [Signature Timing Rationale](#signature-timing-rationale)).

#### Pre-Consensus Validation

Before voting in consensus, each finalizer MUST independently validate the proposed FactDB Merkle root **[VAL-001]** by evaluating the `VerifyFinalizationProposal` ephemeral command (see [FactDB Merkle Root Verification](#factdb-merkle-root-verification)) at the proposed parent. The Finalize command does not exist yet at this point -- finalizers are validating the proposer's claimed state, not a command. This ensures that signatures certify verified state agreement, not just trust in the proposer.

Finalizers that do not have the proposed parent MUST sync with the proposer to obtain it and all ancestor commands before validation. **[VAL-002]** Each finalizer then:

1. **Computes the FactDB Merkle root** -- Each finalizer MUST compute the FactDB Merkle root at the proposed parent (via the `verify_factdb_merkle_root` FFI) and verify it matches the proposed `factdb_merkle_root`. **[VAL-003]** This is the core check -- it proves agreement on the state being finalized. If two nodes have the same parent command, the FactDB is guaranteed identical at that point.
2. **Checks the finalization epoch** -- The sequence number is not an explicit field in the proposal data — it is the Malachite `Height`, which Malachite includes in all protocol messages (proposals, votes). Each finalizer MUST derive the height from `LatestFinalizeSeq` in its local FactDB and pass it to Malachite. Malachite MUST drop proposals whose height does not match the finalizer's current height, preventing re-finalization of already-finalized history. **[VAL-004]** If a finalizer's head has already advanced past the proposed height (another Finalize was committed), Malachite handles this as a stale-height message.
3. **Checks the proposer** -- The proposing device MUST be a member of the current finalizer set. **[VAL-005]** The proposal MUST be signed by the proposer's signing key, and the recipient MUST verify this signature against the `FinalizerSet` fact to confirm membership.

A finalizer MUST NOT proceed to vote unless all validation checks pass. **[VAL-006]** The unsigned Finalize command is included in the proposal; finalizers sign it during the precommit phase (see [Agreement](#phase-1-agreement)).

#### Phase 1: Agreement

The goal of this phase is for finalizers to agree on a parent for the Finalize command -- the graph command whose ancestors will all be finalized.

**Proposer selection.** The proposer for each consensus round MUST be selected deterministically using round-robin over the sorted finalizer set, indexed by `derived_seq + consensus_round` modulo finalizer count. **[CONS-001]** All finalizers derive the same sequence number from their FactDB. If the selected proposer is offline, the consensus round MUST time out and advance to the next consensus round with the next proposer in rotation. **[CONS-002]**

A finalizer that has not yet synced the latest Finalize command may compute a different sequence number and therefore a different proposer. This does not break consensus — Malachite drops messages for a lower height and buffers messages for a higher height, so the stale finalizer's messages are harmless. The stale finalizer catches up through Malachite's built-in sync protocol: peers broadcast their current height, the behind node detects it is falling behind and fetches the missing decided values, then replays any buffered messages for the correct height. If the stale finalizer happens to be the designated proposer for a round, that round times out and rotation selects the next proposer — a liveness delay, not a safety issue. Safety is maintained as long as at most `f` finalizers are stale or faulty.

**Proposal.** The proposer selects a parent command from its local graph (typically its current head or a recent command), computes the FactDB Merkle root at that point, and constructs the unsigned Finalize command using the finalization runtime module (`build_certified_envelope` with an empty signature list). The parent is the command to finalize -- the Finalize command will be appended after it, making all of its ancestors permanent. A proposal MUST contain the Malachite height (finalization sequence number), the consensus round number, and the unsigned Finalize command (which includes the proposed parent and FactDB Merkle root). **[CONS-003]** The proposal contains protocol fields managed by Malachite and a payload with the finalization-specific data:

Protocol fields (managed by Malachite):
- **Height** -- The finalization sequence number (Malachite `Height`). Derived from `LatestFinalizeSeq` in the proposer's FactDB. Malachite includes this in all protocol messages and uses it to match proposals to the correct finalization round.
- **Round** -- The consensus round number within this finalization round (increments on timeout).

Proposal payload (finalization-specific):
- **Unsigned Finalize command** -- The complete Finalize command envelope without signatures, constructed by the proposer using the finalization runtime module. This includes the parent, FactDB Merkle root, and command ID. By including the command directly, all finalizers are guaranteed to sign the exact same command — no independent reconstruction is needed. Signatures are attached during the precommit phase (see [Agreement](#phase-1-agreement)).

**Sync and validate.** Each finalizer receives the proposal. If a finalizer does not have the proposed parent in its local graph, it syncs with the proposer to obtain it and all ancestor commands. Once the finalizer has the proposed parent, it validates the proposal by computing and comparing the FactDB Merkle root (see [Pre-Consensus Validation](#pre-consensus-validation)).

**Prevote.** If validation passes, the finalizer broadcasts a prevote for the proposal to all other finalizers. A finalizer MUST prevote nil if: validation fails or the FactDB Merkle root does not match. **[CONS-004]** Proposals with a stale or future height are handled by Malachite (dropped or buffered, respectively) before reaching validation.

**Precommit and sign.** Every finalizer independently observes the prevotes. When a finalizer observes a quorum of prevotes for the same proposal, it MUST sign the unsigned Finalize command from the proposal (using `sign_certified` from the finalization runtime module) and broadcast a precommit with the attached `(signing_key_id, signature)` pair to all other finalizers. **[CONS-006, SIG-001]** Since the command was constructed by the proposer and included in the proposal, all finalizers MUST sign the exact same command with the same command ID. Nil precommits carry no signature. If a quorum of nil prevotes is observed, finalizers MUST precommit nil immediately without waiting for the prevote timeout. **[CONS-005]** If the prevote timeout expires without any quorum (neither for the proposal nor for nil), finalizers MUST also precommit nil. A smaller number of nil prevotes (less than quorum) MUST NOT trigger early advancement. All finalizers participate in both voting stages.

Note: Standard Tendermint (as implemented by Malachite) requires a full quorum of nil prevotes to advance immediately. A smaller number of nil prevotes (e.g. `n - q + 1`, which would make proposal quorum mathematically impossible) does not trigger early advancement — the round waits for the timeout in that case. This is conservative but avoids giving a minority the ability to accelerate round advancement.

**Signature accumulation.** As each precommit message arrives, the finalizer extracts the `(signing_key_id, signature)` pair (if present — nil precommits have none) and accumulates it alongside the unsigned Finalize command received in the proposal. The unsigned envelope starts with an empty signature list; each non-nil precommit adds one entry. **[SIG-002]**

**Decision and commit.** A finalizer MUST commit the Finalize command immediately upon accumulating at least a quorum of signatures — it MUST NOT wait for additional signatures, for Malachite to report a consensus decision, or for all precommit messages to arrive. **[CONS-007]** A quorum of precommit-signatures proves consensus: it implies a quorum of precommits, which is the Tendermint decision. The on-graph policy verification (`verify_certified_quorum`) is the authoritative gate, not the consensus protocol's internal decision event. Waiting for additional signatures beyond quorum would add latency for no safety benefit — a quorum is sufficient, extra signatures are redundant proof of the same consensus, and there is no principled duration to wait. The finalizer MUST include all valid signatures it has received at the time of commit (which may exceed the quorum if additional precommit messages arrived before processing), but MUST NOT delay commit to collect more. Different finalizers may end up with different signature sets depending on message arrival order, but all produce the same command ID. If a quorum of signatures is not collected (nil quorum or timeout), the consensus round number MUST increment and a new proposer MUST be selected. **[CONS-008]** The process repeats from the proposal step with the new proposer. Signatures from failed rounds are discarded.

**Malachite state management.** Although the finalizer commits based on signature quorum rather than Malachite's decision event, the daemon MUST continue feeding all precommit messages to Malachite so it can maintain its internal state. **[CONS-010]** Specifically:

1. All received precommit messages MUST be delivered to Malachite regardless of whether the finalizer has already committed. Malachite uses precommit messages to update locking state and manage round advancement (including nil precommit quorum detection for fast round advancement).
2. After committing the Finalize command, the daemon MUST notify Malachite that the current height is decided so it advances to the next height for the next finalization round. **[CONS-011]**
3. Malachite continues to manage the full Tendermint state machine (locking, PoLC, round advancement, timeout escalation). The early commit based on signature quorum is a race ahead of Malachite's own decision — it does not replace or short-circuit Malachite's protocol processing.

#### Signature Timing Rationale

Signatures are attached to precommit messages rather than collected in a separate phase after consensus. A quorum of precommit-signatures implies a quorum of precommits, which IS the Tendermint consensus decision — so a finalizer can commit as soon as it has a quorum of signatures without waiting for the consensus protocol to report a decision. This reduces latency (no extra round-trip for signature collection, no need to wait for the decision event) and improves availability (fewer communication rounds that can fail). The Tendermint locking mechanism (which operates at the prevote level) prevents two different proposals from each accumulating a quorum of precommit-signatures, so safety is equivalent to a separate signature collection phase. See [Precommit Signature Safety](#precommit-signature-safety) in the threat model.

| Dimension | Sign during precommit (chosen) | Sign after consensus |
|---|---|---|
| **Latency** | Lower — no extra round-trip | Higher — one additional round-trip |
| **Availability** | Higher — fewer failure/timeout opportunities | Lower — extra communication round can fail |
| **Bandwidth** | Higher — all signatures broadcast to all finalizers | Lower — each finalizer collects only a quorum |
| **Compute** | Higher — wasted signatures on failed rounds | Lower — only sign after consensus succeeds |
| **Complexity** | Higher — attach/extract signatures from precommit messages | Lower — clean separation between consensus and signatures |
| **Attestation** | Weaker semantic claim — attests to prevote quorum | Stronger semantic claim — attests to consensus decision |
| **Security** | Equivalent | Equivalent |

For a maximum finalizer set size of 7, the bandwidth and compute differences are negligible. The latency and availability improvements are the primary motivation.

#### Phase 2: Commit

When a finalizer has accumulated at least a quorum of signatures, it MUST build the final certified envelope using `build_certified_envelope` (from the finalization runtime module) with the payload and all collected signatures, then commit it locally to the graph at the agreed-upon parent via the certified command action (see [Action-at-Parent](#action-at-parent))). **[CMT-001]** Multiple finalizers may independently commit with different signature sets (depending on which precommit messages they had received at the time of commit), but all produce the same command ID (see [Certified Commands](#certified-commands)). When a node syncs a Finalize command that has the same command ID as one already in the graph, the graph MUST reject it at the graph layer without weaving or policy evaluation **[CMT-002]** -- this is the standard graph behavior for duplicate command IDs.

### Consensus Communication

Consensus messages MUST be sent off-graph between finalizers. **[COMM-001]** The only on-graph command produced by finalization MUST be the `Finalize` command.

#### Transport

The consensus protocol MUST be transport-agnostic -- it produces and consumes messages that are delivered by an external transport layer, similarly to how the sync protocol is implemented. The daemon polls the consensus protocol for outgoing messages and delivers incoming messages to it.

The daemon reuses the existing QUIC transport that it already uses for the sync protocol to deliver consensus messages between finalizers. Consensus and sync streams are multiplexed on the same QUIC connections, with each stream beginning with a protocol discriminant to route to the appropriate handler. This is a convenience of the current daemon implementation, not a requirement of the consensus protocol.

Finalizers MUST only open consensus streams with other finalizers. **[COMM-002]** Non-finalizer peers MUST NOT see consensus traffic.

#### Finalizer Peer Configuration

Since finalizers are devices for the initial implementation, the consensus manager MUST reuse the existing sync peer configuration for finalizer addressing. **[COMM-003]** Finalizer devices are already configured as sync peers, so no additional peer configuration API is needed. The consensus manager MUST determine which sync peers are finalizers by matching their signing keys against the `FinalizerSet` fact.

When the finalizer set changes, the consensus manager MUST update its peer set based on the new `FinalizerSet` fact. **[COMM-004]**

Non-finalizer devices do not participate in consensus traffic.

**Broadcast pattern.** Consensus messages (proposals, prevotes, precommits with signatures) MUST be pushed to all configured finalizer peers. **[COMM-005]** Finalizers connect to peers on demand at the start of each finalization round. Connections MAY be dropped between rounds and re-established when the next round begins.

**Sender verification.** Each consensus message MUST be signed by the sender's signing key. **[COMM-006]** The recipient MUST verify the signature and confirm the public signing key belongs to a member of the current finalizer set (by looking it up in the `FinalizerSet` fact). Messages that fail verification MUST be dropped. **[COMM-007]**

#### Consensus Message Types

| Message | Sender | Description |
|---|---|---|
| `Proposal` | Proposer | Unsigned Finalize command (includes proposed parent and FactDB Merkle root) |
| `Prevote` | Finalizer | First-stage vote for or against a proposal |
| `Precommit` | Finalizer | Second-stage vote with attached signature over the Finalize command (when voting for a proposal; nil precommits carry no signature) |

### Timeouts

A successful consensus round (no timeouts, no retries) is expected to complete in under a few seconds on a local network. Each consensus phase (propose, sync, prevote, precommit) MUST have a configurable timeout: **[TMOUT-001]**

| Phase | Default Timeout | Behavior on Expiry |
|---|---|---|
| Propose | 30s | Prevote nil |
| Sync | 30s | Prevote nil (could not obtain the proposed parent from the proposer in time) |
| Prevote | 30s | Precommit nil |
| Precommit | 30s | Advance to next consensus round |

Timeouts MUST increase linearly with each successive consensus round: **[TMOUT-002]**

```
timeout(r) = base_timeout + r * timeout_increment
```

Where `r` is the consensus round number (starting at 0). The default `timeout_increment` SHOULD be 50% of `base_timeout` (e.g., if `base_timeout` is 30s, each successive round adds 15s). The first consensus round uses `base_timeout`; each subsequent round adds `timeout_increment`. This is standard Tendermint behavior -- longer timeouts give the network more time to deliver messages when earlier consensus rounds fail. All timeout values are configurable per deployment.

Consensus rounds can also fail fast without waiting for timeouts. If a finalizer receives an obviously invalid proposal, it MUST prevote nil immediately without waiting for the timeout. **[TMOUT-003]** If a quorum of nil prevotes is reached, the round advances to the next proposer without waiting for the prevote timeout.

### Daemon Startup and Fault Tolerance

Consensus state MUST NOT be persisted -- all consensus messages are ephemeral. **[FAULT-001]** When a daemon starts or restarts, any in-progress finalization round MUST be abandoned. The daemon MUST determine finalization state from its local FactDB **[FAULT-002]** and automatically attempts to start a new finalization round (since it does not know when the last one occurred):

1. The daemon MUST query the `LatestFinalizeSeq` fact to determine the last completed finalization sequence number.
2. The daemon MUST check if this device is in the current finalizer set (query the `FinalizerSet` fact). On startup, the daemon runs this query directly. Subsequently, the daemon MUST maintain its membership state by listening for the `FinalizerSetChanged` effect emitted by `Finalize` commands.
3. If a finalizer, connect to configured finalizer peers and join whatever consensus round is currently active. The Tendermint protocol handles late joiners without needing prior history.

A daemon being offline MUST NOT block finalization as long as a quorum of finalizers remains online. **[FAULT-003]** Stalled rounds advance automatically via timeout. If all finalizers restart simultaneously, they independently determine the current sequence number from FactDB and the deterministic proposer rotation ensures they agree on who proposes first.

### Partition Handling

Finalization and normal graph operations are independent:

- **During partitions**: Non-finalizer devices MUST continue publishing and syncing normally. **[FAULT-004]** If fewer than a quorum of finalizers can communicate, finalization MUST halt but graph operations MUST be unaffected.
- **After partition heals**: Devices sync and merge branches. Finalization MUST resume once a quorum of finalizers can communicate. **[FAULT-005]** Finalizers that are missing the proposed parent sync with the proposer before voting -- this affects liveness, not safety.

### Equivocation Detection and Vote Visibility

**Equivocation.** Malachite MUST detect conflicting votes (equivocation) from the same finalizer. Equivocation MUST NOT halt consensus; the protocol continues with honest finalizers. **[FAULT-006]**

**Vote logging.** Each finalizer MUST log votes observed during each consensus round **[FAULT-007]**, including prevotes for/nil, precommits for/nil, equivocation evidence, and non-responsive nodes.

**Operator response.** Operators review vote logs to identify misbehaving finalizers. A device with the `UpdateFinalizerSet` permission can remove them via `UpdateFinalizerSet`.

### Integration with Malachite

The consensus protocol is implemented using the malachite library. The integration maps Aranya concepts (defined in [Terminology](#terminology) and [Formulas](#formulas)) to malachite abstractions:

| Malachite Concept | Aranya Mapping |
|---|---|
| `Value` | Finalize command content: proposed parent (graph position) and FactDB Merkle root |
| `ValueId` | Hash of the proposed FactDB Merkle root |
| `Height` | Finalization sequence number (derived from FactDB) |
| `Validator` | Finalizer device. Malachite uses "validator" for what Aranya calls a "finalizer". |
| `ValidatorSet` | Current finalizer set. Derived from the `FinalizerSet` fact. Updated atomically when a `Finalize` command applies a `PendingFinalizerSetUpdate`. |
| `Address` | Finalizer's `pub_signing_key_id` |
| `Vote` | Prevote/precommit messages |
| `Proposal` | Finalization proposal message |

#### Malachite Context Implementation

The `Context` trait is implemented with:

- **`select_proposer`** -- Deterministic selection from the sorted finalizer set using `derived_seq + consensus_round` as index modulo finalizer count.
- **`new_proposal`** -- Constructs a proposal containing the proposed parent and FactDB Merkle root.
- **`new_prevote` / `new_precommit`** -- Constructs vote messages signed with the finalizer's signing key.

### Library Selection

Several Rust BFT consensus libraries were evaluated:

| Library | Algorithm | Pros | Cons |
|---|---|---|---|
| [malachite](https://github.com/circlefin/malachite) | Tendermint | Standalone embeddable library with no runtime or networking opinions. Co-designed with TLA+ formal specs. Actively maintained (Informal Systems / Circle). Implements the same Tendermint algorithm used in production by 100+ Cosmos ecosystem blockchains (via CometBFT). | Tendermint's all-to-all voting has O(n^2) message complexity. Malachite itself is newer and does not have the same production track record as CometBFT. |
| [tendermint-rs](https://github.com/cometbft/tendermint-rs) | Tendermint | Mature ecosystem with light client support. | Client library for CometBFT, not a standalone consensus engine. Requires running an external CometBFT node and communicating via ABCI. Low development activity (last commit Nov 2025). |
| [hotstuff_rs](https://github.com/parallelchain-io/hotstuff_rs) | HotStuff | Linear message complexity O(n). Dynamic validator sets built-in. Pluggable networking and storage. | Not actively maintained (last commit Dec 2024). Less battle-tested than Tendermint. Smaller community. |
| [mysticeti](https://arxiv.org/pdf/2310.14821) | DAG-based BFT | Lowest theoretical latency (3 message rounds). Powers the Sui blockchain. | DAG-based consensus is significantly more complex to integrate. Designed for high-throughput blockchains, not embedded use. No standalone Rust library available. |
| [raft-rs](https://github.com/tikv/raft-rs) | Raft | Actively maintained. Battle-tested (powers TiKV/TiDB). Standalone embeddable Rust library. | Crash fault tolerant (CFT) only, not Byzantine fault tolerant. Followers blindly trust the leader -- a compromised leader can commit arbitrary state. |
| [etcd raft](https://github.com/etcd-io/raft) | Raft | Actively maintained. The most widely used Raft library in production (etcd, Kubernetes, CockroachDB). | Written in Go, not Rust. CFT only, not BFT. Would require FFI or a sidecar process. |

**Decision: Malachite.** It is the only library that provides a standalone, embeddable Tendermint consensus engine without requiring an external process or specific networking stack. This is critical for Aranya because consensus must run inside the daemon process and communicate over QUIC connections. Tendermint's O(n^2) message complexity is acceptable for our small finalizer sets (max 7 members). The underlying Tendermint algorithm is battle-tested across 100+ Cosmos ecosystem blockchains via CometBFT. Malachite itself is a newer Rust reimplementation by Informal Systems and Circle, but its co-design with TLA+ formal specs provides confidence in correctness despite its shorter production history.

## Example: Full Finalization Round-Trip

This example walks through a complete finalization round with 4 finalizers (A, B, C, D). The `LatestFinalizeSeq` fact shows seq=2, so this will be seq 3 (derived). The round succeeds on the first consensus round (round 0).

1. **Initiation.** Finalizer A determines there are unfinalized commands and signals the other finalizers that a finalization round should begin.

2. **Proposer selection.** All finalizers derive seq=3 from their FactDB and independently compute the proposer: `sorted_finalizers[(3 + 0) % 4]` = B (for consensus round 0).

3. **Proposal.** B selects a parent for the Finalize command from its local graph, computes the FactDB Merkle root at that point, and broadcasts the proposal (round=0, proposed parent, factdb_merkle_root) to A, C, and D.

4. **Sync and validate.** Each finalizer receives the proposal and validates it:
   - A, C: Have the proposed parent. Validation passes (Merkle roots match). Broadcast prevote.
   - B: Also prevotes for its own proposal.
   - D: Missing the proposed parent. Syncs with B to obtain it, then validates. Merkle roots match. Broadcasts prevote.

5. **Precommit and sign.** All finalizers observe 4 prevotes for the proposal (quorum = `(4 * 2 / 3) + 1` = 3). Each signs the unsigned Finalize command from the proposal and broadcasts a precommit with the attached signature.

6. **Decision.** All finalizers observe 4 precommits for the proposal, each carrying a signature. Agreement is reached. Each finalizer now has 4 signatures (3 needed for quorum).

7. **Commit.** All four finalizers attach the collected signatures to the Finalize command envelope and commit it at the agreed-upon parent using action-at-parent. Because the command ID is computed from the payload (which excludes signatures), all produce the same command ID. When finalizers sync with each other, the graph rejects duplicate commands with the same ID — no weaving or policy evaluation occurs for the duplicate.

## Future Work

- **FactDB distribution** -- New members can receive the FactDB at a finalization point and verify it against the `factdb_merkle_root` in the Finalize command, without replaying the entire graph up to that point. This enables fast onboarding of new devices.
- **Braid Merkle root** -- Add a braid Merkle root to the Finalize command payload alongside `factdb_merkle_root`. The braid Merkle tree would be built from command hashes in braid order, enabling truncation (retain only roots as compact proof of prior state) and light clients (verify finalized state without replaying the full braid).
- **Role-based finalizer set management** -- The `UpdateFinalizerSet` permission can be delegated to roles other than Owner. Future work could add additional governance controls (e.g. requiring multiple approvals or time-delayed updates).
- **Graph-based consensus transport** -- Relay consensus messages as graph commands instead of requiring direct QUIC connections between finalizers. This would allow consensus to work through the existing sync topology without finalizers needing to know each other's network addresses, making finalization much more robust to different network topologies. On-graph consensus is possible today (consensus commands wouldn't get finalized, but that is not necessarily a problem), though the extra storage and potential latency from poll sync are concerns. A more efficient approach would be an ephemeral sync-participating branch — a new type of session command that is ephemeral (deleted after the Finalize command is committed) but participates in sync, unlike current ephemeral commands which are not synced. Push sync would be preferred over poll sync for consensus latency.
- **Truncation** -- Define a garbage collection strategy for finalized graph data. Requires Merkle roots (e.g. braid Merkle root) to retain compact proofs of truncated state.
- **Light clients** -- Devices that bootstrap from a finalization point without replaying the full braid. The finalization commands establish a chain of trust that includes the FactDB Merkle root. A light client can bootstrap by receiving the finalization chain and a copy of the FactDB from any peer -- even an untrusted one, since the FactDB's integrity can be verified against the `factdb_merkle_root` in the Finalize command. From that point, the client appends new commands after the finalization point without needing commands from before it. This ties into truncation: instead of maintaining the full graph, the client treats the finalization point as its starting state. This approach is well-suited for clients with limited storage or compute resources.
- **Larger finalizer sets** -- Support finalizer sets beyond the current maximum of 7. This requires policy language support for collection types or additional FFI work to handle more fields.
- **Non-device finalizers** -- Support finalizers that are not full devices. Since finalization only requires a signing key, a lightweight finalizer process could participate in consensus without the full device stack. This would allow dedicated finalization infrastructure separate from team devices.
- **Finalization metrics** -- Monitoring and alerting for finalization latency and participation rates.
- **Finalizer set quorum validation** -- Validate that a new finalizer set can reach quorum before accepting the `UpdateFinalizerSet` command (e.g., verify that the specified devices are reachable and can participate in consensus). This is less critical while the owner can unilaterally change the set, but becomes more important if finalizer set management is delegated or consensus-based.
- **On-graph equivocation evidence** -- Log equivocation evidence and consensus observability data to the graph as commands. This would ensure propagation to all devices and provide an auditable record for finalizer set management decisions (e.g., justifying removal of a misbehaving finalizer via `UpdateFinalizerSet`). Requires familiarity with Malachite's equivocation evidence format to determine the appropriate command structure.
- **Certified merge commands** -- Require merge commands to be certified by an active device. Currently, an unbounded number of merge commands can be created by anyone in the sync group. The certified command type introduced for finalization could be reused to add authentication to merge commands.
