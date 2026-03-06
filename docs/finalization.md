---
layout: page
title: Finalization
permalink: "/finalization/"
---

# Finalization

## Overview

Finalization is the process by which a prefix of the graph's weave becomes permanent and irreversible. Once a set of commands is finalized, they cannot be recalled by future merges. This bounds the impact of long partitions and adversarial branching by guaranteeing that accepted commands remain accepted.

Aranya uses a BFT consensus protocol to achieve finalization. Devices in the finalizer set participate in consensus rounds to agree on the current state of the weave and produce a Finalize command that commits that state to the graph.

## Terminology

| Term | Definition |
|---|---|
| Finalizer | A device in the finalizer set, participating in finalization consensus |
| Finalize command | A graph command containing Merkle roots of the finalized weave and FactDB; all ancestors become permanent |
| Consensus round | A single execution of the BFT protocol to agree on a Finalize command |
| Proposer | The finalizer selected to propose the next finalization point in a given round |
| Prevote | First-stage vote indicating a finalizer considers the proposal valid |
| Precommit | Second-stage vote indicating a finalizer is ready to commit the proposal |
| Quorum | Strictly more than 2/3 of total voting power required for consensus decisions |
| Height | The sequence number of a finalization round; increments with each successful Finalize command |

## Scope

Finalization applies to the **control plane only** -- the persistent commands on the DAG that manage team membership, roles, labels, and AFC channel configuration. Ephemeral commands and AFC data plane traffic are not subject to finalization.

## Design Goals

1. **Safety** -- A Finalize command is only produced when 2/3+ of finalizers agree on the same weave prefix. No two conflicting Finalize commands can exist in the graph.
2. **Liveness** -- As long as 2/3+ of finalizers are online and can communicate, finalization makes progress.
3. **Offline tolerance** -- Non-finalizer devices continue operating normally (publishing commands, syncing) regardless of whether finalization is active. Finalization does not block graph operations.
4. **On-demand** -- Finalization rounds are triggered explicitly by a finalizer, not on a fixed schedule.
5. **Deterministic verification** -- Any device can verify a Finalize command by checking its Merkle roots against its local weave and FactDB.

## Finalizer Set

The finalizer set is the group of devices authorized to participate in finalization consensus. Unlike role-based permissions, the finalizer set is managed independently and can only be changed through consensus.

### Initialization

The initial finalizer set is established in the team's `Init` command. The `Init` command includes an optional list of finalizer public signing keys. These keys are used to verify consensus signatures and identify which devices are authorized to participate in finalization.

If the list is omitted, the team owner's public signing key is used as the sole initial finalizer. Teams should grow the finalizer set to at least 4 members before relying on finalization for BFT safety.

### Validator Set

All devices in the finalizer set form the validator set. Each finalizer has equal voting power of 1.

The minimum validator set size for BFT safety is 4 (tolerates 1 Byzantine fault). A team initialized with fewer than 4 finalizers can still finalize, but without Byzantine fault tolerance.

| Finalizers (n) | Byzantine tolerance (f) | Quorum (2f+1) |
|---|---|---|
| 4 | 1 | 3 |
| 7 | 2 | 5 |
| 10 | 3 | 7 |
| 13 | 4 | 9 |

### Changing the Finalizer Set

The finalizer set can only be changed through a `Finalize` command that includes an optional `new_finalizer_set` field. This field, when present, contains the complete new set of finalizer public signing keys. The change takes effect at the next finalization height.

This design ensures that:

- Only a quorum of the current finalizers can authorize changes to the finalizer set.
- An admin or owner cannot unilaterally add or remove finalizers, preserving BFT guarantees.
- The finalizer set is always agreed upon by consensus, preventing split-brain scenarios where different devices have different views of who the finalizers are.

## Consensus Protocol

Finalization uses a BFT consensus protocol based on Tendermint. The protocol is integrated via the [malachite](https://github.com/circlefin/malachite) library, which provides a standalone Rust implementation of the Tendermint algorithm.

### Triggering Finalization

A finalizer should only trigger finalization when:

1. There are unfinalized commands in the graph beyond the last Finalize command.
2. The finalizer has synced with enough peers to have a reasonably complete view of the graph.

#### Single Finalizer

When the finalizer set contains exactly one member, the BFT consensus protocol is skipped. The sole finalizer publishes a `Finalize` command directly with its own signature, which satisfies the quorum check (`(1 * 2 / 3) + 1 = 1`). No `StartFinalization` command is needed.

This is safe because the finalizer set is always established by a single authoritative source -- the `Init` command or a prior `Finalize` command approved by quorum. Two devices cannot independently believe they are the sole finalizer at the same height:

- At team creation, all devices process the same `Init` command and agree on the initial set.
- After a `Finalize` command changes the set, the new set was approved by the previous quorum. Devices that haven't synced this `Finalize` are still operating at the previous height and cannot produce a valid `Finalize` at the new height (the `parent_finalize_id` chain would be broken).

#### Multiple Finalizers

When the finalizer set contains 2 or more members, the full BFT consensus protocol is used. A finalizer triggers a round by publishing a `StartFinalization` command to the graph. This creates an `ActiveFinalization` fact in the FactDB, gating the consensus round at the policy level.

The `StartFinalization` policy enforces:

- The author is a member of the current finalizer set.
- The height is exactly the last finalized height + 1 (or 1 if no prior finalization exists).
- No `ActiveFinalization` fact exists at this height (`!exists ActiveFinalization[height: this.height]`).

Once the `ActiveFinalization` fact exists, finalizers begin the off-graph consensus protocol. The `ActiveFinalization` fact is cleared when the `Finalize` command succeeds.

If a consensus round stalls (repeated timeouts without reaching quorum), the Tendermint protocol automatically advances to the next round number within the same height with a new proposer. No re-triggering is needed -- rounds retry automatically until consensus is reached or finalizers go permanently offline.

If two finalizers publish `StartFinalization` at the same height concurrently, only the first to be accepted in the weave succeeds. The second is rejected by the `!exists ActiveFinalization[height: this.height]` check. This is harmless -- the consensus round proceeds with the first trigger.

### Consensus Round

A consensus round proceeds as follows:

#### 1. Head Exchange

When a finalization round is triggered, each finalizer sends a head exchange message to all other finalizers containing its current graph head. This allows the proposer to determine a finalization point that all finalizers can agree on.

#### 2. Proposer Selection

A deterministic function selects the proposer for each round based on the current height and round number. All finalizers compute the same proposer independently.

#### 3. Proposal

The proposer collects the head exchange messages and computes the common ancestor of the participating finalizers' graph heads. The finalization point is this common ancestor -- the furthest point in the graph that all finalizers can verify. This ensures proposals cover only commands that all finalizers have, preferring efficient progress over maximizing finalization size.

The proposer computes the weave from the last Finalize command (or graph root if none exists) to the finalization point. The proposal contains:

- **Height** -- The finalization sequence number.
- **Round** -- The round number within this height (increments on timeout).
- **Weave Merkle root** -- The Merkle root of the proposed finalized weave ordering.
- **Facts Merkle root** -- The Merkle root of the FactDB state after executing the proposed weave.
- **Parent** -- The command ID of the last Finalize command (or graph root).

#### 4. Prevote

Each finalizer receives the proposal and independently verifies it:

1. Compute the weave from the same starting point.
2. Execute the weave through the policy engine to produce the FactDB state.
3. Compare the computed Merkle roots against the proposal.

If the roots match, the finalizer broadcasts a prevote for the proposal. If they do not match (due to missing commands, different graph state, or invalid proposal), the finalizer prevotes nil.

#### 5. Precommit

When a finalizer observes a quorum (2/3+) of prevotes for the same proposal, it broadcasts a precommit for that proposal. If a quorum of nil prevotes is observed, or the prevote timeout expires without quorum, the finalizer precommits nil.

#### 6. Decision

When a quorum (2/3+) of precommits is observed for the same proposal, the round reaches consensus. Any finalizer that observes the quorum can assemble and publish the Finalize command to the graph, collecting signatures from the precommit messages. This ensures the Finalize command is published even if the original proposer goes offline after consensus is reached.

If multiple finalizers publish a Finalize command for the same height, the policy rejects duplicates (`!exists FinalizeRecord[height: this.height]`). The first to be accepted in the weave succeeds; the rest are rejected but remain on the graph as recalled commands. This is harmless -- at most one Finalize command succeeds per height. A potential optimization is to drop duplicate Finalize commands at the graph layer before writing to storage, avoiding the space overhead of recalled duplicates.

If precommit quorum is not reached (nil quorum or timeout), the round number increments and a new proposer is selected. The process repeats from step 1 with the incremented round number.

### Consensus Communication

Consensus messages (head exchanges, proposals, prevotes, precommits) are sent off-graph between finalizers. This keeps the graph clean -- the only on-graph commands produced by finalization are `StartFinalization` and `Finalize`.

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

All consensus messages are signed by the sending finalizer's signing key. Recipients verify the signature and that the sender is a member of the current finalizer set before processing.

#### Graph Commands

Only two graph commands are produced per finalization round:

| Command | Author | Description |
|---|---|---|
| `StartFinalization` | Finalizer | Gates the consensus round; creates `ActiveFinalization` fact |
| `Finalize` | Any finalizer | Commits finalized state after consensus; clears `ActiveFinalization` fact |

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

## Finalize Command

The Finalize command is defined in the graph spec. Key properties:

- **Parent**: Exactly one parent (the graph head at the time of finalization).
- **Priority**: 0 (processed before all non-ancestor commands in the weave).
- **Fields**:
  - `order` -- Merkle root of the finalized weave.
  - `facts` -- Merkle root of the finalized FactDB.
  - `signatures` -- Signatures from the finalizers that precommitted to this finalization. Each entry contains the finalizer's device ID and their signature over the Finalize command content. Only finalizers that participated in the precommit are included -- Byzantine or offline finalizers are absent.
- **New finalizer set** (optional) -- If present, the complete new set of finalizer public signing keys that takes effect at the next height.
- **Policy check**: The command author must be a member of the current finalizer set. The policy verifies that `signatures` contains at least a quorum (strictly more than 2/3) of valid signatures from the current finalizer set. This ensures the Finalize command is accepted only if a supermajority of finalizers agreed, even if some finalizers were offline, unresponsive, or malicious.

The multi-signature field serves as a compact proof of consensus. Any device can verify that a supermajority of finalizers agreed to the finalization using only the Finalize command itself, without any knowledge of the off-graph consensus protocol.

### Finalize Ordering Guarantee

All Finalize commands in the graph must form a chain -- for any two Finalize commands, one must be an ancestor of the other. This is enforced by:

1. `StartFinalization` enforces sequential heights and prevents concurrent rounds at different heights.
2. The BFT consensus protocol ensures only one Finalize command is produced per height.
3. Each proposal references the previous Finalize command as its starting point.
4. The policy rejects a Finalize command if a non-ancestor Finalize command exists.

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

## Validator Set Changes

The finalizer set can only be changed through the `Finalize` command's optional `new_finalizer_set` field. The validator set for height H is determined by the finalizer set recorded at the previous Finalize command (height H-1), or the initial set from the `Init` command if no finalization has occurred.

When a `Finalize` command includes a `new_finalizer_set`:

- The new set must contain at least 1 member. For BFT safety, at least 4 members are recommended.
- The new set takes effect at the next finalization height (H+1).
- The current height's consensus still uses the old set for quorum and signature verification.
- All devices learn the new finalizer set when they process the `Finalize` command through sync.

This means adding, removing, or replacing finalizers requires the current quorum to agree. No single administrator can change the finalizer set unilaterally.

## Partition Handling

Finalization and normal graph operations are independent:

- **During partitions**: Non-finalizer devices continue publishing commands and syncing with reachable peers. The graph branches as normal. If fewer than 2/3 of finalizers can communicate, finalization halts but graph operations are unaffected.
- **After partition heals**: Devices sync and merge branches. Once 2/3+ of finalizers can communicate again, finalization resumes. The next Finalize command will cover all commands accumulated during the partition.

Finalizers that were partitioned and have a stale view of the graph will prevote nil until they sync enough state to verify the proposal. This is safe -- it only affects liveness, not safety.

### Finalization Round Fault Tolerance

The design is resilient to finalizers going offline and coming back because on-graph state and off-graph consensus serve different roles:

- **`StartFinalization`** is a command on the main graph. It persists in the weave and creates a durable `ActiveFinalization` fact in the FactDB. When an offline finalizer syncs, it receives this command and knows a finalization round is active at that height.
- **Consensus messages** (head exchanges, proposals, votes) are off-graph QUIC messages. They are not persisted. A returning finalizer does not need the prior consensus history.

When a finalizer comes back online:

1. It syncs the main graph and processes the `StartFinalization` command, restoring the `ActiveFinalization` fact in its local FactDB.
2. It observes that finalization is active at the current height.
3. It reconnects to other finalizers over QUIC (using locally configured peer addresses) and joins the in-progress consensus round. The malachite protocol handles late-joining nodes -- the finalizer participates in whatever round is currently active.
4. If the round has advanced (due to timeouts while the finalizer was offline), the returning finalizer picks up at the current round number.

This works because the Tendermint protocol does not require all validators to participate from the start of a round. A finalizer that joins mid-round can still prevote and precommit. As long as 2/3+ of finalizers are eventually online and communicating, consensus completes.

If fewer than 2/3 of finalizers are online, rounds continue to time out and advance. The `ActiveFinalization` fact remains in the FactDB, so when enough finalizers recover, they resume consensus at the same height without needing a new `StartFinalization` command.

## Security Considerations

### Byzantine Finalizers

The BFT consensus tolerates up to f < n/3 Byzantine finalizers. A Byzantine finalizer can:

- Refuse to participate (equivalent to being offline -- affects liveness, not safety).
- Send conflicting votes (equivocation). Malachite detects equivocation and provides evidence. The team can respond by removing the compromised device from the finalizer set in the next `Finalize` command.
- Propose invalid Finalize commands. Honest finalizers will reject invalid proposals during verification (step 3 of prevote).

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

## Policy Changes

### Init Command Changes

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

### StartFinalization Command

The `StartFinalization` command gates a finalization round. It creates an `ActiveFinalization` fact in the FactDB:

```policy
command StartFinalization {
    fields {
        height int,
    }

    seal { return seal_command(serialize(this)) }
    open { return deserialize(open_envelope(envelope)) }

    policy {
        check team_exists()

        let author = get_author(envelope)
        check is_finalizer(author.signing_key)

        // Height must be sequential.
        if exists FinalizeRecord[height: this.height - 1] {
            // Previous height was finalized, this is the next height.
        } else if this.height == 1 {
            // First finalization ever.
        } else {
            fail "height must be last finalized height + 1"
        }

        // No active finalization at this height.
        check !exists ActiveFinalization[height: this.height]

        // Cannot start finalization at an already-finalized height.
        check !exists FinalizeRecord[height: this.height]

        finish {
            create ActiveFinalization[
                height: this.height,
            ]=>{}
        }
    }
}

fact ActiveFinalization[height int]=>{}
```

### Finalize Command

The `Finalize` command is a normal weave command that permanently commits state:

```policy
command Finalize {
    attributes {
        priority: 0
    }

    fields {
        height int,
        weave_root bytes,
        facts_root bytes,
        parent_finalize_id optional id,
        signatures list[struct FinalizerSignature],
        new_finalizer_set optional list[bytes],
    }

    seal { return seal_command(serialize(this)) }
    open { return deserialize(open_envelope(envelope)) }

    policy {
        check team_exists()

        let author = get_author(envelope)
        check is_finalizer(author.signing_key)

        // Verify quorum: signatures must contain strictly more than
        // 2/3 of the current finalizer set.
        let finalizers = get_finalizers()
        let required = (finalizers.count * 2 / 3) + 1
        check this.signatures.count >= required

        // Verify each signature is from a current finalizer.
        for sig in this.signatures {
            check is_finalizer(sig.signing_key)
            check verify_signature(sig.signing_key, sig.signature, this)
        }

        // Finalize commands must form a chain.
        if this.parent_finalize_id is Some {
            let parent_id = unwrap this.parent_finalize_id
            check exists FinalizeRecord[finalize_id: parent_id]
        }

        // No conflicting Finalize at this height.
        check !exists FinalizeRecord[height: this.height]

        // Active finalization must exist at this height.
        check exists ActiveFinalization[height: this.height]

        // Validate new finalizer set if provided.
        if this.new_finalizer_set is Some {
            let new_set = unwrap this.new_finalizer_set
            check new_set.count >= 1
        }

        finish {
            create FinalizeRecord[
                finalize_id: command_id(envelope),
                height: this.height,
            ]=>{}

            // Clear the active finalization gate.
            delete ActiveFinalization[height: this.height]

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

fact FinalizeRecord[finalize_id id]=>{height int}
```

### New Policy Functions

The following new built-in functions are required:

- **`is_finalizer(signing_key)`** -- Returns true if the given public key is in the current finalizer set (`exists Finalizer[signing_key: signing_key]`).
- **`get_finalizers()`** -- Returns all entries in the current finalizer set. Used to determine the validator set and verify quorum size.
- **`verify_signature(signing_key, signature, data)`** -- Verifies a cryptographic signature against a public key. Used to validate finalizer signatures on the Finalize command.

## Integration with Malachite

The consensus protocol is implemented using the malachite library. The integration maps Aranya concepts to malachite abstractions:

| Malachite Concept | Aranya Mapping |
|---|---|
| `Value` | Finalize command content (weave and facts Merkle roots) |
| `ValueId` | Hash of the proposed Finalize command content |
| `Height` | Finalization sequence number |
| `Validator` | Finalizer device |
| `ValidatorSet` | All devices in the finalizer set (equal voting power) |
| `Address` | Device ID |
| `Vote` | Prevote/precommit QUIC messages |
| `Proposal` | Finalization proposal QUIC message |

### Malachite Context Implementation

The `Context` trait is implemented with:

- **`select_proposer`** -- Deterministic selection from the sorted validator set using `height + round` as index modulo validator count.
- **`new_proposal`** -- Constructs a proposal containing the weave and facts Merkle roots.
- **`new_prevote` / `new_precommit`** -- Constructs vote messages signed with the finalizer's signing key.

## Future Work

- **Graph-based consensus transport** -- Relay consensus messages as graph commands instead of requiring direct QUIC connections between finalizers. This would allow consensus to work through the existing sync topology without finalizers needing to know each other's network addresses. Requires graph support for non-permanent commands (e.g. truncation or branch-level garbage collection).
- **Pruning** -- Define a garbage collection strategy for finalized graph data, retaining only Merkle proofs.
- **Light clients** -- Devices that verify Finalize commands without replaying the full weave.
- **Finalization metrics** -- Monitoring and alerting for finalization latency and participation rates.
