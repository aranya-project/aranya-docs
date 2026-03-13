---
layout: page
title: BFT Consensus Finalization
permalink: "/finalization/"
---

# Finalization

## Overview

Finalization is the process by which all ancestors of a Finalize command become permanent. Once a set of commands is finalized, they cannot be recalled by future merges. This bounds the impact of long partitions and adversarial branching by guaranteeing that accepted commands remain accepted.

Finalization has two components:

1. **Finalization policy** -- The on-graph commands, facts, and policy rules that enforce finalization invariants. Any device can verify a Finalize command independently.
2. **BFT consensus protocol** -- The off-graph protocol that drives agreement among finalizers on what to finalize. The consensus protocol produces the inputs (agreed-upon head, collected signatures) that the policy consumes.

## Terminology

| Term | Definition |
|---|---|
| Finalizer set | The group of devices authorized to participate in finalization consensus |
| Finalizer | A device in the finalizer set |
| Finalize command | A multi-author graph command whose ancestors all become permanent |
| Finalization round | The full process of producing a Finalize command for a specific sequence number. May contain multiple consensus rounds if proposals fail. |
| Consensus round | A single propose-prevote-precommit cycle within a finalization round. If the proposal fails or times out, the round number increments and a new consensus round begins with the next proposer. |
| Parent of the Finalize command | The graph command that the Finalize command is appended to. All ancestors of the Finalize command become permanent. Consensus decides this. |
| FactDB Merkle root | A hash over the entire FactDB state at a given point in the graph. Agreement on the Merkle root implies agreement on all derived state (sequence number, finalizer set, pending updates). |
| Proposer | The finalizer selected by the BFT protocol's deterministic round-robin to propose a parent for the Finalize command for a given consensus round |
| Prevote | First-stage vote indicating a finalizer considers the proposal valid |
| Precommit | Second-stage vote indicating a finalizer is ready to commit the proposal |
| Quorum | The minimum number of finalizers required for a consensus decision (q) |
| Sequence number (seq) | Identifies a finalization round; increments with each successful Finalize command |

### Formulas

| Variable | Formula | Description |
|---|---|---|
| n | | Finalizer set size (1 to 7) |
| f | ⌊(n - 1) / 3⌋ | Maximum number of Byzantine (malicious or faulty) finalizers the protocol can tolerate |
| q | ⌊(n * 2) / 3⌋ + 1 | Quorum size -- the minimum number of finalizers required for a consensus decision. Ensures safety as long as at most f finalizers are Byzantine. |

## Scope

Finalization applies to the **control plane only** -- the persistent commands on the DAG that manage team membership, roles, labels, and AFC channel configuration. Ephemeral commands and AFC data plane traffic are not subject to finalization.

## Design Goals

1. **Safety** -- A Finalize command is only produced when a quorum of finalizers agree. No two conflicting Finalize commands can exist in the graph.
2. **Availability** -- Multi-party finalization extends availability beyond a single owner. As long as a quorum of finalizers are online and can communicate, finalization makes progress. Non-finalizer devices continue operating normally (publishing commands, syncing) regardless of whether finalization is active.
3. **Periodic and on-demand** -- Finalization is triggered periodically (delay-based scheduling) or on demand (e.g. daemon restart). The BFT protocol selects the proposer automatically.
4. **Deterministic verification** -- Any device can verify a Finalize command by checking that its envelope contains a quorum of valid signatures from the current finalizer set. Different finalizers may collect different signature subsets, but all are valid as long as a quorum signed.

## Architecture

The finalization system spans multiple layers of the Aranya stack. The aranya-core runtime does not depend on or know about the consensus implementation. This separation allows applications to choose their own consensus algorithm if needed -- the finalization policy on the graph is consensus-agnostic and only cares that the Finalize command carries a valid quorum of signatures.

```
┌──────────────────────────────────────────────────┐
│                  aranya-daemon                   │
│                                                  │
│  ┌───────────────────┐  ┌───────────────────┐    │
│  │ Consensus Manager │  │   Sync Manager    │    │
│  │                   │  │                   │    │
│  │ ┌───────────────┐ │  │ ┌───────────────┐ │    │
│  │ │  Consensus    │ │  │ │ Sync Protocol │ │    │
│  │ │  Protocol     │ │  │ └───────────────┘ │    │
│  │ └──────┬────────┘ │  │                   │    │
│  │        │          │  │                   │    │
│  │        ▼          │  │                   │    │
│  │ ┌───────────────┐ │  │                   │    │
│  │ │ Finalization  │ │  │                   │    │
│  │ │ Policy        │ │  │                   │    │
│  │ └───────────────┘ │  │                   │    │
│  └────────┬──────────┘  └────────┬──────────┘    │
│           │                      │               │
│      ┌────┴──────────────────────┤               │
│      ▼                           ▼               │
│  ┌─────────────────┐  ┌─────────────────────┐    │
│  │ aranya-core     │  │  QUIC Transport     │    │
│  │ Runtime         │  └─────────────────────┘    │
│  │                 │                             │
│  │ ┌─────────────┐ │                             │
│  │ │Finalization │ │                             │
│  │ │FFIs (plugin)│ │                             │
│  │ └─────────────┘ │                             │
│  └─────────────────┘                             │
└──────────────────────────────────────────────────┘
```

Key architectural boundaries:

- **Consensus manager** and **sync manager** orchestrate their respective protocols and relay messages via QUIC transport. They are daemon-layer components.
- **Consensus protocol** and **sync protocol** are separate crates in the `aranya-core` repository but are not part of the core runtime. Both depend on the runtime (e.g., consensus queries graph heads). Neither depends on QUIC transport directly.
- **Finalization policy** is part of the daemon layer and depends on the aranya-core runtime.
- **Finalization FFIs** are an optional runtime plugin for operations the policy language cannot express directly (multi-author envelopes, quorum verification, finalizer set management).

## Threat Model

### Fault Model

The consensus protocol assumes the standard BFT fault model: at most f of the n finalizers may be Byzantine (malicious or arbitrarily faulty). We do not know in advance which nodes are Byzantine. The protocol must be safe regardless of which nodes are faulty, and live as long as a quorum (q) of honest, online nodes can communicate.

### Why Multi-Party Finalization

Single-finalizer mode (where the owner is the sole finalizer) is used for the initial implementation. Multi-party consensus does not improve the security of finalization beyond what's available if the owner is the sole finalizer -- it improves availability by distributing the owner's finalization authority equally across a set of finalizers. Because devices with the `UpdateFinalizerSet` permission control the finalizer set, the security of multi-party finalization is bounded by the security of those devices -- a compromised device with this permission can undermine the finalizer set in either model.

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
| **Blocking finalization** | Byzantine finalizer withholds votes to prevent quorum | Quorum requires q, not unanimity. Up to f unresponsive finalizers are tolerated. Offline proposer times out and rotation selects the next. |
| **Equivocation** | Finalizer sends conflicting votes in the same consensus round | Malachite detects equivocation with cryptographic evidence. Tendermint guarantees safety regardless. Owner can remove the finalizer via `UpdateFinalizerSet`. |
| **Compromised finalizer set manager** | Device with `UpdateFinalizerSet` permission replaces the set with devices they control | Owner is the trust anchor (determines initial set in `Init` and controls permission delegation). Two-phase update requires quorum to sync and agree before the change is applied. Operational controls (monitoring, access restriction) are the primary defense. |
| **Command hiding** | Malicious node withholds commands from finalizers to cause them to finalize an incomplete view of the graph | Mitigated by sufficient network connectivity -- non-malicious nodes forward commands to finalizers through other paths. The network is assumed well-connected enough that a single malicious node cannot deny availability of graph commands. |
| **Stale finalization** | Proposer finalizes a point far behind the current head | Only delays finalization of recent commands. Round-robin rotation gives the next proposer a chance. Persistent stale proposals are detectable in vote logs. |
| **Network partition** | Attacker isolates finalizers to cause conflicting finalizations | Quorum requirement ensures at most one partition can finalize. Minority partition halts finalization; graph operations continue. Devices converge when the partition heals. |
| **Replay / duplicate Finalize** | Attacker replays a valid Finalize command | Policy rejects duplicates because the `FinalizeRecord` at the derived seq already exists. Payload-derived command ID means different signature subsets produce the same command. |

## Finalizer Set

The finalizer set is the group of devices authorized to participate in finalization consensus. Finalizer devices do not need to be members of the team -- they only need a signing key to participate in consensus and can sync graph commands like any other device. This allows dedicated finalization infrastructure that is separate from the team's member devices. The team creator (or owner, for later updates) must know the finalizer's public signing key ID at the time the finalizer is added to the set. The finalizer set can only be changed by devices with the `UpdateFinalizerSet` permission through a dedicated `UpdateFinalizerSet` command.

In the future, finalizers may not need to be devices at all, since all that matters is a signing key. For MVP, finalizers are assumed to be devices.

### Initialization

The initial finalizer set is established in the team's `Init` command. The `Init` command includes 7 optional finalizer fields (`finalizer1` through `finalizer7`), each containing a public signing key ID. The caller specifies 1 to 7 finalizers. If none are specified, the team owner's public signing key ID is used as the sole initial finalizer.

### Set Size and Quorum

The maximum supported set size for the initial implementation is 7. The BFT algorithm supports any size, but the policy language's lack of collection types requires fixed fields (one per finalizer). 7 fields provides up to 2 Byzantine fault tolerance while keeping the policy definitions manageable. (Malachite refers to the finalizer set as the "validator set".)

Quorum values for each set size (see [Formulas](#formulas)):

| n | f | q |
|---|---|---|
| 1 | 0 | 1 |
| 2 | 0 | 2 |
| 3 | 0 | 3 |
| 4 | 1 | 3 |
| 5 | 1 | 4 |
| 6 | 1 | 5 |
| 7 | 2 | 5 |

Sizes following `n = 3f + 1` (1, 4, 7) give maximum fault tolerance for the fewest nodes.

### Changing the Finalizer Set

The finalizer set is changed through a two-phase process:

1. **Request phase.** A device with the `UpdateFinalizerSet` permission publishes an `UpdateFinalizerSet` command on the graph. This does not immediately change the active finalizer set. Instead, it creates a `PendingFinalizerSetUpdate` fact that stages the new set.
2. **Apply phase.** The next `Finalize` command automatically applies any pending update. Because all finalizers verify the same FactDB Merkle root during pre-consensus validation, they are guaranteed to agree on whether a pending update exists. The `Finalize` command applies the update atomically -- deleting the old `Finalizer` facts, creating new ones from the pending update, and consuming the `PendingFinalizerSetUpdate` fact. If no pending update exists, finalization proceeds without changing the set.

This two-phase approach ensures that all finalizers have a globally consistent view of the finalizer set at each consensus round. If the `UpdateFinalizerSet` command directly modified `Finalizer` facts, different finalizers could have different views of the set depending on which graph commands they had synced, causing `verify_finalize_quorum` to produce inconsistent results across devices. The FactDB Merkle root check during pre-consensus validation ensures all finalizers agree on the state (including any pending update) before voting.

The set can grow or shrink freely, but once a team has 4 or more finalizers it cannot shrink below 4. 4 is the smallest set size with Byzantine fault tolerance (f=1), so this prevents losing BFT safety once established.

Only devices with explicit permission to update the finalizer set can modify it. The owner determines the initial set in `Init` and controls which devices receive the `UpdateFinalizerSet` permission.

Because set changes are only applied atomically by `Finalize` commands, the finalizer set is always globally consistent -- all devices that have processed the same `Finalize` commands agree on the same set.

If the owner publishes a second `UpdateFinalizerSet` before the next finalization, the `PendingFinalizerSetUpdate` fact is replaced. The next finalization round picks up whatever pending update exists at that point.

**Known limitation:** Because finalizer set changes are applied through the `Finalize` command, a set change cannot proceed if finalization itself is stalled.

## Finalization Policy

This section defines the on-graph commands, facts, and policy rules that enforce finalization. The policy is evaluated independently by every device -- it does not depend on or interact with the off-graph consensus protocol.

### Multi-Author Commands

The Finalize command uses multi-author authentication instead of single-author authentication. Each signature represents an author -- a finalizer that endorsed the command. This is necessary because finalization represents agreement by a quorum of finalizers, not the action of a single device.

This requires a **new command type** in the `aranya-core` runtime. Existing commands assume a single author with a single signature. The multi-author command type extends the envelope to carry multiple signatures instead of one.

Key properties of multi-author commands:

- **Signatures live in the envelope, not the payload.** Single-author commands already store the signature in the envelope, separate from the payload. Multi-author commands follow the same pattern: the envelope carries up to 7 optional `(signing_key_id, signature)` pairs, matching the maximum finalizer set size. The payload contains only the command fields (factdb_merkle_root). Because the command ID is computed from the payload, and signatures are in the envelope, the ID computation does not change. Different valid subsets of author signatures produce the same command ID, which is critical -- multiple finalizers may independently commit the same Finalize command with different signature subsets, and the policy must treat them as the same command.
- **Multiple authors.** Instead of a single `get_author()` check, the policy verifies that the envelope contains a quorum of valid signatures from the current finalizer set. Each signature is an author endorsing the command.
- **New FFI functions.** Multi-author commands require new envelope FFI:
  - `seal_multi_author(payload)` -- Seals a multi-author command. The command ID is computed from the payload as usual. The envelope is created without signatures; they are attached later.
  - `open_multi_author(envelope)` -- Opens a multi-author envelope and returns the deserialized fields.
  - `verify_finalize_quorum(envelope)` -- Reads the signatures from the envelope and verifies a quorum against the current finalizer set.

### Finalize Command

The `Finalize` command makes all of its ancestors permanent. It is the only graph command produced by finalization.

Properties:

- **Priority**: 0 (processed before all non-ancestor commands in the weave). Other commands may be appended to the same parent as siblings. Priority 0 ensures the Finalize command is ordered before these siblings in the weave, so finalization takes effect first.
- **Fields**:
  - `factdb_merkle_root` -- The FactDB Merkle root at the parent of the Finalize command. This is the only field. Everything else is either implicit in the DAG (parent command) or derivable from the FactDB state that the Merkle root certifies (sequence number from `FinalizeRecord` facts, finalizer set from `Finalizer` facts, pending updates from `PendingFinalizerSetUpdate`). Finalizers independently compute this from their local FactDB and verify it matches before voting in consensus (see [Pre-Consensus Validation](#pre-consensus-validation)).
- **Envelope**: Contains multiple `(signing_key_id, signature)` pairs from the finalizers that authored this command. Only finalizers that participated are included.
- **Policy checks**:
  - The envelope contains at least a quorum of valid signatures from unique members of the current finalizer set.
  - The `factdb_merkle_root` matches the locally computed FactDB Merkle root at the parent of the Finalize command.
  - The derived sequence number (`latest_finalize_record().seq + 1`) is sequential.
- **Side effects**:
  - Creates a `FinalizeRecord` at the next sequence number (derived from existing records).
  - If a `PendingFinalizerSetUpdate` fact exists, applies it atomically (see [Changing the Finalizer Set](#changing-the-finalizer-set)). The Merkle root check guarantees all finalizers agree on whether a pending update exists.

### Finalize Ordering Guarantee

All Finalize commands in the graph must form a chain -- for any two Finalize commands, one must be an ancestor of the other. This is enforced by:

1. The BFT consensus protocol ensures only one Finalize command is produced per finalization round.
2. The sequence number is derived from the FactDB (`next_finalize_seq()`), so each Finalize command deterministically creates the next `FinalizeRecord` in sequence. Since the `FinalizeRecord` is created by the prior Finalize command, the new Finalize must be a descendant of it in the graph. Because finalization covers ancestors, and each Finalize is a descendant of the prior one, the finalized set can only grow forward -- it is impossible to finalize an older point after a newer one.
3. Multiple finalizers committing the same Finalize produce the same command ID (see [Multi-Author Commands](#multi-author-commands)) -- the first succeeds and duplicates are rejected because the `FinalizeRecord` already exists.

### Finalization and Branches

Finalization advances along a single chain. Only commands in the ancestry of the Finalize command are finalized -- commands on unmerged branches are not. This means:

- The proposer selects a parent for the Finalize command from its local graph. Finalizers that don't have it sync with the proposer (see [Agreement](#phase-1-agreement)).
- Unmerged branches remain unfinalized but continue operating normally.
- As devices sync and merge branches into the finalized branch, those commands become eligible for finalization in subsequent rounds.
- No explicit merge step is required before finalization -- merges happen naturally through sync, and the next finalization round covers the newly merged commands.

Branches do not finalize in parallel. Parallel finalization would produce Finalize commands that are not ancestors of each other, violating the chain guarantee. The graph must converge through merges before commands on separate branches can be finalized.

### Post-Finalization

Once a Finalize command is committed to the graph:

- All commands that are ancestors of the Finalize command are permanently accepted. Their effects in the FactDB are irreversible -- the runtime enforces this by preventing any future command from modifying facts established by finalized commands.
- Commands on branches that conflict with the finalized weave are permanently recalled.
- Devices can truncate graph data for finalized commands, retaining only the Finalize command as a compact proof of the finalized state.

### FactDB Merkle Root Verification

The `verify_factdb_merkle_root` FFI computes the FactDB Merkle root at the current evaluation point and compares it to the expected value. This is an FFI because the policy language cannot access the FactDB's internal hash structure directly.

Before consensus, each finalizer validates the proposal using an ephemeral command that verifies the Merkle root without persisting anything to the graph:

```policy
ephemeral command VerifyFinalizationProposal {
    fields {
        factdb_merkle_root bytes,
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

#### Init Command Changes

The `Init` command is extended with finalizer fields (see [Initialization](#initialization)). The policy also creates an initial `FinalizeRecord` at seq 0 so the Finalize command's sequential check has no special case for the first finalization.

```policy
command Init {
    fields {
        // ... existing fields ...
        finalizer1_pub_sign_key optional id,
        finalizer2_pub_sign_key optional id,
        finalizer3_pub_sign_key optional id,
        finalizer4_pub_sign_key optional id,
        finalizer5_pub_sign_key optional id,
        finalizer6_pub_sign_key optional id,
        finalizer7_pub_sign_key optional id,
    }

    // ... existing seal/open ...

    policy {
        // ... existing init logic ...

        // Initialize finalizer set (1 to 7 finalizers).
        // If none provided, default to team owner as sole finalizer.
        check init_finalizer_set(
            envelope,
            this.finalizer1_pub_sign_key, this.finalizer2_pub_sign_key,
            this.finalizer3_pub_sign_key, this.finalizer4_pub_sign_key,
            this.finalizer5_pub_sign_key, this.finalizer6_pub_sign_key,
            this.finalizer7_pub_sign_key,
        )

        // Create initial FinalizeRecord so seq 1 has a predecessor.
        finish {
            create FinalizeRecord[seq: 0]=>{}
        }
    }
}

fact Finalizer[signing_key_id id]=>{}
```

See [`init_finalizer_set`](#new-ffis) for validation details.

#### Finalize Command

```policy
command Finalize {
    attributes {
        priority: 0
    }

    fields {
        factdb_merkle_root bytes,
    }

    // Signatures are in the envelope, not the payload.
    // Command ID is computed from the payload as usual.
    seal { return seal_multi_author(serialize(this)) }
    open { return deserialize(open_multi_author(envelope)) }

    policy {
        check team_exists()

        // Verify quorum of valid signatures from the envelope.
        check verify_finalize_quorum(envelope)

        // Verify the FactDB Merkle root matches the locally computed root.
        check verify_factdb_merkle_root(this.factdb_merkle_root)

        // Derive the next sequence number from the latest FinalizeRecord.
        let latest = latest_finalize_record()
        let next_seq = latest.seq + 1

        finish {
            create FinalizeRecord[
                seq: next_seq,
            ]=>{}

            // Apply the pending finalizer set update if one exists.
            // The Merkle root check guarantees all finalizers agree on
            // whether a pending update exists.
            let pending = lookup PendingFinalizerSetUpdate[]
            if pending is some {
                // Delete all current Finalizer facts.
                delete_all_finalizers()

                // Create new Finalizer facts from the pending update.
                create_finalizers_from_pending(pending)

                // Consume the pending update.
                delete PendingFinalizerSetUpdate[]
            }
        }
    }
}

fact FinalizeRecord[seq int]=>{}
```

#### UpdateFinalizerSet Command

The `UpdateFinalizerSet` command stages a finalizer set change (see [Changing the Finalizer Set](#changing-the-finalizer-set)). Only devices with the `UpdateFinalizerSet` permission can publish it.

```policy
command UpdateFinalizerSet {
    fields {
        new_finalizer1_pub_sign_key optional id,
        new_finalizer2_pub_sign_key optional id,
        new_finalizer3_pub_sign_key optional id,
        new_finalizer4_pub_sign_key optional id,
        new_finalizer5_pub_sign_key optional id,
        new_finalizer6_pub_sign_key optional id,
        new_finalizer7_pub_sign_key optional id,
    }

    seal { return seal(serialize(this)) }
    open { return deserialize(open(envelope)) }

    policy {
        check team_exists()

        // Only devices with the UpdateFinalizerSet permission can update the set.
        let author = get_author(envelope)
        check has_permission(author, UpdateFinalizerSet)

        // Validate the new finalizer set (structural checks only).
        check validate_new_finalizer_set(
            this.new_finalizer1_pub_sign_key, this.new_finalizer2_pub_sign_key,
            this.new_finalizer3_pub_sign_key, this.new_finalizer4_pub_sign_key,
            this.new_finalizer5_pub_sign_key, this.new_finalizer6_pub_sign_key,
            this.new_finalizer7_pub_sign_key,
        )

        finish {
            // Stage the update. The next Finalize command will apply it
            // automatically. If a pending update already exists, replace it.
            let existing = lookup PendingFinalizerSetUpdate[]
            if existing is some {
                delete PendingFinalizerSetUpdate[]
            }
            create PendingFinalizerSetUpdate[]=>{
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

fact PendingFinalizerSetUpdate[]=> {
    new_finalizer1_pub_sign_key optional id,
    new_finalizer2_pub_sign_key optional id,
    new_finalizer3_pub_sign_key optional id,
    new_finalizer4_pub_sign_key optional id,
    new_finalizer5_pub_sign_key optional id,
    new_finalizer6_pub_sign_key optional id,
    new_finalizer7_pub_sign_key optional id,
}
```

#### New FFIs

The following new FFI functions are required. These handle operations that the policy language cannot express directly (cryptographic verification, multi-author envelopes, fact iteration over unbounded sets):

- **`init_finalizer_set(envelope, f1..f7)`** -- Initializes the finalizer set from the `Init` command. Validates that all specified key IDs are unique and valid, then creates a `Finalizer` fact for each. Defaults to the team owner if none are specified.
- **`verify_finalize_quorum(envelope)`** -- Reads the signatures from the multi-author envelope. For each signature, looks up the public signing key from the signing key ID (via the runtime's key store), verifies the signature against the current finalizer set and the command content. Stops once a quorum of valid, unique finalizer signatures is confirmed. Returns true once quorum is reached; returns false if all signatures are checked without reaching quorum.
- **`validate_new_finalizer_set(f1..f7)`** -- Validates the new finalizer set fields. Checks that the specified count is between 1 and 7, all key IDs are unique, all correspond to valid signing key IDs, and the new set does not shrink below 4 if currently at 4+. Returns true if valid.
- **`delete_all_finalizers()`** -- Deletes all current `Finalizer` facts. Required as an FFI because the policy language cannot iterate over an unbounded set of keyed facts.
- **`create_finalizers_from_pending(pending)`** -- Creates `Finalizer` facts from the fields of a `PendingFinalizerSetUpdate` value.
- **`latest_finalize_record()`** -- Returns the `FinalizeRecord` with the highest seq. Required as an FFI because the policy language cannot query for the maximum key value.
- **`verify_factdb_merkle_root(expected_root)`** -- Computes the FactDB Merkle root at the current evaluation point and returns true if it matches the expected root. Used by both the `Finalize` command and the `VerifyFinalizationProposal` ephemeral command.
- **`seal_multi_author(payload)`** -- Seals a multi-author command. The command ID is computed from the payload as usual. The envelope is created without signatures; they are attached later during signature collection.
- **`open_multi_author(envelope)`** -- Opens a multi-author envelope and returns the deserialized fields.

## BFT Consensus Protocol

This section defines the off-graph protocol that drives agreement among finalizers. The consensus protocol determines what to finalize and collects the signatures needed for the Finalize command. It does not directly interact with the graph -- it produces inputs that the finalization policy consumes.

The protocol is based on Tendermint and integrated via the [malachite](https://github.com/circlefin/malachite) library, which provides a standalone Rust implementation of the Tendermint algorithm. See [Library Selection](#library-selection) for the rationale.

### Initial Implementation

The initial implementation uses the team owner as the sole finalizer (single-finalizer mode). This provides finalization and truncation support without the complexity of multi-party BFT consensus. Teams can upgrade to a larger finalizer set (up to 7) when BFT safety is needed.

### Single Finalizer

When the finalizer set contains exactly one member, the BFT consensus protocol is skipped. The sole finalizer publishes a `Finalize` command directly with its own signature, which satisfies the quorum check (quorum of 1 is 1).

This is safe because the finalizer set is always established by a single authoritative source -- the `Init` command or a prior `Finalize` command that applied a pending update. Two devices cannot independently believe they are the sole finalizer at the same sequence number:

- At team creation, all devices process the same `Init` command and agree on the initial set.
- After a `Finalize` command applies a set change, the change was agreed upon by the previous quorum (they verified the pending update before voting). Devices that haven't synced this `Finalize` are still operating at the previous sequence number and cannot produce a valid `Finalize` at the new sequence number (the sequential check would fail).

### Triggering Finalization

Finalization is triggered in three ways:

1. **Periodic scheduling.** The `Init` command emits an effect that schedules the first finalization after a configured delay. Each successful `Finalize` command emits an effect scheduling the next one. Scheduling uses a delay (not wall clock time) -- the daemon tracks the delay locally. Only one finalization can be scheduled at a time; a shorter delay overwrites the current schedule.
2. **Daemon restart.** When a finalizer daemon comes back online, it attempts to trigger finalization. The daemon skips the attempt if it knows the last finalization was too recent based on its local delay tracking. If the daemon doesn't know (e.g. all finalizers were offline), it proceeds -- redundant proposals are harmless since consensus picks one.
3. **On-demand.** Any finalizer can initiate a round by signaling other finalizers via the off-graph consensus protocol.

In all cases, the initiating finalizer does not necessarily become the proposer -- the proposer is selected deterministically (see [Agreement](#phase-1-agreement)). If multiple finalizers trigger concurrently, consensus resolves to a single proposal.

### Finalization Round

A finalization round produces a single Finalize command for a specific sequence number. It may span multiple consensus rounds if proposals fail. Each consensus round is a single propose-prevote-precommit cycle. The finalization round has three phases: agreement (which may take multiple consensus rounds), signature collection, and commit.

#### Pre-Consensus Validation

Before voting in consensus, each finalizer independently validates the proposed FactDB Merkle root. The Finalize command does not exist yet at this point -- finalizers are validating the proposer's claimed state, not a command. This ensures that signatures certify verified state agreement, not just trust in the proposer. Each finalizer evaluates the `VerifyFinalizationProposal` ephemeral command (see [FactDB Merkle Root Verification](#factdb-merkle-root-verification)) at the proposed parent to confirm the Merkle roots match.

Finalizers that do not have the proposed parent sync with the proposer to obtain it. Each finalizer then:

1. **Computes the FactDB Merkle root** at the proposed parent from its local graph and FactDB.
2. **Verifies it matches** the proposed `factdb_merkle_root`. This is the core check -- it proves agreement on the state being finalized. If two nodes have the same parent command, the FactDB is guaranteed identical at that point.
3. **Checks the finalization epoch** -- The proposed parent must be after the last Finalize command (not re-finalizing already-finalized history).
4. **Checks the proposer** -- The proposing device must be in the current finalizer set.

Only after successful validation does the finalizer proceed to vote in consensus. The Finalize command itself is not constructed until after consensus reaches agreement (see [Signature Collection](#phase-2-signature-collection)).

#### Phase 1: Agreement

The goal of this phase is for finalizers to agree on a parent for the Finalize command -- the graph command whose ancestors will all be finalized.

**Proposer selection.** A deterministic function selects the proposer for each consensus round based on the derived sequence number and consensus round number (round-robin over the sorted finalizer set). All finalizers derive the same sequence number from their FactDB. If the selected proposer is offline, the consensus round times out and advances to the next consensus round with the next proposer in rotation.

**Proposal.** The proposer selects a parent for the Finalize command from its local graph (typically its current head or a recent command) and computes the FactDB Merkle root at that point. The proposal contains:

- **Round** -- The consensus round number within this finalization round (increments on timeout).
- **Parent** -- The graph command that the Finalize command will be appended to. This is not a payload field -- it is the position in the graph where the Finalize command is placed. All ancestors of the Finalize command become permanent.
- **FactDB Merkle root** -- The FactDB Merkle root at the proposed parent. Agreement on the Merkle root implies agreement on the sequence number, finalizer set, and any pending updates -- all are derivable from the FactDB.

**Sync and validate.** Each finalizer receives the proposal. If a finalizer does not have the proposed parent in its local graph, it syncs with the proposer to obtain it and all ancestor commands. Once the finalizer has the proposed parent, it validates the proposal by computing and comparing the FactDB Merkle root (see [Pre-Consensus Validation](#pre-consensus-validation)).

**Prevote.** If validation passes, the finalizer broadcasts a prevote for the proposal to all other finalizers. A finalizer prevotes nil if: validation fails, the proposed parent does not advance beyond the last Finalize command, or the FactDB Merkle root does not match.

If a quorum prevote nil, the round advances immediately to the next proposer.

**Precommit.** Every finalizer independently observes the prevotes. When a finalizer observes a quorum of prevotes for the same proposal, it broadcasts a precommit for that proposal to all other finalizers. If a quorum of nil prevotes is observed, or the prevote timeout expires without quorum, the finalizer precommits nil. All finalizers participate in both voting stages.

**Decision.** When a quorum of precommits is observed for the same proposal, the consensus round reaches agreement. If precommit quorum is not reached (nil quorum or timeout), the consensus round number increments and a new proposer is selected. The process repeats from the proposal step with the new proposer.

#### Phase 2: Signature Collection

Once agreement is reached on the parent of the Finalize command, each finalizer deterministically constructs the Finalize command payload from the agreed-upon FactDB Merkle root. Because the Merkle root is deterministic given the parent, every finalizer produces the same payload and therefore the same command ID.

Each finalizer signs the payload and requests signatures from the other finalizers. A finalizer stops requesting once it has collected at least a quorum of signatures.

Different finalizers may end up with different subsets of signatures -- any valid quorum-sized subset proves consensus.

#### Phase 3: Commit

Any finalizer that has collected a quorum of signatures attaches them to the envelope and commits the Finalize command locally to the graph. Multiple finalizers may independently commit with different signature subsets, but all produce the same command ID (see [Multi-Author Commands](#multi-author-commands)). The policy ensures only the first to be woven succeeds.

### Consensus Communication

Consensus messages are sent off-graph between finalizers. The only on-graph command produced by finalization is `Finalize`.

#### Transport

Consensus messages are sent over QUIC connections between finalizers. These may be separate connections from sync, or multiplexed on the existing sync connections -- connection reuse is an optimization, not a requirement. If finalization rounds are fast enough, dedicated connections avoid the complexity of multiplexing.

If connections are shared, each stream begins with a `MsgType` enum value to distinguish protocols:

```rust
enum MsgType {
    Sync,
    Consensus,
}
```

The QUIC server reads the `MsgType` when accepting a stream and routes it to the appropriate protocol handler. Streams with an unrecognized `MsgType` are closed immediately.

Finalizers open consensus streams only with other finalizers -- non-finalizer peers are unaffected and never see consensus traffic.

#### Finalizer Peer Configuration

Finalizer network addresses are configured at runtime via the client API:

- **`add_finalizer_peer(pub_signing_key_id, address)`** -- Registers a finalizer peer's network address. The local finalizer establishes (or reuses) a QUIC connection to this address for consensus communication.
- **`remove_finalizer_peer(pub_signing_key_id)`** -- Removes a finalizer peer.

The on-graph finalizer set contains only public signing key IDs. Mapping key IDs to network addresses is an operational concern handled outside the graph. When provisioning a finalizer device, the operator configures the network addresses of the other finalizers.

When the finalizer set changes (via an `UpdateFinalizerSet` command), peer configurations for finalizers no longer in the set are automatically removed. New finalizers must be configured by the operator before they can participate in consensus.

Non-finalizer devices do not need to configure finalizer peers.

**Broadcast pattern.** Consensus messages (proposals, votes, signature shares) are pushed to all configured finalizer peers. Each finalizer maintains connections to all other finalizers and sends messages directly -- there is no relay or gossip layer.

**Sender verification.** Each consensus message is signed by the sender's signing key. The recipient verifies the signature, confirms the signing key ID belongs to a member of the current finalizer set, and checks that the key ID matches the expected key ID for the QUIC connection's source address (based on the configured finalizer peer mappings). Messages that fail any of these checks are dropped.

#### Consensus Message Types

| Message | Transport | Sender | Description |
|---|---|---|---|
| `Proposal` | QUIC stream | Proposer | Proposed parent for the Finalize command and FactDB Merkle root |
| `Prevote` | QUIC stream | Finalizer | First-stage vote for or against a proposal |
| `Precommit` | QUIC stream | Finalizer | Second-stage vote to commit a proposal |
| `SignatureShare` | QUIC stream | Finalizer | Finalizer's signature over the agreed Finalize command content |

### Timeouts

A successful consensus round (no timeouts, no retries) is expected to complete in under a few seconds on a local network. Each consensus phase has a configurable timeout:

| Phase | Default Timeout | Behavior on Expiry |
|---|---|---|
| Propose | 30s | Prevote nil |
| Sync | 30s | Prevote nil (could not obtain the proposed parent from the proposer in time) |
| Prevote | 30s | Precommit nil |
| Precommit | 30s | Advance to next consensus round |

Timeouts increase linearly with each successive consensus round to accommodate network delays. This is standard Tendermint behavior -- longer timeouts give the network more time to deliver messages when earlier consensus rounds fail. All timeout values are configurable per deployment.

```
timeout(r) = base_timeout + r * timeout_increment
```

Where `r` is the consensus round number (starting at 0). The first consensus round uses `base_timeout`; each subsequent consensus round adds `timeout_increment` to give the network more time to deliver messages.

Consensus rounds can also fail fast without waiting for timeouts. If a finalizer receives an obviously invalid proposal (already-finalized sequence number, unknown parent, malformed content), it prevotes nil immediately. If a quorum prevote nil, the consensus round advances to the next proposer without waiting for any timeout.

### Daemon Startup and Fault Tolerance

Consensus state is not persisted -- all consensus messages are ephemeral QUIC messages. When a daemon starts or restarts, any in-progress finalization round is abandoned. The daemon determines finalization state from its local FactDB and automatically attempts to start a new finalization round (since it does not know when the last one occurred):

1. Query the highest `FinalizeRecord` seq to determine the last completed finalization.
2. Check if this device is in the current finalizer set (query `Finalizer` facts).
3. If a finalizer, connect to configured finalizer peers and join whatever consensus round is currently active. The Tendermint protocol handles late joiners without needing prior history.

A daemon being offline does not block finalization -- as long as a quorum remains online, consensus continues. Stalled rounds advance automatically via timeout. If all finalizers restart simultaneously, they independently determine the current sequence number from FactDB and the deterministic proposer rotation ensures they agree on who proposes first.

### Partition Handling

Finalization and normal graph operations are independent:

- **During partitions**: Non-finalizer devices continue publishing and syncing. If fewer than a quorum of finalizers can communicate, finalization halts but graph operations are unaffected.
- **After partition heals**: Devices sync and merge branches. Finalization resumes once a quorum can communicate. Finalizers that are missing the proposed parent sync with the proposer before voting -- this affects liveness, not safety.

### Equivocation Detection and Vote Visibility

**Equivocation.** Malachite detects conflicting votes from the same finalizer. This does not halt consensus; the protocol continues with honest finalizers.

**Vote logging.** Each finalizer logs votes observed during each consensus round: prevotes for/nil, precommits for/nil, equivocation evidence, and non-responsive nodes.

**Operator response.** Operators review vote logs to identify misbehaving finalizers. A device with the `UpdateFinalizerSet` permission can remove them via `UpdateFinalizerSet`.

### Integration with Malachite

The consensus protocol is implemented using the malachite library. The integration maps Aranya concepts (defined in [Terminology](#terminology) and [Formulas](#formulas)) to malachite abstractions:

| Malachite Concept | Aranya Mapping |
|---|---|
| `Value` | Finalize command content (factdb_merkle_root) and proposed parent |
| `ValueId` | Hash of the proposed Finalize command content (the FactDB Merkle root) |
| `Height` | Finalization sequence number (derived from FactDB) |
| `Validator` | Finalizer device. Malachite uses "validator" for what Aranya calls a "finalizer". |
| `ValidatorSet` | Current finalizer set. Derived from `Finalizer` facts. Updated atomically when a `Finalize` command applies a `PendingFinalizerSetUpdate`. |
| `Address` | Finalizer's `pub_signing_key_id` |
| `Vote` | Prevote/precommit QUIC messages |
| `Proposal` | Finalization proposal QUIC message |

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

This example walks through a complete finalization round with 4 finalizers (A, B, C, D). The FactDB shows 2 prior `FinalizeRecord` entries, so this will be seq 3 (derived). The round succeeds on the first consensus round (round 0).

1. **Initiation.** Finalizer A determines there are unfinalized commands and signals the other finalizers that a finalization round should begin.

2. **Proposer selection.** All finalizers derive seq=3 from their FactDB and independently compute the proposer: `sorted_finalizers[(3 + 0) % 4]` = B (for consensus round 0).

3. **Proposal.** B selects a parent for the Finalize command from its local graph, computes the FactDB Merkle root at that point, and broadcasts the proposal (round=0, proposed parent, factdb_merkle_root) to A, C, and D.

4. **Sync and validate.** Each finalizer receives the proposal and validates it:
   - A, C: Have the proposed parent. Validation passes (Merkle roots match). Broadcast prevote.
   - B: Also prevotes for its own proposal.
   - D: Missing the proposed parent. Syncs with B to obtain it, then validates. Merkle roots match. Broadcasts prevote.

5. **Precommit.** All finalizers observe 4 prevotes for the proposal (quorum = `(4 * 2 / 3) + 1` = 3). Each broadcasts a precommit.

6. **Decision.** All finalizers observe 4 precommits for the proposal. Agreement is reached.

7. **Signature collection.** Each finalizer constructs the Finalize command content (factdb_merkle_root=&lt;agreed root&gt;), signs it, and shares the signature. Each collects at least 3 signatures.

8. **Commit.** All four finalizers assemble the Finalize command with their collected signatures and commit it to their local graph. Because the command ID excludes signatures, all produce the same command ID. The first to be woven succeeds; duplicates are rejected because `FinalizeRecord[seq: 3]` already exists.

## Future Work

- **Role-based finalizer set management** -- The `UpdateFinalizerSet` permission can be delegated to roles other than Owner. Future work could add additional governance controls (e.g. requiring multiple approvals or time-delayed updates).
- **Graph-based consensus transport** -- Relay consensus messages as graph commands instead of requiring direct QUIC connections between finalizers. This would allow consensus to work through the existing sync topology without finalizers needing to know each other's network addresses. Requires graph support for non-permanent commands (e.g. truncation or branch-level garbage collection).
- **Weave Merkle root** -- Add a weave Merkle root alongside the FactDB Merkle root in the Finalize command. The weave Merkle tree would be built from command hashes in weave order. This enables truncation (retain only roots as compact proof of prior state) and light clients (verify finalized state without replaying the full weave). The FactDB Merkle root is already included in the Finalize command.
- **Truncation** -- Define a garbage collection strategy for finalized graph data. Requires Merkle roots to retain compact proofs of truncated state.
- **Light clients** -- Devices that verify Finalize commands without replaying the full weave.
- **Larger finalizer sets** -- Support finalizer sets beyond the current maximum of 7. This requires policy language support for collection types or additional FFI work to handle more fields.
- **Non-device finalizers** -- Support finalizers that are not full devices. Since finalization only requires a signing key, a lightweight finalizer process could participate in consensus without the full device stack. This would allow dedicated finalization infrastructure separate from team devices.
- **Finalization metrics** -- Monitoring and alerting for finalization latency and participation rates.
- **Finalizer set quorum validation** -- Validate that a new finalizer set can reach quorum before accepting the `UpdateFinalizerSet` command (e.g., verify that the specified devices are reachable and can participate in consensus). This is less critical while the owner can unilaterally change the set, but becomes more important if finalizer set management is delegated or consensus-based.
