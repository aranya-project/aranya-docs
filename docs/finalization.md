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
| Finalizer | A device in the finalizer set, participating in finalization consensus |
| Finalize command | A multi-signed graph command whose ancestors all become permanent |
| Consensus round | A single execution of the BFT protocol to agree on a finalization point |
| Proposer | The finalizer selected by the BFT protocol's deterministic round-robin to propose a finalization point for a given round |
| Prevote | First-stage vote indicating a finalizer considers the proposal valid |
| Precommit | Second-stage vote indicating a finalizer is ready to commit the proposal |
| Quorum | The minimum number of finalizers required for a consensus decision: `(n * 2 / 3) + 1` where n is the finalizer set size |
| Sequence number (seq) | The sequence number of a finalization round; increments with each successful Finalize command |

## Scope

Finalization applies to the **control plane only** -- the persistent commands on the DAG that manage team membership, roles, labels, and AFC channel configuration. Ephemeral commands and AFC data plane traffic are not subject to finalization.

## Design Goals

1. **Safety** -- A Finalize command is only produced when a quorum of finalizers agree. No two conflicting Finalize commands can exist in the graph.
2. **Liveness** -- As long as a quorum of finalizers are online and can communicate, finalization makes progress.
3. **Offline tolerance** -- Non-finalizer devices continue operating normally (publishing commands, syncing) regardless of whether finalization is active. Finalization does not block graph operations.
4. **On-demand** -- Finalization rounds are initiated by a finalizer, not on a fixed schedule. The BFT protocol selects the proposer automatically.
5. **Deterministic verification** -- Any device can verify a Finalize command by checking its signatures against the current finalizer set.

## Finalizer Set

The finalizer set is the group of devices authorized to participate in finalization consensus. Unlike role-based permissions, the finalizer set is managed independently and can only be changed through consensus.

### Initialization

The initial finalizer set is established in the team's `Init` command. The `Init` command includes 4 optional finalizer fields (`finalizer1` through `finalizer4`), each containing a public signing key ID. If all 4 are specified, the team starts with a 4-member finalizer set and BFT safety. If none are specified, the team owner's public signing key ID is used as the sole initial finalizer.

### Validator Set

All devices in the finalizer set form the validator set. Each finalizer has equal voting power of 1. The finalizer set is fixed at either 1 or 4 members.

Consensus requires a quorum of the finalizer set (see terminology):

| Finalizers (n) | Byzantine tolerance: f = (n - 1) / 3 | Quorum: q = (n * 2 / 3) + 1 |
|---|---|---|
| 1 | 0 | 1 |
| 4 | 1 | 3 |
| 7 | 2 | 5 |
| 10 | 3 | 7 |
| 13 | 4 | 9 |

The supported set sizes follow the formula `n = 3f + 1`, which gives maximum fault tolerance for the fewest nodes. Adding nodes beyond `3f + 1` does not increase fault tolerance until the next threshold (7, 10, 13, ...).

A single-finalizer team can finalize but has no Byzantine fault tolerance. A 4-member finalizer set is the smallest configuration that tolerates 1 Byzantine fault.

### Changing the Finalizer Set

The finalizer set can only be changed through a `Finalize` command that includes the optional `new_finalizer` fields. The Finalize command has 4 optional fields (`new_finalizer1` through `new_finalizer4`). When all are `None`, the current finalizer set is unchanged. When all 4 are provided, the complete new set of finalizer public signing key IDs replaces the current set at the next finalization sequence number.

This design ensures that:

- Only a quorum of the current finalizers can authorize changes to the finalizer set.
- An admin or owner cannot unilaterally add or remove finalizers, preserving BFT guarantees.
- The finalizer set is always agreed upon by consensus, preventing split-brain scenarios where different devices have different views of who the finalizers are.
- The finalizer set cannot be downgraded from 4 to 1 member. Once a team has a 4-member set, it must always have 4 finalizers.

## Finalization Policy

This section defines the on-graph commands, facts, and policy rules that enforce finalization. The policy is evaluated independently by every device -- it does not depend on or interact with the off-graph consensus protocol.

### Multi-Signature Commands

The Finalize command uses multi-signature authentication instead of single-author authentication. This is necessary because finalization represents agreement by a quorum of finalizers, not the action of a single device.

This requires a **new command type** in the `aranya-core` runtime. Existing commands assume a single author with a single signature. The multi-signature command type must support:

- Computing the command ID from a subset of fields (excluding signatures).
- Carrying multiple signatures from different devices in a single command.
- Verifying a quorum of signatures instead of a single author signature.

Key properties of multi-signature commands:

- **Command ID excludes signatures.** The command ID is computed over the serialized fields (seq, new_finalizer fields) but not the `signatures` field. This means different valid subsets of finalizer signatures produce the same command ID, which is critical -- multiple finalizers may independently commit the same Finalize command with different signature subsets, and the policy must treat them as the same command.
- **No single author.** The Finalize command has no `get_author()` check. Instead, the policy verifies that `signatures` contains a quorum of valid signatures from the current finalizer set.
- **New FFI functions.** Multi-signature seal/open requires new envelope FFI:
  - `seal_multi_sig(data)` -- Seals a command where the ID is computed from `data` (the serialized fields excluding signatures).
  - `open_multi_sig(envelope)` -- Opens a multi-signature envelope and returns the deserialized fields.

### Finalize Command

The `Finalize` command makes all of its ancestors permanent. It is the only graph command produced by finalization.

Properties:

- **Priority**: 0 (processed before all non-ancestor commands in the weave).
- **Fields**:
  - `seq` -- The finalization sequence number. Ensures at most one Finalize command succeeds per round, even if multiple are created concurrently on different branches. Also allows finalizers to coordinate off-graph on which round is in progress and lets any node query finalization progress without traversing the graph.
  - `signatures` -- Opaque byte blob containing the signatures from finalizers that agreed to this finalization. Deserialized by FFI into individual (key ID, signature) pairs. Only finalizers that participated are included.
  - `new_finalizer1` through `new_finalizer4` -- Optional public signing key IDs. When all 4 are provided, they replace the current finalizer set at the next sequence number. When all are `None`, the current set is unchanged.
- **Policy checks**:
  - The `signatures` blob contains at least a quorum of valid signatures from unique members of the current finalizer set.
  - No `FinalizeRecord` exists at this sequence number (prevents duplicates).
  - The sequence number is sequential (previous seq must be finalized, or seq is 1).
  - If new finalizer fields are provided: all 4 must be present, all unique key IDs, all valid team devices, and a majority of the new set must come from the current set.

The multi-signature field serves as a compact proof of consensus. Any device can verify that a quorum of finalizers agreed to the finalization using only the Finalize command itself, without any knowledge of the off-graph consensus protocol.

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

### Validator Set Changes

The finalizer set can only be changed through the `Finalize` command's optional `new_finalizer` fields. The validator set for seq N is determined by the finalizer set recorded at the previous Finalize command (seq N-1), or the initial set from the `Init` command if no finalization has occurred.

When a `Finalize` command includes new finalizer fields:

- All 4 fields (`new_finalizer1` through `new_finalizer4`) must be provided. Partial updates are not supported.
- All key IDs must be unique.
- All key IDs must correspond to valid devices on the team.
- A majority of the new set must come from the current finalizer set (at most 1 member replaced per round).
- The new set takes effect at the next finalization sequence number (N+1).
- The current sequence number's consensus still uses the old set for quorum and signature verification.
- All devices learn the new finalizer set when they process the `Finalize` command through sync.

A single-finalizer team can upgrade to a 4-member set, but a 4-member set cannot be downgraded to a single finalizer. This prevents losing BFT safety once established.

If validation fails, the entire `Finalize` command is rejected. The original finalizer set remains in effect and the sequence number is not consumed.

Validation operates at two levels:

1. **Policy validation** (structural) -- The on-graph policy checks that the new set is structurally valid: all 4 provided, unique key IDs, valid team devices, no downgrade from 4 to 1. Additionally, a majority of the new finalizer set must come from the previous set. With n=4, at least 3 of the new 4 members must be from the current set. This ensures a proper transfer of power where the previous finalizers maintain majority control in the new set, preserving continuity of trust. It also prevents a hostile takeover in a single round -- even if BFT assumptions are violated, an attacker can only swap 1 member per round, giving operators time to detect and respond.
2. **Consensus validation** (semantic) -- During the BFT consensus round, each honest finalizer prevotes nil on any proposal that removes them from the finalizer set. This ensures a malicious proposer cannot get quorum to remove honest finalizers. Legitimate removal of a single member still works: the 3 remaining finalizers see themselves in the new set and prevote yes (meeting quorum), while the removed finalizer's nil vote does not block the change.

Together, these two levels ensure that adding, removing, or replacing finalizers requires a quorum of current finalizers to actively agree through consensus, the policy limits changes to at most 1 member per round, and no single administrator can change the finalizer set unilaterally.

### Policy Definitions

#### Init Command Changes

The `Init` command is extended with 4 optional finalizer fields. If all 4 are provided, the team starts with a 4-member finalizer set. If none are provided, the team owner is the sole finalizer. The policy also creates an initial `FinalizeRecord` at seq 0 so the Finalize command's sequential check has no special case for the first finalization.

```policy
command Init {
    fields {
        // ... existing fields ...
        finalizer1 optional bytes,
        finalizer2 optional bytes,
        finalizer3 optional bytes,
        finalizer4 optional bytes,
    }

    // ... existing seal/open ...

    policy {
        // ... existing init logic ...

        // Initialize finalizer set.
        // If all 4 finalizers provided, validate and create facts for each.
        // Otherwise, default to team owner as sole finalizer.
        check init_finalizer_set(
            this.finalizer1, this.finalizer2,
            this.finalizer3, this.finalizer4,
            envelope,
        )

        // Create initial FinalizeRecord so seq 1 has a predecessor.
        finish {
            create FinalizeRecord[seq: 0]=>{}
        }
    }
}

fact Finalizer[signing_key_id bytes]=>{}
```

The `init_finalizer_set` FFI validates that either all 4 fields are provided or none are. When all 4 are provided, it checks that all key IDs are unique and correspond to valid team devices, then creates a `Finalizer` fact for each. When none are provided, it creates a single `Finalizer` fact for the team owner's public signing key ID.

#### Finalize Command

```policy
command Finalize {
    attributes {
        priority: 0
    }

    fields {
        seq int,
        signatures bytes,
        new_finalizer1 optional bytes,
        new_finalizer2 optional bytes,
        new_finalizer3 optional bytes,
        new_finalizer4 optional bytes,
    }

    // Command ID is computed from fields excluding signatures.
    seal { return seal_multi_sig(serialize(this)) }
    open { return deserialize(open_multi_sig(envelope)) }

    policy {
        check team_exists()

        // Verify quorum of valid signatures from unique current finalizers.
        check verify_finalize_quorum(this.signatures)

        // Sequence number must be sequential.
        check exists FinalizeRecord[seq: this.seq - 1]

        // No conflicting Finalize at this sequence number.
        check !exists FinalizeRecord[seq: this.seq]

        // Validate new finalizer set if provided (all 4 or none).
        check validate_new_finalizer_set(
            this.new_finalizer1, this.new_finalizer2,
            this.new_finalizer3, this.new_finalizer4,
        )

        finish {
            create FinalizeRecord[
                seq: this.seq,
            ]=>{}

            // Update finalizer set if a new one was provided.
            update_finalizer_set(
                this.new_finalizer1, this.new_finalizer2,
                this.new_finalizer3, this.new_finalizer4,
            )
        }
    }
}

fact FinalizeRecord[seq int]=>{}
```

#### New FFIs

The following new FFI functions are required. These handle operations that the policy language cannot express directly (cryptographic verification, fact iteration):

- **`init_finalizer_set(f1, f2, f3, f4, envelope)`** -- Initializes the finalizer set from the `Init` command. If all 4 fields are provided, validates that all key IDs are unique and correspond to valid team devices, then creates a `Finalizer` fact for each. If all are `None`, creates a single `Finalizer` fact for the team owner's public signing key ID. Rejects partial specifications (some provided, some `None`).
- **`verify_finalize_quorum(signatures)`** -- Deserializes the opaque `signatures` blob into individual (key ID, signature) pairs. Verifies each signature against the current finalizer set and the command content. Returns true if at least a quorum of valid, unique finalizer signatures are present.
- **`validate_new_finalizer_set(f1, f2, f3, f4)`** -- Validates the new finalizer set fields. If all 4 are provided, checks that all key IDs are unique, correspond to valid team devices, and a majority of the new set comes from the current finalizer set. If the current set has 4 members, all 4 must be provided (cannot downgrade to a single finalizer). Returns true if valid or if all fields are `None`. Rejects partial specifications.
- **`update_finalizer_set(f1, f2, f3, f4)`** -- If all 4 fields are provided, deletes all existing `Finalizer` facts and creates new ones for each key ID. No-op if all fields are `None`.
- **`seal_multi_sig(data)`** -- Seals a command where the command ID is computed from `data` (serialized fields excluding signatures). Different signature subsets produce the same command ID.
- **`open_multi_sig(envelope)`** -- Opens a multi-signature envelope and returns the deserialized fields.

## BFT Consensus Protocol

This section defines the off-graph protocol that drives agreement among finalizers. The consensus protocol determines what to finalize and collects the signatures needed for the Finalize command. It does not directly interact with the graph -- it produces inputs that the finalization policy consumes.

The protocol is based on Tendermint and integrated via the [malachite](https://github.com/circlefin/malachite) library, which provides a standalone Rust implementation of the Tendermint algorithm.

### Library Selection

Several Rust BFT consensus libraries were evaluated:

| Library | Algorithm | Pros | Cons |
|---|---|---|---|
| [malachite](https://github.com/circlefin/malachite) | Tendermint | Standalone embeddable library with no runtime or networking opinions. Co-designed with TLA+ formal specs. Actively maintained (Informal Systems / Circle). Proven at scale (780ms finalization latency at 100 validators). | Tendermint's all-to-all voting has O(n^2) message complexity. |
| [tendermint-rs](https://github.com/cometbft/tendermint-rs) | Tendermint | Mature ecosystem with light client support. | Client library for CometBFT, not a standalone consensus engine. Requires running an external CometBFT node and communicating via ABCI. Low development activity (last commit Nov 2025). |
| [hotstuff_rs](https://github.com/parallelchain-io/hotstuff_rs) | HotStuff | Linear message complexity O(n). Dynamic validator sets built-in. Pluggable networking and storage. | Not actively maintained (last commit Dec 2024). Less battle-tested than Tendermint. Smaller community. |
| [mysticeti](https://arxiv.org/pdf/2310.14821) | DAG-based BFT | Lowest theoretical latency (3 message rounds). Powers the Sui blockchain. | DAG-based consensus is significantly more complex to integrate. Designed for high-throughput blockchains, not embedded use. No standalone Rust library available. |
| [raft-rs](https://github.com/tikv/raft-rs) | Raft | Actively maintained. Battle-tested (powers TiKV/TiDB). Standalone embeddable Rust library. | Crash fault tolerant (CFT) only, not Byzantine fault tolerant. Followers blindly trust the leader -- a compromised leader can commit arbitrary state. |
| [etcd raft](https://github.com/etcd-io/raft) | Raft | Actively maintained. The most widely used Raft library in production (etcd, Kubernetes, CockroachDB). | Written in Go, not Rust. CFT only, not BFT. Would require FFI or a sidecar process. |

**Decision: Malachite.** It is the only library that provides a standalone, embeddable Tendermint consensus engine without requiring an external process or specific networking stack. This is critical for Aranya because consensus must run inside the daemon process and communicate over QUIC connections. Tendermint's O(n^2) message complexity is acceptable for our small finalizer sets (1-13 members). Malachite is actively maintained by Informal Systems and Circle, with production use in Starknet sequencers, and its formal verification (TLA+ specs) provides confidence in correctness.

### Architecture

The BFT consensus protocol lives above `aranya-core`. The `aranya-core` runtime does not depend on or know about the consensus implementation. This separation allows applications to choose their own consensus algorithm if needed -- the finalization policy on the graph is consensus-agnostic and only cares that the Finalize command carries a valid quorum of signatures.

The BFT consensus crate may live in the `aranya-core` repository for convenience, but it is not a dependency of the core runtime. It is consumed by the daemon or application layer, which is responsible for:

- Running the consensus protocol (malachite integration).
- Managing QUIC connections to finalizer peers.
- Assembling and committing Finalize commands to the graph.

### Initial Implementation

The initial implementation uses the team owner as the sole finalizer (single-finalizer mode). This provides finalization and truncation support without the complexity of multi-party BFT consensus. Teams can upgrade to a 4-member finalizer set when BFT safety is needed.

### Single Finalizer

When the finalizer set contains exactly one member, the BFT consensus protocol is skipped. The sole finalizer publishes a `Finalize` command directly with its own signature, which satisfies the quorum check (quorum of 1 is 1).

This is safe because the finalizer set is always established by a single authoritative source -- the `Init` command or a prior `Finalize` command approved by quorum. Two devices cannot independently believe they are the sole finalizer at the same sequence number:

- At team creation, all devices process the same `Init` command and agree on the initial set.
- After a `Finalize` command changes the set, the new set was approved by the previous quorum. Devices that haven't synced this `Finalize` are still operating at the previous sequence number and cannot produce a valid `Finalize` at the new sequence number (the sequential check would fail).

### Triggering Finalization

Any finalizer can initiate finalization when:

1. There are unfinalized commands in the graph beyond the last Finalize command.
2. The finalizer has synced with enough peers to have a reasonably complete view of the graph.

Initiation signals to the other finalizers that a finalization round should begin. The initiating finalizer does not become the proposer -- the BFT protocol's deterministic round-robin selects the proposer based on the current sequence number and round number. If multiple finalizers initiate concurrently, they converge on the same round since they all compute the same proposer independently.

### Consensus Round

A consensus round has three phases: agreement, signature collection, and commit.

#### Phase 1: Agreement

The goal of this phase is for finalizers to agree on which graph head to finalize.

**Proposer selection.** A deterministic function selects the proposer for each round based on the current sequence number and round number (round-robin over the sorted validator set). All finalizers compute the same proposer independently. If the selected proposer is offline, the round times out and advances to the next round with the next proposer in rotation.

**Head exchange.** When a round begins, each finalizer sends a head exchange message to all other finalizers containing its current graph head. This allows the proposer to determine a finalization point that all finalizers can agree on.

**Proposal.** The proposer collects the head exchange messages and computes the common ancestor of the participating finalizers' graph heads. The finalization point is this common ancestor -- the furthest point in the graph that all finalizers can verify. The proposer computes the weave from the last Finalize command (or graph root if none exists) to the finalization point. The proposal contains:

- **Seq** -- The finalization sequence number.
- **Round** -- The round number within this sequence number (increments on timeout).
- **Finalization point** -- The graph command up to which the weave is finalized.

**Prevote.** Every finalizer (including the proposer) receives the proposal and independently verifies it by computing the weave from the same starting point to the proposed finalization point. If the finalizer can verify the proposal (it has all the commands and they produce a valid weave), it broadcasts a prevote for the proposal to all other finalizers. If it cannot verify the proposal (due to missing commands, different graph state, or invalid proposal), the finalizer prevotes nil.

Finalizers must prevote nil immediately for proposals that are obviously invalid -- for example, a sequence number that has already been finalized, a finalization point that does not advance beyond the last Finalize command, or a finalization point the finalizer cannot verify. This allows the round to fail fast without waiting for the full timeout. If a quorum prevote nil, the round advances immediately to the next proposer. Nil prevotes include the finalizer's current graph head so the next proposer can make a better-informed proposal.

**Precommit.** Every finalizer independently observes the prevotes. When a finalizer observes a quorum of prevotes for the same proposal, it broadcasts a precommit for that proposal to all other finalizers. If a quorum of nil prevotes is observed, or the prevote timeout expires without quorum, the finalizer precommits nil. All finalizers participate in both voting stages.

**Decision.** When a quorum of precommits is observed for the same proposal, the round reaches agreement. If precommit quorum is not reached (nil quorum or timeout), the round number increments and a new proposer is selected. The process repeats from the head exchange step.

#### Phase 2: Signature Collection

Once agreement is reached on the finalization point, each finalizer deterministically constructs the Finalize command content from the agreed-upon proposal (seq, new finalizer fields if applicable). Because the fields are deterministic given the proposal, every finalizer produces the same command content.

Each finalizer signs the command content and sends its signature to the other finalizers that request it. Finalizers collect signatures until they have at least a quorum.

Different finalizers may end up with different subsets of signatures -- this is fine. Any valid quorum-sized subset proves consensus. The command ID is the same regardless of which signatures are attached.

#### Phase 3: Commit

Any finalizer that has collected a quorum of signatures assembles the full Finalize command (fields + signatures) and commits it locally to the graph. Multiple finalizers may independently commit the same command with different subsets of signatures. Because the command ID excludes signatures, these are logically the same command -- they share the same command ID and are treated identically by the graph. The policy's `!exists FinalizeRecord[seq: this.seq]` check ensures only the first to be woven succeeds; subsequent copies are recognized as the same command and ignored.

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

When the finalizer set changes (via a `Finalize` command with `new_finalizer_set`), peer configurations for finalizers no longer in the set are automatically removed. New finalizers must be configured by the operator before they can participate in consensus.

Non-finalizer devices do not need to configure finalizer peers.

**Broadcast pattern.** Consensus messages (proposals, votes, signature shares) are pushed to all configured finalizer peers. Each finalizer maintains connections to all other finalizers and sends messages directly -- there is no relay or gossip layer.

**Address verification.** When receiving a consensus message, the recipient verifies that the sender's public signing key ID matches the key ID associated with the QUIC connection's address. Messages from unexpected key IDs are dropped.

#### Consensus Message Types

| Message | Transport | Sender | Description |
|---|---|---|---|
| `HeadExchange` | QUIC stream | Finalizer | Current graph head of the sending finalizer |
| `Proposal` | QUIC stream | Proposer | Proposed finalization point |
| `Prevote` | QUIC stream | Finalizer | First-stage vote for or against a proposal |
| `Precommit` | QUIC stream | Finalizer | Second-stage vote to commit a proposal |
| `SignatureShare` | QUIC stream | Finalizer | Finalizer's signature over the agreed Finalize command content |

All consensus messages are signed by the sending finalizer's signing key. Recipients verify the signature and that the sender is a member of the current finalizer set before processing.

### Timeouts

Each consensus phase has a configurable timeout:

| Phase | Default Timeout | Behavior on Expiry |
|---|---|---|
| Head Exchange | 30s | Proposer uses heads received so far |
| Propose | 30s | Prevote nil |
| Prevote | 30s | Precommit nil |
| Precommit | 30s | Advance to next round |

Timeouts increase linearly with each successive round to accommodate network delays. This is standard Tendermint behavior -- longer timeouts give the network more time to deliver messages when earlier rounds fail. All timeout values are configurable per deployment.

```
timeout(round) = base_timeout + round * timeout_increment
```

Rounds can also fail fast without waiting for timeouts. If a finalizer receives an obviously invalid proposal (already-finalized sequence number, unknown parent, malformed content), it prevotes nil immediately. If a quorum prevote nil, the round advances to the next proposer without waiting for any timeout.

### Daemon Startup

Consensus state is not persisted. All consensus messages (proposals, votes, signature shares) are ephemeral QUIC messages. When a daemon starts or restarts, any in-progress consensus round that was not committed to the graph is simply abandoned -- there is nothing to recover.

The daemon determines the current finalization state entirely from its local FactDB:

1. Query the highest `FinalizeRecord` seq to determine the last completed finalization.
2. Check if this device is in the current finalizer set (query `Finalizer` facts).
3. If a finalizer, connect to configured finalizer peers. If other finalizers are already in a consensus round, the Tendermint protocol handles late joiners -- the daemon participates in whatever round is currently active without needing prior round history. If no round is active, the daemon waits for a finalizer to initiate one.

A daemon being offline does not block finalization. As long as a quorum of finalizers remains online, consensus rounds continue without the offline daemon. When the daemon comes back online, it syncs any Finalize commands it missed and can participate in or initiate the next finalization round.

### Equivocation Detection and Vote Visibility

Finalizers must have visibility into how other finalizers voted during consensus rounds. This serves two purposes: detecting Byzantine behavior and informing finalizer set changes.

**Equivocation.** Malachite detects equivocation -- when a finalizer sends conflicting votes (e.g., prevoting for two different proposals in the same round). Equivocation does not halt consensus; the protocol continues as long as a quorum of honest finalizers are available.

**Vote logging.** Each finalizer logs the votes it observes from all other finalizers during each consensus round, including:

- Which finalizers prevoted for the proposal vs. nil.
- Which finalizers precommitted for the proposal vs. nil.
- Equivocation evidence (conflicting votes with signatures from the same finalizer).
- Which finalizers did not respond within the timeout (potential offline or partitioned nodes).

**Operator response.** Operators can review vote logs to identify finalizers that are consistently voting against the majority, equivocating, or failing to participate. This evidence can justify removing a compromised or faulty device from the finalizer set in a subsequent `Finalize` command, or removing the device from the team entirely if its signing key is believed compromised.

### Partition Handling

Finalization and normal graph operations are independent:

- **During partitions**: Non-finalizer devices continue publishing commands and syncing with reachable peers. The graph branches as normal. If fewer than a quorum of finalizers can communicate, finalization halts but graph operations are unaffected.
- **After partition heals**: Devices sync and merge branches. Once a quorum of finalizers can communicate again, finalization resumes. The next Finalize command will cover all commands accumulated during the partition.

Finalizers that were partitioned and have a stale view of the graph will prevote nil until they sync enough state to verify the proposal. This is safe -- it only affects liveness, not safety.

#### Fault Tolerance

The consensus protocol is resilient to finalizers going offline and coming back:

- **Consensus messages** (head exchanges, proposals, votes, signature shares) are off-graph QUIC messages. They are not persisted. A returning finalizer does not need the prior consensus history.
- **The Tendermint protocol handles late joiners.** A finalizer that comes back online reconnects to other finalizers over QUIC and joins whatever round is currently active. It can prevote and precommit in the current round without knowledge of prior rounds.
- **Stalled rounds advance automatically.** If a round stalls because the proposer went offline, the timeout expires and the next proposer takes over. No manual intervention is needed.

If all finalizers go offline simultaneously and come back online, they restart the consensus protocol from scratch. Each finalizer independently determines the current sequence number (from the last `FinalizeRecord` in its FactDB) and begins a new round. The deterministic proposer rotation ensures they agree on which finalizer proposes first.

### Integration with Malachite

The consensus protocol is implemented using the malachite library. The integration maps Aranya concepts to malachite abstractions:

| Malachite Concept | Aranya Mapping |
|---|---|
| `Value` | Finalize command content (seq, finalization point) |
| `ValueId` | Hash of the proposed Finalize command content |
| `Height` | Finalization sequence number (seq) |
| `Validator` | Finalizer device (each with voting power 1) |
| `ValidatorSet` | Current finalizer set. Derived from `Finalizer` facts at the current seq. Updated when a `Finalize` command includes a `new_finalizer_set`. |
| `Address` | Finalizer's `pub_signing_key_id` |
| `Vote` | Prevote/precommit QUIC messages |
| `Proposal` | Finalization proposal QUIC message |

#### Malachite Context Implementation

The `Context` trait is implemented with:

- **`select_proposer`** -- Deterministic selection from the sorted validator set using `seq + round` as index modulo validator count.
- **`new_proposal`** -- Constructs a proposal containing the finalization point.
- **`new_prevote` / `new_precommit`** -- Constructs vote messages signed with the finalizer's signing key.

## Example: Full Finalization Round-Trip

This example walks through a complete finalization round with 4 finalizers (A, B, C, D) performing finalization at seq 3.

1. **Initiation.** Finalizer A determines there are unfinalized commands and signals the other finalizers that a round should begin.

2. **Head exchange.** Each finalizer sends its current graph head to all others. A, B, and C have similar heads; D is slightly behind.

3. **Proposer selection.** All finalizers independently compute the proposer: `sorted_finalizers[(3 + 0) % 4]` = B (for round 0 of seq 3).

4. **Proposal.** B computes the common ancestor of the received heads and proposes it as the finalization point. B broadcasts the proposal (seq=3, round=0, finalization point) to A, C, and D.

5. **Prevote.** Each finalizer verifies the proposal by computing the weave to the proposed finalization point:
   - A, C: Can verify. Broadcast prevote for the proposal.
   - B: Also prevotes for its own proposal.
   - D: Missing some commands. Prevotes nil (includes its current head so the next proposer knows D's state).

6. **Precommit.** A, B, and C each observe 3 prevotes for the proposal (quorum = `(4 * 2 / 3) + 1` = 3). Each broadcasts a precommit.

7. **Decision.** All finalizers observe 3 precommits for the proposal. Agreement is reached.

8. **Signature collection.** Each finalizer constructs the Finalize command content (seq=3, no new_finalizer_set), signs it, and shares the signature. Each collects at least 3 signatures.

9. **Commit.** A, B, and C each assemble the Finalize command with their collected signatures and commit it to their local graph. Because the command ID excludes signatures, all three produce the same command ID. The first to be woven succeeds; duplicates are rejected by `!exists FinalizeRecord[seq: 3]`.

10. **Sync.** D syncs with another finalizer, receives the Finalize command, and processes it. D's policy independently verifies the quorum of signatures and creates the `FinalizeRecord`. All ancestors of the Finalize command are now permanent on D's graph.

## Security Considerations

### Byzantine Finalizers

The BFT consensus tolerates up to f < n/3 Byzantine finalizers. A Byzantine finalizer can:

- Refuse to participate (equivalent to being offline -- affects liveness, not safety).
- Send conflicting votes (equivocation). Malachite detects equivocation and provides evidence. The team can respond by removing the compromised device from the finalizer set in the next `Finalize` command.
- Propose invalid finalization points. Honest finalizers will reject invalid proposals by prevoting nil immediately.

A Byzantine finalizer cannot:

- Cause an invalid Finalize command to be accepted (requires a quorum of honest verification).
- Rewrite finalized history.
- Prevent finalization indefinitely if a quorum of honest finalizers are online (liveness guarantee).
- Change the finalizer set without quorum agreement.

### Finalizer Set Independence

The finalizer set is independent of the role-based permission system. An admin or owner cannot add or remove finalizers -- only the current finalizer quorum can authorize changes. This prevents a compromised admin from undermining BFT guarantees by manipulating the validator set.

A compromised finalizer's blast radius is limited to disrupting or halting consensus. It cannot affect non-finalization operations (team membership, roles, AFC, etc.) unless it also has other permissions through its role.

### Minimum Validator Set

Teams should specify 4 finalizer devices to tolerate 1 Byzantine fault. A team with a single finalizer (the default) has no Byzantine fault tolerance. Once a team upgrades to a 4-member finalizer set, it cannot be downgraded back to a single finalizer.

## Future Work

- **Graph-based consensus transport** -- Relay consensus messages as graph commands instead of requiring direct QUIC connections between finalizers. This would allow consensus to work through the existing sync topology without finalizers needing to know each other's network addresses. Requires graph support for non-permanent commands (e.g. truncation or branch-level garbage collection).
- **Merkle roots** -- Add weave and FactDB Merkle roots to the Finalize command. A Merkle root is a single hash at the top of a binary hash tree that uniquely represents an entire dataset. The weave Merkle tree would be built from command hashes in weave order; the facts Merkle tree from FactDB key-value entries. This enables divergence detection (devices can compare roots to verify identical state), truncation (retain only roots as compact proof of prior state), and light clients (verify finalized state without replaying the full weave).
- **Truncation** -- Define a garbage collection strategy for finalized graph data. Requires Merkle roots to retain compact proofs of truncated state.
- **Light clients** -- Devices that verify Finalize commands without replaying the full weave.
- **Larger finalizer sets** -- Support finalizer sets beyond 4 members, following the `3f + 1` progression (7, 10, 13, ...). This requires policy language support for collection types or additional FFI work to handle variable-length field lists. Variable-size sets introduce a new attack vector: an adversary could shrink the set to reduce the majority requirement, then pack it with compromised devices. Any variable-size design must prevent reducing the set size or enforce that the new set retains a majority from the previous set.
- **Finalization metrics** -- Monitoring and alerting for finalization latency and participation rates.
