---
layout: page
title: Finalization
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
| Proposer | The finalizer selected by the BFT protocol's deterministic round-robin to propose a finalization point for a given consensus round |
| Prevote | First-stage vote indicating a finalizer considers the proposal valid |
| Precommit | Second-stage vote indicating a finalizer is ready to commit the proposal |
| Quorum | The minimum number of finalizers required for a consensus decision (q) |
| Sequence number (seq) | Identifies a finalization round; increments with each successful Finalize command |

### Formulas

| Variable | Formula | Description |
|---|---|---|
| n | | Finalizer set size (1 to 7) |
| f | (n - 1) / 3 | Maximum number of Byzantine (malicious or faulty) finalizers the protocol can tolerate |
| q | (n * 2 / 3) + 1 | Quorum size -- the minimum number of finalizers required for a consensus decision. Ensures safety as long as at most f finalizers are Byzantine. |

## Scope

Finalization applies to the **control plane only** -- the persistent commands on the DAG that manage team membership, roles, labels, and AFC channel configuration. Ephemeral commands and AFC data plane traffic are not subject to finalization.

## Design Goals

1. **Safety** -- A Finalize command is only produced when a quorum of finalizers agree. No two conflicting Finalize commands can exist in the graph.
2. **Liveness** -- As long as a quorum of finalizers are online and can communicate, finalization makes progress.
3. **Offline tolerance** -- Non-finalizer devices continue operating normally (publishing commands, syncing) regardless of whether finalization is active. Finalization does not block graph operations.
4. **On-demand** -- Finalization rounds are initiated by a finalizer, not on a fixed schedule. The BFT protocol selects the proposer automatically.
5. **Deterministic verification** -- Any device can verify a Finalize command by checking its signatures against the current finalizer set.

## Threat Model

### Fault Model

The consensus protocol assumes the standard BFT fault model: at most f of the n finalizers may be Byzantine (malicious or arbitrarily faulty). We do not know in advance which nodes are Byzantine. The protocol must be safe regardless of which nodes are faulty, and live as long as a quorum (q) of honest nodes can communicate.

### Why Multi-Party Finalization

Single-finalizer mode (where the owner is the sole finalizer) is used for the initial implementation. Multi-party consensus extends the owner's finalization authority to a larger set of devices. Because the owner controls the finalizer set via `UpdateFinalizerSet`, the security of multi-party finalization is bounded by the security of the owner -- a compromised owner can undermine the finalizer set in either model. The primary benefits of multi-party are availability and defense against compromised non-owner finalizers:

| Concern | Single finalizer (owner) | Multi-party (BFT) |
|---|---|---|
| **Availability** | Owner offline = finalization halts | Owner delegates to finalizer set; finalization continues without the owner as long as a quorum of finalizers is online |
| **Compromised owner** | Can finalize arbitrary state | Same -- owner can replace the finalizer set via `UpdateFinalizerSet`. Security is equivalent in both models. |
| **Compromised non-owner finalizer** | N/A (no other finalizers) | Requires quorum agreement; single compromised finalizer limited to liveness disruption |
| **Accountability** | No independent verification | Multiple independent verifications; misbehavior detectable via vote logs |

### Attack Vectors and Mitigations

| Attack | Description | Mitigation |
|---|---|---|
| **Malicious proposer** | Proposes an invalid or self-serving finalization point | Every finalizer independently verifies the proposal and prevotes nil if invalid. Quorum cannot be reached without honest agreement. |
| **Blocking finalization** | Byzantine finalizer withholds votes to prevent quorum | Quorum requires q, not unanimity. Up to f unresponsive finalizers are tolerated. Offline proposer times out and rotation selects the next. |
| **Equivocation** | Finalizer sends conflicting votes in the same consensus round | Malachite detects equivocation with cryptographic evidence. Tendermint guarantees safety regardless. Owner can remove the finalizer via `UpdateFinalizerSet`. |
| **Compromised owner manipulates finalizer set** | Owner replaces finalizer set with devices they control | Owner is already the trust anchor (determines initial set in `Init`). Two-phase update requires quorum to sync and agree before the change is applied. Operational controls (monitoring, access restriction) are the primary defense. |
| **Non-owner finalizer set manipulation** | Byzantine finalizer tries to change the set | Only the owner can publish `UpdateFinalizerSet`. Non-owner finalizers cannot change the set. |
| **Stale finalization** | Proposer finalizes a point far behind the current head | Only delays finalization of recent commands. Round-robin rotation gives the next proposer a chance. Persistent stale proposals are detectable in vote logs. |
| **Network partition** | Attacker isolates finalizers to cause conflicting finalizations | Quorum requirement ensures at most one partition can finalize. Minority partition halts finalization; graph operations continue. Devices converge when the partition heals. |
| **Replay / duplicate Finalize** | Attacker replays a valid Finalize command | Policy rejects duplicates via `!exists FinalizeRecord[seq: this.seq]`. Payload-derived command ID means different signature subsets produce the same command. |

## Finalizer Set

The finalizer set is the group of devices authorized to participate in finalization consensus. Finalizer devices do not need to be members of the team -- they only need a signing key to participate in consensus and can sync graph commands like any other device. The finalizer set can only be changed by the team owner through a dedicated `UpdateFinalizerSet` command.

In the future, finalizers may not need to be devices at all, since all that matters is a signing key. For MVP, finalizers are assumed to be devices.

### Initialization

The initial finalizer set is established in the team's `Init` command. The `Init` command includes 7 optional finalizer fields (`finalizer1` through `finalizer7`), each containing a public signing key ID. The caller specifies 1 to 7 finalizers. If none are specified, the team owner's public signing key ID is used as the sole initial finalizer.

### Set Size and Quorum

The maximum supported set size is 7. (Malachite refers to the finalizer set as the "validator set".)

Consensus requires a quorum of the finalizer set (see terminology):

| n | f | q |
|---|---|---|
| 1 | 0 | 1 |
| 2 | 0 | 2 |
| 3 | 0 | 3 |
| 4 | 1 | 3 |
| 5 | 1 | 4 |
| 6 | 1 | 5 |
| 7 | 2 | 5 |

Sizes following the `n = 3f + 1` formula (1, 4, 7) give maximum fault tolerance for the fewest nodes. Other sizes are allowed but provide the same fault tolerance as the previous `3f + 1` threshold.

### Changing the Finalizer Set

The finalizer set is changed through a two-phase process:

1. **Request phase.** The team owner publishes an `UpdateFinalizerSet` command on the graph. This does not immediately change the active finalizer set. Instead, it creates a `PendingFinalizerSetUpdate` fact that stages the new set along with the command ID of the `UpdateFinalizerSet` command that created it.
2. **Apply phase.** A `Finalize` command can optionally apply a pending update. During consensus, finalizers exchange the command ID of the `UpdateFinalizerSet` they have (if any) during state exchange. If a quorum of finalizers report the same command ID, the proposer includes that command ID in the `Finalize` command's `apply_finalizer_set_update` field. The `Finalize` command then applies the update atomically -- deleting the old `Finalizer` facts, creating new ones from the pending update, and consuming the `PendingFinalizerSetUpdate` fact. If a quorum does not agree on the same command ID, the proposer leaves `apply_finalizer_set_update` as `None` and finalization proceeds without changing the finalizer set. The pending update remains for a future round.

This two-phase approach ensures that all finalizers have a globally consistent view of the finalizer set at each consensus round. If the `UpdateFinalizerSet` command directly modified `Finalizer` facts, different finalizers could have different views of the set depending on which graph commands they had synced, causing `verify_finalize_quorum` to produce inconsistent results across devices. By requiring a quorum to agree on the same `UpdateFinalizerSet` command ID before applying the change, finalization is never blocked by a pending set change that not enough finalizers have synced.

The set can grow or shrink freely, but once a team has 4 or more finalizers it cannot shrink below 4. This prevents losing BFT safety once established.

The owner already determines the initial finalizer set in the `Init` command, so restricting updates to the owner does not introduce new attack surface. Any finalizer node could previously propose a new set and get it approved by quorum (since honest nodes had no criteria to reject a structurally valid set). Restricting changes to the owner reduces the attack surface from any malicious finalizer to just the owner.

## Finalization Policy

This section defines the on-graph commands, facts, and policy rules that enforce finalization. The policy is evaluated independently by every device -- it does not depend on or interact with the off-graph consensus protocol.

### Multi-Author Commands

The Finalize command uses multi-author authentication instead of single-author authentication. Each signature represents an author -- a finalizer that endorsed the command. This is necessary because finalization represents agreement by a quorum of finalizers, not the action of a single device.

This requires a **new command type** in the `aranya-core` runtime. Existing commands assume a single author with a single signature. The multi-author command type extends the envelope to carry multiple signatures instead of one.

Key properties of multi-author commands:

- **Signatures live in the envelope, not the payload.** Single-author commands already store the signature in the envelope, separate from the payload. Multi-author commands follow the same pattern: the envelope carries multiple `(signing_key_id, signature)` pairs. The payload contains only the command fields (seq, apply_finalizer_set_update). Because the command ID is computed from the payload, and signatures are in the envelope, the ID computation does not change. Different valid subsets of author signatures produce the same command ID, which is critical -- multiple finalizers may independently commit the same Finalize command with different signature subsets, and the policy must treat them as the same command.
- **Multiple authors.** Instead of a single `get_author()` check, the policy verifies that the envelope contains a quorum of valid signatures from the current finalizer set. Each signature is an author endorsing the command.
- **New FFI functions.** Multi-author commands require new envelope FFI:
  - `seal_multi_author(payload)` -- Seals a multi-author command. The command ID is computed from the payload as usual. The envelope is created without signatures; they are attached later.
  - `open_multi_author(envelope)` -- Opens a multi-author envelope and returns the deserialized fields.
  - `verify_finalize_quorum(envelope)` -- Reads the signatures from the envelope and verifies a quorum against the current finalizer set.

### Finalize Command

The `Finalize` command makes all of its ancestors permanent. It is the only graph command produced by finalization.

Properties:

- **Priority**: 0 (processed before all non-ancestor commands in the weave).
- **Fields**:
  - `seq` -- The finalization sequence number. Ensures at most one Finalize command succeeds per finalization round, even if multiple are created concurrently on different branches. Also allows finalizers to coordinate off-graph on which finalization round is in progress and lets any node query finalization progress without traversing the graph.
  - `apply_finalizer_set_update` -- Optional command ID of the `UpdateFinalizerSet` command to apply. Set by the proposer when a quorum of finalizers agreed on the same `UpdateFinalizerSet` command ID during state exchange. When `None`, no finalizer set change is applied.
- **Envelope**: Contains multiple `(signing_key_id, signature)` pairs from the finalizers that authored this command. Only finalizers that participated are included.
- **Policy checks**:
  - The envelope contains at least a quorum of valid signatures from unique members of the current finalizer set.
  - No `FinalizeRecord` exists at this sequence number (prevents duplicates).
  - The sequence number is sequential (previous seq must be finalized, or seq is 1).
  - If `apply_finalizer_set_update` is provided, a `PendingFinalizerSetUpdate` fact must exist with a matching command ID.
- **Side effects**:
  - Creates a `FinalizeRecord` at this sequence number.
  - If `apply_finalizer_set_update` is provided and matches the pending update's command ID, applies the update: deletes all current `Finalizer` facts, creates new ones from the `PendingFinalizerSetUpdate` fact, and deletes the `PendingFinalizerSetUpdate` fact. The new set takes effect for the next finalization round (seq + 1). If `apply_finalizer_set_update` is `None`, the current `Finalizer` facts and any pending update are left unchanged.

The envelope signatures serve as a compact proof of consensus. Any device can verify that a quorum of finalizers authored the finalization using only the Finalize command itself, without any knowledge of the off-graph consensus protocol.

### Finalize Ordering Guarantee

All Finalize commands in the graph must form a chain -- for any two Finalize commands, one must be an ancestor of the other. This is enforced by:

1. The BFT consensus protocol ensures only one Finalize command is produced per sequence number.
2. The policy rejects duplicate Finalize commands at the same sequence number (`!exists FinalizeRecord[seq: this.seq]`).
3. Sequential sequence number enforcement (`exists FinalizeRecord[seq: this.seq - 1]`) ensures each Finalize builds on the previous one. Since the previous `FinalizeRecord` is created by the prior Finalize command, the new Finalize must be a descendant of it in the graph. Because finalization covers ancestors, and each Finalize is a descendant of the prior one, the finalized set can only grow forward -- it is impossible to finalize an older point after a newer one.
4. Because the command ID excludes signatures, multiple finalizers committing the same Finalize produce the same command -- the first succeeds and duplicates are rejected.

### Finalization and Branches

Finalization advances along a single chain. Only commands in the ancestry of the Finalize command are finalized -- commands on unmerged branches are not. This means:

- The proposer selects a finalization point along the longest merged branch it knows about.
- Unmerged branches remain unfinalized but continue operating normally.
- As devices sync and merge branches into the finalized branch, those commands become eligible for finalization in subsequent rounds.
- No explicit merge step is required before finalization -- merges happen naturally through sync, and the next finalization round covers the newly merged commands.

Branches do not finalize in parallel. Parallel finalization would produce Finalize commands that are not ancestors of each other, violating the chain guarantee. The graph must converge through merges before commands on separate branches can be finalized.

### Post-Finalization

Once a Finalize command is committed to the graph:

- All commands that are ancestors of the Finalize command are permanently accepted. Their effects in the FactDB are irreversible.
- Commands on branches that conflict with the finalized weave are permanently recalled.
- Devices can truncate graph data for finalized commands, retaining only the Finalize command as a compact proof of the finalized state.

### Finalizer Set Changes

The finalizer set is changed through the two-phase process described in [Changing the Finalizer Set](#changing-the-finalizer-set). The finalizer set for seq N is determined by the `Finalizer` facts at the time the `Finalize` command for seq N is evaluated. Because set changes are only applied atomically by `Finalize` commands, the finalizer set is always globally consistent -- all devices that have processed the same `Finalize` commands agree on the same set.

When the owner publishes an `UpdateFinalizerSet` command:

- The new set size must be between 1 and 7.
- All specified key IDs must be unique.
- All key IDs must be valid public signing key IDs.
- Once the set has reached 4 or more members, it cannot shrink below 4.
- The command creates a `PendingFinalizerSetUpdate` fact. The active `Finalizer` facts are not modified.
- If a `PendingFinalizerSetUpdate` already exists (from a previous `UpdateFinalizerSet` that hasn't been applied yet), the new one replaces it.
- The pending update is applied by the next `Finalize` command that is committed to the graph.

If validation fails, the `UpdateFinalizerSet` command is rejected. No pending update is created.

#### Consensus Validation of Finalizer Set Changes

The proposer decides whether to include a finalizer set change based on state exchange data. During state exchange, each finalizer reports the command ID of the `UpdateFinalizerSet` command that created its `PendingFinalizerSetUpdate` fact (if any). The proposer checks whether a quorum of finalizers reported the same command ID. If so, the proposal includes that command ID in the `apply_finalizer_set_update` field. If not -- because finalizers have different pending updates, or not enough have synced the update yet -- the proposer leaves `apply_finalizer_set_update` as `None` and finalization proceeds normally without changing the set.

This design ensures that:

- **Finalization is never blocked by a pending set change.** If not enough finalizers have synced the `UpdateFinalizerSet` command, finalization proceeds without applying the update. The pending update remains for a future round.
- **The old finalizer set is preserved until the change is confirmed.** The `Finalize` command only applies the pending update when `apply_finalizer_set_update` contains a command ID. If the proposer omits the set change or the round fails, the current `Finalizer` facts remain untouched.
- **All finalizers agree on the same update.** By comparing command IDs rather than just checking for the existence of a pending update, finalizers ensure they are all applying the same `UpdateFinalizerSet` command. This prevents inconsistencies when the owner has published multiple `UpdateFinalizerSet` commands and different finalizers have synced different ones.

Each finalizer that receives a proposal with `apply_finalizer_set_update` set independently verifies that its local `PendingFinalizerSetUpdate` fact has a matching command ID. If it doesn't match (or the finalizer has no pending update), it prevotes nil. Because the proposer only includes the command ID when a quorum already reported the same one during state exchange, this nil vote should be rare -- it only occurs if a finalizer's state changed between state exchange and prevote.

**Known limitation:** Because finalizer set changes are applied through the `Finalize` command, a set change cannot proceed if finalization itself is stalled (e.g., finalizers cannot agree on a finalization point). In practice this is unlikely -- the proposer picks the common ancestor of all heads, so even with divergent graph views there is always some common ancestor to finalize. If this becomes a problem, a standalone consensus round for validator set changes (independent of finalization) could be added.

### Policy Definitions

#### Init Command Changes

The `Init` command is extended with 7 optional finalizer fields. The caller specifies 1 to 7 finalizers. If none are provided, the team owner is the sole finalizer. The policy also creates an initial `FinalizeRecord` at seq 0 so the Finalize command's sequential check has no special case for the first finalization.

```policy
command Init {
    fields {
        // ... existing fields ...
        finalizer1 optional bytes,
        finalizer2 optional bytes,
        finalizer3 optional bytes,
        finalizer4 optional bytes,
        finalizer5 optional bytes,
        finalizer6 optional bytes,
        finalizer7 optional bytes,
    }

    // ... existing seal/open ...

    policy {
        // ... existing init logic ...

        // Initialize finalizer set (1 to 7 finalizers).
        // If none provided, default to team owner as sole finalizer.
        check init_finalizer_set(
            this.finalizer1, this.finalizer2,
            this.finalizer3, this.finalizer4,
            this.finalizer5, this.finalizer6,
            this.finalizer7, envelope,
        )

        // Create initial FinalizeRecord so seq 1 has a predecessor.
        finish {
            create FinalizeRecord[seq: 0]=>{}
        }
    }
}

fact Finalizer[signing_key_id bytes]=>{}
```

The `init_finalizer_set` FFI validates the specified finalizers (1 to 7). It checks that all key IDs are unique and correspond to valid signing key IDs, then creates a `Finalizer` fact for each. When none are provided, it creates a single `Finalizer` fact for the team owner's public signing key ID.

#### Finalize Command

```policy
command Finalize {
    attributes {
        priority: 0
    }

    fields {
        seq int,
        apply_finalizer_set_update optional bytes,
    }

    // Signatures are in the envelope, not the payload.
    // Command ID is computed from the payload as usual.
    seal { return seal_multi_author(serialize(this)) }
    open { return deserialize(open_multi_author(envelope)) }

    policy {
        check team_exists()

        // Verify quorum of valid signatures from the envelope.
        check verify_finalize_quorum(envelope)

        // Sequence number must be sequential.
        check exists FinalizeRecord[seq: this.seq - 1]

        // No conflicting Finalize at this sequence number.
        check !exists FinalizeRecord[seq: this.seq]

        // If applying a finalizer set update, verify the pending
        // update exists and its command ID matches.
        if this.apply_finalizer_set_update != None {
            let pending = check_unwrap query PendingFinalizerSetUpdate[]
            check pending.command_id == this.apply_finalizer_set_update
        }

        finish {
            create FinalizeRecord[
                seq: this.seq,
            ]=>{}

            // Apply the pending finalizer set update if specified.
            // This deletes all current Finalizer facts, creates new ones
            // from the pending update, and deletes the pending update fact.
            if this.apply_finalizer_set_update != None {
                apply_pending_finalizer_set_update()
            }
        }
    }
}

fact FinalizeRecord[seq int]=>{}
```

#### UpdateFinalizerSet Command

The `UpdateFinalizerSet` command allows the team owner to request a finalizer set change. It is a standard single-author command -- only the team owner is authorized to publish it. This command does not directly change the active finalizer set. Instead, it stages a pending update that the next `Finalize` command applies atomically.

```policy
command UpdateFinalizerSet {
    fields {
        new_finalizer1 optional bytes,
        new_finalizer2 optional bytes,
        new_finalizer3 optional bytes,
        new_finalizer4 optional bytes,
        new_finalizer5 optional bytes,
        new_finalizer6 optional bytes,
        new_finalizer7 optional bytes,
    }

    seal { return seal(serialize(this)) }
    open { return deserialize(open(envelope)) }

    policy {
        check team_exists()

        // Only the team owner can update the finalizer set.
        let author = get_author(envelope)
        check is_owner(author)

        // Validate the new finalizer set (structural checks only).
        check validate_new_finalizer_set(
            this.new_finalizer1, this.new_finalizer2,
            this.new_finalizer3, this.new_finalizer4,
            this.new_finalizer5, this.new_finalizer6,
            this.new_finalizer7,
        )

        finish {
            // Stage the update. The next Finalize command will apply it.
            // If a pending update already exists, replace it.
            stage_pending_finalizer_set_update(
                command_id(envelope),
                this.new_finalizer1, this.new_finalizer2,
                this.new_finalizer3, this.new_finalizer4,
                this.new_finalizer5, this.new_finalizer6,
                this.new_finalizer7,
            )
        }
    }
}

fact PendingFinalizerSetUpdate[]=> {
    command_id bytes,
    new_finalizer1 optional bytes,
    new_finalizer2 optional bytes,
    new_finalizer3 optional bytes,
    new_finalizer4 optional bytes,
    new_finalizer5 optional bytes,
    new_finalizer6 optional bytes,
    new_finalizer7 optional bytes,
}
```

#### New FFIs

The following new FFI functions are required. These handle operations that the policy language cannot express directly (cryptographic verification, fact iteration):

- **`init_finalizer_set(f1..f7, envelope)`** -- Initializes the finalizer set from the `Init` command. Accepts 1 to 7 finalizer fields (remaining fields `None`). Validates that all specified key IDs are unique and correspond to valid signing key IDs, then creates a `Finalizer` fact for each. If all are `None`, creates a single `Finalizer` fact for the team owner's public signing key ID.
- **`verify_finalize_quorum(envelope)`** -- Reads the signatures from the multi-author envelope. Verifies each signature against the current finalizer set and the command content. Returns true if at least a quorum of valid, unique finalizer signatures are present.
- **`validate_new_finalizer_set(f1..f7)`** -- Validates the new finalizer set fields. Checks that the specified count is between 1 and 7, all key IDs are unique, all correspond to valid signing key IDs, and the new set does not shrink below 4 if currently at 4+. Returns true if valid.
- **`stage_pending_finalizer_set_update(command_id, f1..f7)`** -- Creates or replaces a `PendingFinalizerSetUpdate` fact with the command ID of the `UpdateFinalizerSet` command and the specified finalizer key IDs. If a pending update already exists, it is replaced.
- **`apply_pending_finalizer_set_update()`** -- Reads the `PendingFinalizerSetUpdate` fact, deletes all current `Finalizer` facts, creates new `Finalizer` facts from the pending update's fields, and deletes the `PendingFinalizerSetUpdate` fact.
- **`seal_multi_author(payload)`** -- Seals a multi-author command. The command ID is computed from the payload as usual. The envelope is created without signatures; they are attached later during signature collection.
- **`open_multi_author(envelope)`** -- Opens a multi-author envelope and returns the deserialized fields.

## BFT Consensus Protocol

This section defines the off-graph protocol that drives agreement among finalizers. The consensus protocol determines what to finalize and collects the signatures needed for the Finalize command. It does not directly interact with the graph -- it produces inputs that the finalization policy consumes.

The protocol is based on Tendermint and integrated via the [malachite](https://github.com/circlefin/malachite) library, which provides a standalone Rust implementation of the Tendermint algorithm.

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

**Decision: Malachite.** It is the only library that provides a standalone, embeddable Tendermint consensus engine without requiring an external process or specific networking stack. This is critical for Aranya because consensus must run inside the daemon process and communicate over QUIC connections. Tendermint's O(n^2) message complexity is acceptable for our small finalizer sets (1-13 members). The underlying Tendermint algorithm is battle-tested across 100+ Cosmos ecosystem blockchains via CometBFT. Malachite itself is a newer Rust reimplementation by Informal Systems and Circle, but its co-design with TLA+ formal specs provides confidence in correctness despite its shorter production history.

### Architecture

The BFT consensus protocol lives above `aranya-core`. The `aranya-core` runtime does not depend on or know about the consensus implementation. This separation allows applications to choose their own consensus algorithm if needed -- the finalization policy on the graph is consensus-agnostic and only cares that the Finalize command carries a valid quorum of signatures.

```
┌──────────────────────────────────────────────────────────┐
│                       aranya-daemon                       │
│                                                          │
│  ┌──────────────────────┐  ┌───────────────────────────┐ │
│  │    BFT Consensus     │  │      Sync Protocol        │ │
│  │    (malachite)       │  │                           │ │
│  │                      │  │  - Graph replication      │ │
│  │  - State exchange    │  │  - Command delivery       │ │
│  │  - Propose/vote      │  │                           │ │
│  │  - Signature collect │  │                           │ │
│  └──────────┬───────────┘  └─────────────┬─────────────┘ │
│             │                            │               │
│             ▼                            ▼               │
│  ┌───────────────────────────────────────────────────┐   │
│  │                 aranya-core Runtime                │   │
│  │                                                   │   │
│  │  - Graph (DAG)                                    │   │
│  │  - FactDB                                        │   │
│  │  - Policy evaluation                             │   │
│  │                                                   │   │
│  │  ┌─────────────────────┐  ┌─────────────────────┐ │   │
│  │  │ Finalization Policy │  │  Finalization FFIs   │ │   │
│  │  │                     │  │                      │ │   │
│  │  │ - Finalize cmd      │  │ - seal/open_multi_   │ │   │
│  │  │ - UpdateFinalizer   │  │   author             │ │   │
│  │  │   Set cmd           │  │ - verify_finalize_   │ │   │
│  │  │ - FinalizeRecord    │  │   quorum             │ │   │
│  │  │ - PendingFinalizer  │  │ - init/validate/     │ │   │
│  │  │   SetUpdate         │  │   stage/apply_       │ │   │
│  │  │                     │  │   finalizer_set      │ │   │
│  │  └─────────────────────┘  └─────────────────────┘ │   │
│  └───────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │               QUIC Transport                      │    │
│  │                                                   │    │
│  │  - Consensus messages (finalizer ↔ finalizer)     │    │
│  │  - Sync messages (device ↔ device)                │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

Key architectural boundaries:

- **aranya-core runtime** knows nothing about consensus. It evaluates the finalization policy (Finalize, UpdateFinalizerSet commands) the same way it evaluates any other policy.
- **Finalization policy** defines the on-graph commands, facts, and rules. **Finalization FFIs** implement operations the policy language cannot express directly: multi-author envelope handling, quorum verification, and finalizer set management.
- **BFT consensus** and **sync** are peer protocols in the daemon layer. Both interact with aranya-core: consensus produces Finalize commands, sync replicates them.
- **QUIC transport** is shared between consensus and sync, distinguished by stream type.

The BFT consensus crate may live in the `aranya-core` repository for convenience, but it is not a dependency of the core runtime. It is consumed by the daemon or application layer, which is responsible for:

- Running the consensus protocol (malachite integration).
- Managing QUIC connections to finalizer peers.
- Assembling and committing Finalize commands to the graph.

### Initial Implementation

The initial implementation uses the team owner as the sole finalizer (single-finalizer mode). This provides finalization and truncation support without the complexity of multi-party BFT consensus. Teams can upgrade to a larger finalizer set (up to 7) when BFT safety is needed.

### Single Finalizer

When the finalizer set contains exactly one member, the BFT consensus protocol is skipped. The sole finalizer publishes a `Finalize` command directly with its own signature, which satisfies the quorum check (quorum of 1 is 1).

This is safe because the finalizer set is always established by a single authoritative source -- the `Init` command or a prior `Finalize` command that applied a pending update. Two devices cannot independently believe they are the sole finalizer at the same sequence number:

- At team creation, all devices process the same `Init` command and agree on the initial set.
- After a `Finalize` command applies a set change, the change was agreed upon by the previous quorum (they verified the pending update before voting). Devices that haven't synced this `Finalize` are still operating at the previous sequence number and cannot produce a valid `Finalize` at the new sequence number (the sequential check would fail).

### Triggering Finalization

Any finalizer can initiate finalization when:

1. There are unfinalized commands in the graph beyond the last Finalize command.
2. The finalizer has synced with enough peers to have a reasonably complete view of the graph.

Initiation signals to the other finalizers that a finalization round should begin. The initiating finalizer does not become the proposer -- the BFT protocol's deterministic round-robin selects the proposer based on the current sequence number and consensus round number. If multiple finalizers initiate concurrently, they converge on the same consensus round since they all compute the same proposer independently.

### Finalization Round

A finalization round produces a single Finalize command for a specific sequence number. It may span multiple consensus rounds if proposals fail. Each consensus round is a single propose-prevote-precommit cycle. The finalization round has three phases: agreement (which may take multiple consensus rounds), signature collection, and commit.

#### Phase 1: Agreement

The goal of this phase is for finalizers to agree on which graph head to finalize.

**Proposer selection.** A deterministic function selects the proposer for each consensus round based on the current sequence number and consensus round number (round-robin over the sorted finalizer set). All finalizers compute the same proposer independently. If the selected proposer is offline, the consensus round times out and advances to the next consensus round with the next proposer in rotation.

**State exchange.** When a round begins, each finalizer sends a state exchange message to all other finalizers containing its current graph head and, if it has a `PendingFinalizerSetUpdate` fact, the command ID of the `UpdateFinalizerSet` command that created it. This allows the proposer to determine a finalization point that all finalizers can agree on and whether a quorum agrees on the same pending finalizer set update.

**Proposal.** The proposer collects the state exchange messages and computes the common ancestor of the participating finalizers' graph heads. The finalization point is this common ancestor -- the furthest point in the graph that all finalizers can verify. The proposer computes the weave from the last Finalize command (or graph root if none exists) to the finalization point. The proposal contains:

- **Seq** -- The finalization sequence number.
- **Round** -- The consensus round number within this finalization round (increments on timeout).
- **Finalization point** -- The graph command up to which the weave is finalized.
- **Apply finalizer set update** -- The command ID of the `UpdateFinalizerSet` command to apply, or `None`. The proposer includes the command ID only if a quorum of finalizers reported the same command ID during state exchange. This allows other finalizers to verify they have the same pending update before voting.

**Prevote.** Every finalizer (including the proposer) receives the proposal and independently verifies it by computing the weave from the same starting point to the proposed finalization point. If the finalizer can verify the proposal (it has all the commands and they produce a valid weave), it broadcasts a prevote for the proposal to all other finalizers. If it cannot verify the proposal (due to missing commands, different graph state, or invalid proposal), the finalizer prevotes nil.

Finalizers must prevote nil immediately for proposals that are obviously invalid -- for example, a sequence number that has already been finalized, a finalization point that does not advance beyond the last Finalize command, or a finalization point the finalizer cannot verify. If the proposal includes an `apply_finalizer_set_update` command ID, a finalizer must also prevote nil if it does not have a `PendingFinalizerSetUpdate` fact with a matching command ID in its local FactDB. This ensures a finalizer set change only proceeds when the finalizers that voted for the proposal all agree on exactly which `UpdateFinalizerSet` command is being applied.

If a quorum prevote nil, the round advances immediately to the next proposer. Nil prevotes include the finalizer's current graph head so the next proposer can make a better-informed proposal.

**Precommit.** Every finalizer independently observes the prevotes. When a finalizer observes a quorum of prevotes for the same proposal, it broadcasts a precommit for that proposal to all other finalizers. If a quorum of nil prevotes is observed, or the prevote timeout expires without quorum, the finalizer precommits nil. All finalizers participate in both voting stages.

**Decision.** When a quorum of precommits is observed for the same proposal, the consensus round reaches agreement. If precommit quorum is not reached (nil quorum or timeout), the consensus round number increments and a new proposer is selected. The process repeats from the state exchange step.

#### Phase 2: Signature Collection

Once agreement is reached on the finalization point, each finalizer deterministically constructs the Finalize command payload from the agreed-upon proposal (seq, apply_finalizer_set_update). Because the fields are deterministic given the proposal, every finalizer produces the same payload and therefore the same command ID.

Each finalizer signs the payload and sends its signature to the other finalizers. Finalizers collect signatures until they have at least a quorum.

Different finalizers may end up with different subsets of signatures -- this is fine. Any valid quorum-sized subset proves consensus. The command ID is derived from the payload, so it is the same regardless of which signatures are in the envelope.

#### Phase 3: Commit

Any finalizer that has collected a quorum of signatures attaches them to the envelope and commits the Finalize command locally to the graph. Multiple finalizers may independently commit the same command with different signature subsets in their envelopes. Because the command ID is derived from the payload (not the signatures), these are logically the same command -- they share the same command ID and are treated identically by the graph. The policy's `!exists FinalizeRecord[seq: this.seq]` check ensures only the first to be woven succeeds; subsequent copies are recognized as the same command and ignored.

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

When the finalizer set changes (via an `UpdateFinalizerSet` command from the team owner), peer configurations for finalizers no longer in the set are automatically removed. New finalizers must be configured by the operator before they can participate in consensus.

Non-finalizer devices do not need to configure finalizer peers.

**Broadcast pattern.** Consensus messages (proposals, votes, signature shares) are pushed to all configured finalizer peers. Each finalizer maintains connections to all other finalizers and sends messages directly -- there is no relay or gossip layer.

**Sender verification.** Each consensus message is signed by the sender's signing key. The recipient verifies the signature, confirms the signing key ID belongs to a member of the current finalizer set, and checks that the key ID matches the expected key ID for the QUIC connection's source address (based on the configured finalizer peer mappings). Messages that fail any of these checks are dropped.

#### Consensus Message Types

| Message | Transport | Sender | Description |
|---|---|---|---|
| `StateExchange` | QUIC stream | Finalizer | Current graph head and pending `UpdateFinalizerSet` command ID (if any) |
| `Proposal` | QUIC stream | Proposer | Proposed finalization point |
| `Prevote` | QUIC stream | Finalizer | First-stage vote for or against a proposal |
| `Precommit` | QUIC stream | Finalizer | Second-stage vote to commit a proposal |
| `SignatureShare` | QUIC stream | Finalizer | Finalizer's signature over the agreed Finalize command content |

All consensus messages are signed by the sending finalizer's signing key. Recipients verify the signature and that the sender is a member of the current finalizer set before processing.

### Timeouts

Each consensus phase has a configurable timeout:

| Phase | Default Timeout | Behavior on Expiry |
|---|---|---|
| State Exchange | 30s | Proposer uses heads received so far |
| Propose | 30s | Prevote nil |
| Prevote | 30s | Precommit nil |
| Precommit | 30s | Advance to next consensus round |

Timeouts increase linearly with each successive consensus round to accommodate network delays. This is standard Tendermint behavior -- longer timeouts give the network more time to deliver messages when earlier consensus rounds fail. All timeout values are configurable per deployment.

```
timeout(r) = base_timeout + r * timeout_increment
```

Where `r` is the consensus round number (starting at 0). The first consensus round uses `base_timeout`; each subsequent consensus round adds `timeout_increment` to give the network more time to deliver messages.

Consensus rounds can also fail fast without waiting for timeouts. If a finalizer receives an obviously invalid proposal (already-finalized sequence number, unknown parent, malformed content), it prevotes nil immediately. If a quorum prevote nil, the consensus round advances to the next proposer without waiting for any timeout.

### Daemon Startup

Consensus state is not persisted. All consensus messages (proposals, votes, signature shares) are ephemeral QUIC messages. When a daemon starts or restarts, any in-progress finalization round that was not committed to the graph is simply abandoned -- there is nothing to recover.

The daemon determines the current finalization state entirely from its local FactDB:

1. Query the highest `FinalizeRecord` seq to determine the last completed finalization.
2. Check if this device is in the current finalizer set (query `Finalizer` facts).
3. If a finalizer, connect to configured finalizer peers. If other finalizers are already in a finalization round, the Tendermint protocol handles late joiners -- the daemon participates in whatever consensus round is currently active without needing prior history. If no finalization round is active, the daemon waits for a finalizer to initiate one.

A daemon being offline does not block finalization. As long as a quorum of finalizers remains online, consensus rounds continue without the offline daemon. When the daemon comes back online, it syncs any Finalize commands it missed and can participate in or initiate the next finalization round.

### Equivocation Detection and Vote Visibility

Finalizers must have visibility into how other finalizers voted during consensus rounds. This serves two purposes: detecting Byzantine behavior and informing the team owner about potential finalizer set changes.

**Equivocation.** Malachite detects equivocation -- when a finalizer sends conflicting votes (e.g., prevoting for two different proposals in the same consensus round). Equivocation does not halt consensus; the protocol continues as long as a quorum of honest finalizers are available.

**Vote logging.** Each finalizer logs the votes it observes from all other finalizers during each consensus round within a finalization round, including:

- Which finalizers prevoted for the proposal vs. nil.
- Which finalizers precommitted for the proposal vs. nil.
- Equivocation evidence (conflicting votes with signatures from the same finalizer).
- Which finalizers did not respond within the timeout (potential offline or partitioned nodes).

**Operator response.** Operators can review vote logs to identify finalizers that are consistently voting against the majority, equivocating, or failing to participate. This evidence can justify the team owner removing a compromised or faulty device from the finalizer set via an `UpdateFinalizerSet` command, or removing the device from the team entirely if its signing key is believed compromised.

### Partition Handling

Finalization and normal graph operations are independent:

- **During partitions**: Non-finalizer devices continue publishing commands and syncing with reachable peers. The graph branches as normal. If fewer than a quorum of finalizers can communicate, finalization halts but graph operations are unaffected.
- **After partition heals**: Devices sync and merge branches. Once a quorum of finalizers can communicate again, finalization resumes. The next Finalize command will cover all commands accumulated during the partition.

Finalizers that were partitioned and have a stale view of the graph will prevote nil until they sync enough state to verify the proposal. This is safe -- it only affects liveness, not safety.

#### Fault Tolerance

The consensus protocol is resilient to finalizers going offline and coming back:

- **Consensus messages** (state exchanges, proposals, votes, signature shares) are off-graph QUIC messages. They are not persisted. A returning finalizer does not need the prior consensus history.
- **The Tendermint protocol handles late joiners.** A finalizer that comes back online reconnects to other finalizers over QUIC and joins whatever consensus round is currently active. It can prevote and precommit in the current consensus round without knowledge of prior consensus rounds.
- **Stalled consensus rounds advance automatically.** If a consensus round stalls because the proposer went offline, the timeout expires and the next proposer takes over. No manual intervention is needed.

If all finalizers go offline simultaneously and come back online, they restart the consensus protocol from scratch. Each finalizer independently determines the current sequence number (from the last `FinalizeRecord` in its FactDB) and begins a new finalization round. The deterministic proposer rotation ensures they agree on which finalizer proposes first.

### Integration with Malachite

The consensus protocol is implemented using the malachite library. The integration maps Aranya concepts to malachite abstractions:

| Malachite Concept | Aranya Mapping |
|---|---|
| `Value` | Finalize command content (seq, finalization point, apply_finalizer_set_update) |
| `ValueId` | Hash of the proposed Finalize command content |
| `Height` | Finalization sequence number (seq) |
| `Validator` | Finalizer device. Malachite uses "validator" for what Aranya calls a "finalizer". |
| `ValidatorSet` | Current finalizer set. Derived from `Finalizer` facts. Updated atomically when a `Finalize` command applies a `PendingFinalizerSetUpdate`. |
| `Address` | Finalizer's `pub_signing_key_id` |
| `Vote` | Prevote/precommit QUIC messages |
| `Proposal` | Finalization proposal QUIC message |

#### Malachite Context Implementation

The `Context` trait is implemented with:

- **`select_proposer`** -- Deterministic selection from the sorted finalizer set using `seq + consensus_round` as index modulo finalizer count.
- **`new_proposal`** -- Constructs a proposal containing the finalization point.
- **`new_prevote` / `new_precommit`** -- Constructs vote messages signed with the finalizer's signing key.

## Example: Full Finalization Round-Trip

This example walks through a complete finalization round with 4 finalizers (A, B, C, D) performing finalization at seq 3. The round succeeds on the first consensus round (round 0).

1. **Initiation.** Finalizer A determines there are unfinalized commands and signals the other finalizers that a finalization round should begin.

2. **State exchange.** Each finalizer sends its current graph head to all others. A, B, and C have similar heads; D is slightly behind.

3. **Proposer selection.** All finalizers independently compute the proposer: `sorted_finalizers[(3 + 0) % 4]` = B (for consensus round 0 of seq 3).

4. **Proposal.** B computes the common ancestor of the received heads and proposes it as the finalization point. B broadcasts the proposal (seq=3, round=0, finalization point) to A, C, and D.

5. **Prevote.** Each finalizer verifies the proposal by computing the weave to the proposed finalization point:
   - A, C: Can verify. Broadcast prevote for the proposal.
   - B: Also prevotes for its own proposal.
   - D: Missing some commands. Prevotes nil (includes its current head so the next proposer knows D's state).

6. **Precommit.** A, B, and C each observe 3 prevotes for the proposal (quorum = `(4 * 2 / 3) + 1` = 3). Each broadcasts a precommit.

7. **Decision.** All finalizers observe 3 precommits for the proposal. Agreement is reached.

8. **Signature collection.** Each finalizer constructs the Finalize command content (seq=3, apply_finalizer_set_update=None), signs it, and shares the signature. Each collects at least 3 signatures.

9. **Commit.** A, B, and C each assemble the Finalize command with their collected signatures and commit it to their local graph. Because the command ID excludes signatures, all three produce the same command ID. The first to be woven succeeds; duplicates are rejected by `!exists FinalizeRecord[seq: 3]`.

10. **Sync.** D syncs with another finalizer, receives the Finalize command, and processes it. D's policy independently verifies the quorum of signatures and creates the `FinalizeRecord`. All ancestors of the Finalize command are now permanent on D's graph.

## Security Considerations

See [Threat Model](#threat-model) for the fault model, attack vectors, and mitigations. Key operational recommendations:

- Specify at least 4 finalizer devices to tolerate 1 Byzantine fault (7 for 2 faults). A team with fewer than 4 finalizers has no Byzantine fault tolerance. Once a team has 4 or more finalizers, it cannot shrink below 4.
- Monitor vote logs for equivocation, consistent nil voting, and non-participation. The team owner can remove misbehaving finalizers via `UpdateFinalizerSet`.
- Restrict access to the owner device, as it is the trust anchor for the finalizer set.

## Future Work

- **Delegating finalizer set management** -- Allow the owner to delegate the ability to update the finalizer set to other roles. This could be implemented by introducing a dedicated `UpdateFinalizerSet` permission that the owner can assign to trusted roles (e.g. a dedicated "Finalizer Admin" role). Currently, the `UpdateFinalizerSet` command is gated by the Owner role directly.
- **Consensus-based finalizer set changes** -- Allow the finalizer quorum to update the finalizer set through consensus, rather than requiring the team owner. This requires detecting misbehavior to classify malicious finalizer nodes -- without reliable signals for identifying malicious nodes, honest finalizers have no criteria to reject a structurally valid but malicious set change proposed by a compromised node. The malachite library provides some native misbehavior detections (e.g. equivocation), and additional signals can be detected at the application layer (e.g. consistently voting against the quorum, proposing invalid commands, making frequent set change requests). However, aggregating these signals into a reliable trust ranking is an open problem. Until this is solved, permission-gated updates provide equivalent safety with simpler design.
- **Graph-based consensus transport** -- Relay consensus messages as graph commands instead of requiring direct QUIC connections between finalizers. This would allow consensus to work through the existing sync topology without finalizers needing to know each other's network addresses. Requires graph support for non-permanent commands (e.g. truncation or branch-level garbage collection).
- **Merkle roots** -- Add weave and FactDB Merkle roots to the Finalize command. A Merkle root is a single hash at the top of a binary hash tree that uniquely represents an entire dataset. The weave Merkle tree would be built from command hashes in weave order; the facts Merkle tree from FactDB key-value entries. This enables divergence detection (devices can compare roots to verify identical state), truncation (retain only roots as compact proof of prior state), and light clients (verify finalized state without replaying the full weave).
- **Truncation** -- Define a garbage collection strategy for finalized graph data. Requires Merkle roots to retain compact proofs of truncated state.
- **Light clients** -- Devices that verify Finalize commands without replaying the full weave.
- **Larger finalizer sets** -- Support finalizer sets beyond the current maximum of 7. This requires policy language support for collection types or additional FFI work to handle more fields.
- **Non-device finalizers** -- Support finalizers that are not full devices. Since finalization only requires a signing key, a lightweight finalizer process could participate in consensus without the full device stack. This would allow dedicated finalization infrastructure separate from team devices.
- **Finalization metrics** -- Monitoring and alerting for finalization latency and participation rates.
- **Finalizer set quorum validation** -- Validate that a new finalizer set can reach quorum before accepting the `UpdateFinalizerSet` command (e.g., verify that the specified devices are reachable and can participate in consensus). This is less critical while the owner can unilaterally change the set, but becomes more important if finalizer set management is delegated or consensus-based.
