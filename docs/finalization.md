---
layout: page
title: Finalization
permalink: "/finalization/"
---

# Finalization

## Overview

Finalization is the process by which a prefix of the graph's weave becomes permanent and irreversible. Once a set of commands is finalized, they cannot be recalled by future merges. This bounds the impact of long partitions and adversarial branching by guaranteeing that accepted commands remain accepted.

Finalization has two components:

1. **Finalization policy** -- The on-graph commands, facts, and policy rules that enforce finalization invariants. Any device can verify a Finalize command independently.
2. **BFT consensus protocol** -- The off-graph protocol that drives agreement among finalizers on what to finalize. The consensus protocol produces the inputs (agreed-upon head, collected signatures) that the policy consumes.

## Terminology

| Term | Definition |
|---|---|
| Finalizer | A device in the finalizer set, participating in finalization consensus |
| Finalize command | A multi-signed graph command containing Merkle roots of the finalized weave and FactDB; all ancestors become permanent |
| Consensus round | A single execution of the BFT protocol to agree on a finalization point |
| Proposer | A finalizer that proposes a finalization point; if multiple finalizers propose concurrently, the BFT algorithm selects one |
| Prevote | First-stage vote indicating a finalizer considers the proposal valid |
| Precommit | Second-stage vote indicating a finalizer is ready to commit the proposal |
| Quorum | Strictly more than 2/3 of total voting power required for consensus decisions |
| Sequence number (seq) | The sequence number of a finalization round; increments with each successful Finalize command |
| Merkle root | The single hash at the top of a Merkle tree that uniquely represents an entire dataset; if any element changes, the root changes |

## Scope

Finalization applies to the **control plane only** -- the persistent commands on the DAG that manage team membership, roles, labels, and AFC channel configuration. Ephemeral commands and AFC data plane traffic are not subject to finalization.

## Design Goals

1. **Safety** -- A Finalize command is only produced when 2/3+ of finalizers agree on the same weave prefix. No two conflicting Finalize commands can exist in the graph.
2. **Liveness** -- As long as 2/3+ of finalizers are online and can communicate, finalization makes progress.
3. **Offline tolerance** -- Non-finalizer devices continue operating normally (publishing commands, syncing) regardless of whether finalization is active. Finalization does not block graph operations.
4. **On-demand** -- Finalization rounds are initiated by a finalizer proposing a round, not on a fixed schedule.
5. **Deterministic verification** -- Any device can verify a Finalize command by checking its Merkle roots against its local weave and FactDB.

## Finalizer Set

The finalizer set is the group of devices authorized to participate in finalization consensus. Unlike role-based permissions, the finalizer set is managed independently and can only be changed through consensus.

### Initialization

The initial finalizer set is established in the team's `Init` command. The `Init` command includes an optional list of finalizer public signing keys. These keys are used to verify consensus signatures and identify which devices are authorized to participate in finalization.

If the list is omitted, the team owner's public signing key is used as the sole initial finalizer. Teams should grow the finalizer set to at least 4 members before relying on finalization for BFT safety.

### Validator Set

All devices in the finalizer set form the validator set. Each finalizer has equal voting power of 1.

The minimum validator set size for BFT safety is 4 (tolerates 1 Byzantine fault). A team initialized with fewer than 4 finalizers can still finalize, but without Byzantine fault tolerance.

Consensus requires a quorum of strictly more than 2/3 of the finalizer set: `required = (n * 2 / 3) + 1`.

| Finalizers (n) | Quorum required | Byzantine tolerance (f < n/3) |
|---|---|---|
| 1 | 1 | 0 |
| 2 | 2 | 0 |
| 3 | 3 | 0 |
| 4 | 3 | 1 |
| 7 | 5 | 2 |
| 10 | 7 | 3 |
| 13 | 9 | 4 |

### Changing the Finalizer Set

The finalizer set can only be changed through a `Finalize` command that includes an optional `new_finalizer_set` field. This field, when present, contains the complete new set of finalizer public signing keys. The change takes effect at the next finalization sequence number.

This design ensures that:

- Only a quorum of the current finalizers can authorize changes to the finalizer set.
- An admin or owner cannot unilaterally add or remove finalizers, preserving BFT guarantees.
- The finalizer set is always agreed upon by consensus, preventing split-brain scenarios where different devices have different views of who the finalizers are.

## Finalization Policy

This section defines the on-graph commands, facts, and policy rules that enforce finalization. The policy is evaluated independently by every device -- it does not depend on or interact with the off-graph consensus protocol.

### Multi-Signature Commands

The Finalize command uses multi-signature authentication instead of single-author authentication. This is necessary because finalization represents agreement by a quorum of finalizers, not the action of a single device.

Key properties of multi-signature commands:

- **Command ID excludes signatures.** The command ID is computed over the serialized fields (seq, weave_root, facts_root, new_finalizer_set) but not the `signatures` field. This means different valid subsets of finalizer signatures produce the same command ID, which is critical -- multiple finalizers may independently commit the same Finalize command with different signature subsets, and the policy must treat them as the same command.
- **No single author.** The Finalize command has no `get_author()` check. Instead, the policy verifies that the `signatures` list contains a quorum of valid signatures from the current finalizer set.
- **New FFI functions.** Multi-signature seal/open requires new envelope FFI:
  - `seal_multi_sig(data)` -- Seals a command where the ID is computed from `data` (the serialized fields excluding signatures).
  - `open_multi_sig(envelope)` -- Opens a multi-signature envelope and returns the deserialized fields.

### Finalize Command

The `Finalize` command permanently commits a prefix of the weave. It is the only graph command produced by finalization.

Properties:

- **Priority**: 0 (processed before all non-ancestor commands in the weave).
- **Fields**:
  - `seq` -- The finalization sequence number.
  - `weave_root` -- Merkle root of the finalized weave ordering.
  - `facts_root` -- Merkle root of the FactDB state after executing the finalized weave.
  - `signatures` -- List of signatures from finalizers that agreed to this finalization. Each entry contains a signing key and signature. Only finalizers that participated are included.
  - `new_finalizer_set` -- Optional. If present, the complete new set of finalizer public signing keys that takes effect at the next sequence number.
- **Policy checks**:
  - The `signatures` list contains at least `(n * 2 / 3) + 1` valid signatures from unique members of the current finalizer set.
  - No `FinalizeRecord` exists at this sequence number (prevents duplicates).
  - The sequence number is sequential (previous seq must be finalized, or seq is 1).
  - If `new_finalizer_set` is present, it contains at least 1 member.

The multi-signature field serves as a compact proof of consensus. Any device can verify that a supermajority of finalizers agreed to the finalization using only the Finalize command itself, without any knowledge of the off-graph consensus protocol.

### Finalize Ordering Guarantee

All Finalize commands in the graph must form a chain -- for any two Finalize commands, one must be an ancestor of the other. This is enforced by:

1. The BFT consensus protocol ensures only one Finalize command is produced per sequence number.
2. The policy rejects duplicate Finalize commands at the same sequence number (`!exists FinalizeRecord[seq: this.seq]`).
3. Sequential sequence number enforcement ensures each Finalize builds on the previous one.
4. Because the command ID excludes signatures, multiple finalizers committing the same Finalize produce the same command -- the first succeeds and duplicates are rejected.

### Finalization and Branches

Finalization advances along a single chain. Only commands in the ancestry of the Finalize command are finalized -- commands on unmerged branches are not. This means:

- The proposer selects a finalization point along the longest merged lineage it knows about.
- Unmerged branches remain unfinalized but continue operating normally.
- As devices sync and merge branches into the finalized lineage, those commands become eligible for finalization in subsequent rounds.
- No explicit merge step is required before finalization -- merges happen naturally through sync, and the next finalization round covers the newly merged commands.

Branches do not finalize in parallel. Parallel finalization would produce Finalize commands that are not ancestors of each other, violating the chain guarantee. The graph must converge through merges before commands on separate branches can be finalized.

### Post-Finalization

Once a Finalize command is committed to the graph:

- All commands that are ancestors of the Finalize command are permanently accepted. Their effects in the FactDB are irreversible.
- Commands on branches that conflict with the finalized weave are permanently recalled.
- Devices can prune graph data for finalized commands, retaining only the Finalize command and its Merkle roots as a compact proof of the finalized state.

### Validator Set Changes

The finalizer set can only be changed through the `Finalize` command's optional `new_finalizer_set` field. The validator set for seq N is determined by the finalizer set recorded at the previous Finalize command (seq N-1), or the initial set from the `Init` command if no finalization has occurred.

When a `Finalize` command includes a `new_finalizer_set`:

- The new set must contain at least 1 member. For BFT safety, at least 4 members are recommended.
- The new set takes effect at the next finalization sequence number (N+1).
- The current sequence number's consensus still uses the old set for quorum and signature verification.
- All devices learn the new finalizer set when they process the `Finalize` command through sync.

This means adding, removing, or replacing finalizers requires the current quorum to agree. No single administrator can change the finalizer set unilaterally.

### Policy Definitions

#### Init Command Changes

The `Init` command is extended with an optional `finalizers` field containing the initial finalizer set as a list of public signing keys:

```policy
command Init {
    fields {
        // ... existing fields ...
        finalizers optional list[bytes],
    }

    // ... existing seal/open ...

    policy {
        // ... existing init logic ...

        // Initialize finalizer set.
        if this.finalizers is Some {
            let finalizer_keys = unwrap this.finalizers
            check finalizer_keys.count >= 1

            for key in finalizer_keys {
                create Finalizer[signing_key: key]=>{}
            }
        } else {
            // Default to the team owner's signing key.
            let owner = get_author(envelope)
            create Finalizer[signing_key: owner.signing_key]=>{}
        }
    }
}

fact Finalizer[signing_key bytes]=>{}
```

#### Finalize Command

```policy
command Finalize {
    attributes {
        priority: 0
    }

    fields {
        seq int,
        weave_root bytes,
        facts_root bytes,
        signatures list[struct FinalizerSignature],
        new_finalizer_set optional list[bytes],
    }

    // Command ID is computed from fields excluding signatures.
    seal { return seal_multi_sig(serialize(this)) }
    open { return deserialize(open_multi_sig(envelope)) }

    policy {
        check team_exists()

        // Verify quorum: signatures must contain strictly more than
        // 2/3 of the current finalizer set.
        let finalizers = get_finalizers()
        let required = (finalizers.count * 2 / 3) + 1
        check this.signatures.count >= required

        // Verify each signature is from a unique current finalizer.
        for sig in this.signatures {
            check is_finalizer(sig.signing_key)
            check verify_signature(sig.signing_key, sig.signature, this)
        }

        // Height must be sequential.
        if this.seq == 1 {
            // First finalization ever.
            check !exists FinalizeRecord[seq: 0]
        } else {
            check exists FinalizeRecord[seq: this.seq - 1]
        }

        // No conflicting Finalize at this sequence number.
        check !exists FinalizeRecord[seq: this.seq]

        // Validate new finalizer set if provided.
        if this.new_finalizer_set is Some {
            let new_set = unwrap this.new_finalizer_set
            check new_set.count >= 1
        }

        finish {
            create FinalizeRecord[
                seq: this.seq,
            ]=>{}

            // Update finalizer set if a new one was provided.
            if this.new_finalizer_set is Some {
                let new_set = unwrap this.new_finalizer_set

                // Remove all current finalizers.
                for f in get_finalizers() {
                    delete Finalizer[signing_key: f.signing_key]
                }

                // Add new finalizers.
                for key in new_set {
                    create Finalizer[signing_key: key]=>{}
                }
            }
        }
    }
}

struct FinalizerSignature {
    signing_key bytes,
    signature bytes,
}

fact FinalizeRecord[seq int]=>{}
```

#### New Policy Functions

The following new built-in functions are required:

- **`is_finalizer(signing_key)`** -- Returns true if the given public key is in the current finalizer set (`exists Finalizer[signing_key: signing_key]`).
- **`get_finalizers()`** -- Returns all entries in the current finalizer set. Used to determine the validator set and verify quorum size.
- **`verify_signature(signing_key, signature, data)`** -- Verifies a cryptographic signature against a public key. Used to validate finalizer signatures on the Finalize command.
- **`seal_multi_sig(data)`** -- Seals a command where the command ID is computed from `data` (serialized fields excluding signatures). Different signature subsets produce the same command ID.
- **`open_multi_sig(envelope)`** -- Opens a multi-signature envelope and returns the deserialized fields.

## BFT Consensus Protocol

This section defines the off-graph protocol that drives agreement among finalizers. The consensus protocol determines what to finalize and collects the signatures needed for the Finalize command. It does not directly interact with the graph -- it produces inputs that the finalization policy consumes.

The protocol is based on Tendermint and integrated via the [malachite](https://github.com/circlefin/malachite) library, which provides a standalone Rust implementation of the Tendermint algorithm.

### Single Finalizer

When the finalizer set contains exactly one member, the BFT consensus protocol is skipped. The sole finalizer publishes a `Finalize` command directly with its own signature, which satisfies the quorum check (`(1 * 2 / 3) + 1 = 1`).

This is safe because the finalizer set is always established by a single authoritative source -- the `Init` command or a prior `Finalize` command approved by quorum. Two devices cannot independently believe they are the sole finalizer at the same sequence number:

- At team creation, all devices process the same `Init` command and agree on the initial set.
- After a `Finalize` command changes the set, the new set was approved by the previous quorum. Devices that haven't synced this `Finalize` are still operating at the previous sequence number and cannot produce a valid `Finalize` at the new sequence number (the sequential check would fail).

### Triggering Finalization

A finalizer initiates a round when:

1. There are unfinalized commands in the graph beyond the last Finalize command.
2. The finalizer has synced with enough peers to have a reasonably complete view of the graph.

The consensus protocol itself prevents duplicate or conflicting rounds at the same sequence number -- no on-graph gating command is needed. If multiple finalizers attempt to initiate rounds concurrently, the BFT protocol resolves the race through its proposer selection and voting mechanism.

### Consensus Round

A consensus round has three phases: agreement, signature collection, and commit.

#### Phase 1: Agreement

The goal of this phase is for finalizers to agree on which graph head to finalize.

**Proposer selection.** A deterministic function selects the proposer for each round based on the current sequence number and round number (round-robin over the sorted validator set). All finalizers compute the same proposer independently. If the selected proposer is offline, the round times out and advances to the next round with the next proposer in rotation.

**Head exchange.** When a round begins, each finalizer sends a head exchange message to all other finalizers containing its current graph head. This allows the proposer to determine a finalization point that all finalizers can agree on.

**Proposal.** The proposer collects the head exchange messages and computes the common ancestor of the participating finalizers' graph heads. The finalization point is this common ancestor -- the furthest point in the graph that all finalizers can verify. The proposer computes the weave from the last Finalize command (or graph root if none exists) to the finalization point. The proposal contains:

- **Seq** -- The finalization sequence number.
- **Round** -- The round number within this sequence number (increments on timeout).
- **Weave Merkle root** -- The Merkle root of the proposed finalized weave ordering.
- **Facts Merkle root** -- The Merkle root of the FactDB state after executing the proposed weave.
- **Parent seq** -- The last finalized sequence number (0 if no prior finalization).

**Prevote.** Each finalizer receives the proposal and independently verifies it:

1. Compute the weave from the same starting point.
2. Execute the weave through the policy engine to produce the FactDB state.
3. Compare the computed Merkle roots against the proposal.

If the roots match, the finalizer broadcasts a prevote for the proposal. If they do not match (due to missing commands, different graph state, or invalid proposal), the finalizer prevotes nil.

Finalizers must prevote nil immediately for proposals that are obviously invalid -- for example, a sequence number that has already been finalized, or a proposal referencing an unknown parent. This allows the round to fail fast without waiting for the full timeout. If 2/3+ prevote nil, the round advances immediately to the next proposer.

**Precommit.** When a finalizer observes a quorum (2/3+) of prevotes for the same proposal, it broadcasts a precommit for that proposal. If a quorum of nil prevotes is observed, or the prevote timeout expires without quorum, the finalizer precommits nil.

**Decision.** When a quorum (2/3+) of precommits is observed for the same proposal, the round reaches agreement. If precommit quorum is not reached (nil quorum or timeout), the round number increments and a new proposer is selected. The process repeats from the head exchange step.

#### Phase 2: Signature Collection

Once agreement is reached on the finalization point, each finalizer deterministically constructs the Finalize command content from the agreed-upon proposal (seq, weave_root, facts_root, new_finalizer_set). Because the fields are deterministic given the proposal, every finalizer produces the same command content.

Each finalizer signs the command content and shares its signature with all other finalizers over QUIC. Finalizers collect signatures until they have at least a quorum (`(n * 2 / 3) + 1`).

Different finalizers may end up with different subsets of signatures -- this is fine. Any valid quorum-sized subset proves consensus. The command ID is the same regardless of which signatures are attached.

#### Phase 3: Commit

Any finalizer that has collected a quorum of signatures assembles the full Finalize command (fields + signatures) and commits it locally to the graph. Multiple finalizers may independently commit the same command. Because the command ID excludes signatures, the policy's `!exists FinalizeRecord[seq: this.seq]` check ensures only the first to be woven succeeds -- duplicates are rejected. This is harmless.

### Consensus Communication

Consensus messages are sent off-graph between finalizers. The only on-graph command produced by finalization is `Finalize`.

#### Transport

Consensus messages are multiplexed as separate QUIC streams on the existing QUIC connections used for sync. QUIC natively supports multiple independent streams on a single connection, so consensus and sync traffic coexist without interference. Finalizers open consensus streams only with other finalizers -- non-finalizer peers are unaffected and never see consensus traffic.

When a finalizer needs to send a consensus message, it opens a new stream on the existing QUIC connection to the target peer. Each stream begins with a `MsgType` enum value that identifies the protocol:

```rust
enum MsgType {
    Sync,
    Consensus,
}
```

The QUIC server reads the `MsgType` when accepting a stream and routes it to the appropriate protocol handler. Streams with an unrecognized `MsgType` are closed immediately.

#### Finalizer Peer Configuration

Finalizer network addresses are configured at runtime via the client API:

- **`add_finalizer_peer(signing_key, address)`** -- Registers a finalizer peer's network address. The local finalizer establishes (or reuses) a QUIC connection to this address for consensus communication.
- **`remove_finalizer_peer(signing_key)`** -- Removes a finalizer peer.

The on-graph finalizer set contains only public signing keys. Mapping keys to network addresses is an operational concern handled outside the graph. When provisioning a finalizer device, the operator configures the network addresses of the other finalizers.

Non-finalizer devices do not need to configure finalizer peers.

#### Consensus Message Types

| Message | Transport | Sender | Description |
|---|---|---|---|
| `HeadExchange` | QUIC stream | Finalizer | Current graph head of the sending finalizer |
| `Proposal` | QUIC stream | Proposer | Proposed finalization point with Merkle roots |
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

Timeouts increase linearly with each successive round to accommodate network delays:

```
timeout(round) = base_timeout + round * timeout_increment
```

Rounds can also fail fast without waiting for timeouts. If a finalizer receives an obviously invalid proposal (already-finalized sequence number, unknown parent, malformed content), it prevotes nil immediately. If 2/3+ prevote nil, the round advances to the next proposer without waiting for any timeout.

### Partition Handling

Finalization and normal graph operations are independent:

- **During partitions**: Non-finalizer devices continue publishing commands and syncing with reachable peers. The graph branches as normal. If fewer than 2/3 of finalizers can communicate, finalization halts but graph operations are unaffected.
- **After partition heals**: Devices sync and merge branches. Once 2/3+ of finalizers can communicate again, finalization resumes. The next Finalize command will cover all commands accumulated during the partition.

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
| `Value` | Finalize command content (weave and facts Merkle roots) |
| `ValueId` | Hash of the proposed Finalize command content |
| `Height` | Finalization sequence number (seq) |
| `Validator` | Finalizer device |
| `ValidatorSet` | All devices in the finalizer set (equal voting power) |
| `Address` | Device ID |
| `Vote` | Prevote/precommit QUIC messages |
| `Proposal` | Finalization proposal QUIC message |

#### Malachite Context Implementation

The `Context` trait is implemented with:

- **`select_proposer`** -- Deterministic selection from the sorted validator set using `seq + round` as index modulo validator count.
- **`new_proposal`** -- Constructs a proposal containing the weave and facts Merkle roots.
- **`new_prevote` / `new_precommit`** -- Constructs vote messages signed with the finalizer's signing key.

## Security Considerations

### Byzantine Finalizers

The BFT consensus tolerates up to f < n/3 Byzantine finalizers. A Byzantine finalizer can:

- Refuse to participate (equivalent to being offline -- affects liveness, not safety).
- Send conflicting votes (equivocation). Malachite detects equivocation and provides evidence. The team can respond by removing the compromised device from the finalizer set in the next `Finalize` command.
- Propose invalid finalization points. Honest finalizers will reject invalid proposals by prevoting nil immediately.

A Byzantine finalizer cannot:

- Cause an invalid Finalize command to be accepted (requires 2/3+ quorum of honest verification).
- Rewrite finalized history.
- Prevent finalization indefinitely if 2/3+ honest finalizers are online (liveness guarantee).
- Change the finalizer set without quorum agreement.

### Finalizer Set Independence

The finalizer set is independent of the role-based permission system. An admin or owner cannot add or remove finalizers -- only the current finalizer quorum can authorize changes. This prevents a compromised admin from undermining BFT guarantees by manipulating the validator set.

A compromised finalizer's blast radius is limited to disrupting or halting consensus. It cannot affect non-finalization operations (team membership, roles, AFC, etc.) unless it also has other permissions through its role.

### Minimum Validator Set

Teams should maintain at least 4 finalizer devices to tolerate 1 Byzantine fault. The `Init` and `Finalize` commands enforce a minimum of 1 finalizer, but teams with fewer than 4 have no Byzantine fault tolerance.

## Future Work

- **Graph-based consensus transport** -- Relay consensus messages as graph commands instead of requiring direct QUIC connections between finalizers. This would allow consensus to work through the existing sync topology without finalizers needing to know each other's network addresses. Requires graph support for non-permanent commands (e.g. truncation or branch-level garbage collection).
- **Pruning** -- Define a garbage collection strategy for finalized graph data, retaining only Merkle proofs.
- **Light clients** -- Devices that verify Finalize commands without replaying the full weave.
- **Finalization metrics** -- Monitoring and alerting for finalization latency and participation rates.
