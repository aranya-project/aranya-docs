---
layout: page
title: Finalization
permalink: "/finalization/"
---

# Finalization

## Overview

Finalization is the process by which a prefix of the graph's weave becomes permanent and irreversible. Once a set of commands is finalized, they cannot be recalled by future merges. This bounds the impact of long partitions and adversarial branching by guaranteeing that accepted commands remain accepted.

Aranya uses a BFT consensus protocol to achieve finalization. Devices with the `Finalize` permission participate in consensus rounds to agree on the current state of the weave and produce a Finalize command that commits that state to the graph.

## Terminology

| Term | Definition |
|---|---|
| Finalizer | A device whose role includes the `Finalize` permission, participating in finalization consensus |
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

## Roles and Permissions

### Finalize Permission

A new permission, **`Finalize`**, is added to the policy. Any device whose role includes this permission participates in finalization consensus.

The `Finalize` permission can be added to any existing role via `add_perm_to_role`, or a custom role can be created specifically for finalization. For convenience, a new default role is provided:

### Finalizer Role

| Property | Value |
|---|---|
| Name | `finalizer` |
| Default | Yes |
| Rank | `DEFAULT_FINALIZER_ROLE_RANK` (500) |
| Permissions | `Finalize` |

The Finalizer role exists as a convenience for teams that want dedicated finalization devices. Teams may instead add the `Finalize` permission to existing roles (e.g. Admin) to allow those devices to participate in consensus alongside their other responsibilities.

### Validator Set

All devices with the `Finalize` permission form the validator set. Each finalizer has equal voting power of 1. The validator set is determined at the start of each consensus round from the current FactDB state.

The minimum validator set size for BFT safety is 4 (tolerates 1 Byzantine fault). A team may operate without finalization if fewer than 4 finalizers are available.

| Finalizers (n) | Byzantine tolerance (f) | Quorum (2f+1) |
|---|---|---|
| 4 | 1 | 3 |
| 7 | 2 | 5 |
| 10 | 3 | 7 |
| 13 | 4 | 9 |

## Consensus Protocol

Finalization uses a BFT consensus protocol based on Tendermint. The protocol is integrated via the [malachite](https://github.com/circlefin/malachite) library, which provides a standalone Rust implementation of the Tendermint algorithm.

### Triggering Finalization

Any finalizer device can trigger a finalization round by initiating a consensus proposal. This is an on-demand operation -- there is no automatic timer or command threshold.

If two finalizers trigger finalization at the same height concurrently, both consensus rounds proceed normally. Honest finalizers treat duplicate proposals at the same height as a single finalization -- they participate in whichever round they observe first and ignore redundant messages. The only cost is extra consensus traffic from the duplicate initiator. At most one Finalize command succeeds per height (`!exists FinalizeRecord[height: this.height]`), so duplicates are harmless.

A finalizer should only trigger finalization when:

1. There are unfinalized commands in the graph beyond the last Finalize command.
2. The finalizer has synced with enough peers to have a reasonably complete view of the graph.

### Consensus Round

A consensus round proceeds as follows:

#### 1. Head Exchange

When a finalization round is triggered, each finalizer publishes a `ConsensusHeadExchange` transient command containing its current graph head. This allows the proposer to determine a finalization point that all finalizers can agree on.

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

When a quorum (2/3+) of precommits is observed for the same proposal, the round reaches consensus. Any finalizer that observes the quorum can assemble and publish the Finalize command to the graph, collecting signatures from the precommit messages on the consensus branch. This ensures the Finalize command is published even if the original proposer goes offline after consensus is reached.

If multiple finalizers publish a Finalize command for the same height, the policy rejects duplicates (`!exists FinalizeRecord[height: this.height]`). The first to be accepted in the weave succeeds; the rest are rejected but remain on the graph as recalled commands. This is harmless -- at most one Finalize command succeeds per height. A potential optimization is to drop duplicate Finalize commands at the graph layer before writing to storage, avoiding the space overhead of recalled duplicates.

If precommit quorum is not reached (nil quorum or timeout), the round number increments and a new proposer is selected. The process repeats from step 1 with the incremented round number.

### Consensus Communication

Consensus messages (proposals, prevotes, precommits) are graph commands. They propagate through the normal sync protocol, reaching all finalizers regardless of network topology. This means:

- Finalizers do not need to know each other's network addresses or be configured as direct sync peers.
- Consensus messages reach finalizers through whatever sync topology exists (direct peers, hub-and-spoke, multi-hop relay).
- No additional peer discovery or routing protocol is required.

#### Consensus Branch

Consensus commands (proposals, prevotes, precommits) are published on an ephemeral branch of the graph. This branch is separate from the main command history -- consensus commands do not participate in the weave and are not processed by the policy engine on non-finalizer devices.

The consensus branch works as follows:

1. The proposer publishes a `ConsensusProposal` command, branching off from the current graph head.
2. Finalizers publish `ConsensusPrevote` and `ConsensusPrecommit` commands as children on the consensus branch.
3. Once consensus is reached, the proposer publishes the `Finalize` command parented off the **main graph head**, not the consensus branch.
4. The consensus branch is now dead -- no future commands extend it. Devices prune it during garbage collection.

This keeps the main graph clean. The consensus branch is a side channel that uses the graph for transport and sync but does not affect the weave or FactDB.

#### Consensus Command Types

| Command | Location | Author | Description |
|---|---|---|---|
| `ConsensusHeadExchange` | Consensus branch | Finalizer | Publishes the finalizer's current graph head |
| `ConsensusProposal` | Consensus branch | Proposer | Proposed finalization point with Merkle roots |
| `ConsensusPrevote` | Consensus branch | Finalizer | First-stage vote for or against a proposal |
| `ConsensusPrecommit` | Consensus branch | Finalizer | Second-stage vote to commit a proposal |
| `Finalize` | Main graph | Any finalizer | Final command produced after consensus is reached |

### Consensus Overhead

A successful consensus round produces 3n + 2 commands (n head exchanges + 1 proposal + n prevotes + n precommits + 1 Finalize), where n is the number of finalizers. A failed round (timeout) adds up to 2n + 1 commands before the next round begins (head exchange is not repeated).

| Finalizers | Commands (success) | Commands (1 failed round + success) |
|---|---|---|
| 4 | 14 | 23 |
| 7 | 23 | 38 |
| 10 | 32 | 53 |

Since consensus commands live on an ephemeral branch, this overhead only temporarily increases memory usage and sync transport bandwidth. After finalization completes, the consensus commands can be garbage collected, leaving only the Finalize command on the main graph.

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
- **Policy check**: The command author must have the `Finalize` permission. The policy verifies that `signatures` contains at least a quorum (strictly more than 2/3) of valid signatures from the current validator set. This ensures the Finalize command is accepted only if a supermajority of finalizers agreed, even if some finalizers were offline, unresponsive, or malicious.

The multi-signature field serves as a compact proof of consensus. Any device can verify that a supermajority of finalizers agreed to the finalization without needing to process the consensus branch. This is especially useful after the consensus branch has been garbage collected.

### Finalize Ordering Guarantee

All Finalize commands in the graph must form a chain -- for any two Finalize commands, one must be an ancestor of the other. This is enforced by:

1. The BFT consensus protocol ensures only one Finalize command is produced per height.
2. Each proposal references the previous Finalize command as its starting point.
3. The policy rejects a Finalize command if a non-ancestor Finalize command exists.

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

The validator set can change between finalization heights as finalizer devices are added or removed from the team. The validator set for height H is determined by the FactDB state at the previous Finalize command (height H-1).

This means:

- Adding a new finalizer device takes effect at the next finalization height after the `AssignRole` command is finalized.
- Removing a finalizer device (revoking the Finalizer role or removing the device) takes effect at the next finalization height after the revocation is finalized.

## Partition Handling

Finalization and normal graph operations are independent:

- **During partitions**: Non-finalizer devices continue publishing commands and syncing with reachable peers. The graph branches as normal. If fewer than 2/3 of finalizers can communicate, finalization halts but graph operations are unaffected.
- **After partition heals**: Devices sync and merge branches. Once 2/3+ of finalizers can communicate again, finalization resumes. The next Finalize command will cover all commands accumulated during the partition.

Finalizers that were partitioned and have a stale view of the graph will prevote nil until they sync enough state to verify the proposal. This is safe -- it only affects liveness, not safety.

## Security Considerations

### Byzantine Finalizers

The BFT consensus tolerates up to f < n/3 Byzantine finalizers. A Byzantine finalizer can:

- Refuse to participate (equivalent to being offline -- affects liveness, not safety).
- Send conflicting votes (equivocation). Malachite detects equivocation and provides evidence. The team can respond by revoking the compromised device.
- Propose invalid Finalize commands. Honest finalizers will reject invalid proposals during verification (step 3 of prevote).

A Byzantine finalizer cannot:

- Cause an invalid Finalize command to be accepted (requires 2/3+ quorum of honest verification).
- Rewrite finalized history.
- Prevent finalization indefinitely if 2/3+ honest finalizers are online (liveness guarantee).

### Finalization and Privilege Escalation

The `Finalize` permission only grants the ability to participate in finalization consensus. If a device's role has only this permission (e.g. the default Finalizer role), its blast radius is limited to disrupting or halting consensus.

If the `Finalize` permission is added to a role with other permissions (e.g. Admin), a compromised device has a broader blast radius. Teams should weigh the operational convenience of multi-purpose finalizers against the security benefit of dedicated finalizer devices.

### Minimum Validator Set

Teams should maintain at least 4 finalizer devices to tolerate 1 Byzantine fault. Teams with fewer than 4 finalizers cannot safely finalize and should not attempt to do so.

## Policy Changes

### New Permission

Add `Finalize` to the `Perm` enum:

```policy
enum Perm {
    // ... existing permissions ...
    Finalize,
}
```

The Owner role receives the `Finalize` permission alongside all other permissions. The new Finalizer default role receives only this permission.

### Finalizer Default Role

Add a `Finalizer` variant to `DefaultRoleName` and seed it in `setup_default_roles`:

```policy
enum DefaultRoleName {
    Admin,
    Operator,
    Member,
    Finalizer,
}
```

The Finalizer role is created with rank `DEFAULT_FINALIZER_ROLE_RANK` (500) and granted only the `Finalize` permission.

### Transient Commands

A new `transient` keyword is introduced in the policy language for commands that are synced via the graph but excluded from the weave. Unlike `ephemeral` commands (which are local-only and never synced), transient commands propagate through the sync protocol like normal commands but do not participate in weave ordering, do not mutate the FactDB, and do not emit effects. They are validated when received (author signature, permission checks) to prevent unauthorized publishing.

Consensus commands are defined as transient:

```policy
transient command ConsensusHeadExchange {
    fields {
        height int,
        graph_head id,
    }

    seal { return seal_command(serialize(this)) }
    open { return deserialize(open_envelope(envelope)) }

    policy {
        check team_exists()
        let author = get_author(envelope)
        check device_has_perm(author.device_id, Perm::Finalize)
    }
}

transient command ConsensusProposal {
    fields {
        height int,
        round int,
        weave_root bytes,
        facts_root bytes,
        parent_finalize_id id,
    }

    seal { return seal_command(serialize(this)) }
    open { return deserialize(open_envelope(envelope)) }

    policy {
        check team_exists()
        let author = get_author(envelope)
        check device_has_perm(author.device_id, Perm::Finalize)
    }
}

transient command ConsensusPrevote {
    fields {
        height int,
        round int,
        value_id optional bytes,
        voter_id id,
    }

    seal { return seal_command(serialize(this)) }
    open { return deserialize(open_envelope(envelope)) }

    policy {
        check team_exists()
        let author = get_author(envelope)
        check device_has_perm(author.device_id, Perm::Finalize)
    }
}

transient command ConsensusPrecommit {
    fields {
        height int,
        round int,
        value_id optional bytes,
        voter_id id,
    }

    seal { return seal_command(serialize(this)) }
    open { return deserialize(open_envelope(envelope)) }

    policy {
        check team_exists()
        let author = get_author(envelope)
        check device_has_perm(author.device_id, Perm::Finalize)
    }
}
```

After finalization completes, transient consensus commands on the consensus branch are eligible for garbage collection.

#### Finalize Command

The `Finalize` command itself is **not** ephemeral -- it is a normal weave command that permanently commits state:

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
    }

    seal { return seal_command(serialize(this)) }
    open { return deserialize(open_envelope(envelope)) }

    policy {
        check team_exists()

        let author = get_author(envelope)
        check device_has_perm(author.device_id, Perm::Finalize)

        // Verify quorum: signatures must contain strictly more than
        // 2/3 of the current validator set.
        let validators = get_devices_with_perm(Perm::Finalize)
        let required = (validators.count * 2 / 3) + 1
        check this.signatures.count >= required

        // Verify each signature is from a valid finalizer.
        for sig in this.signatures {
            check device_has_perm(sig.device_id, Perm::Finalize)
            check verify_signature(sig.device_id, sig.signature, this)
        }

        // Finalize commands must form a chain.
        if this.parent_finalize_id is Some {
            let parent_id = unwrap this.parent_finalize_id
            check exists FinalizeRecord[finalize_id: parent_id]
        }

        // No conflicting Finalize at this height.
        check !exists FinalizeRecord[height: this.height]

        finish {
            create FinalizeRecord[
                finalize_id: command_id(envelope),
                height: this.height,
            ]=>{}
        }
    }
}

struct FinalizerSignature {
    device_id id,
    signature bytes,
}

fact FinalizeRecord[finalize_id id]=>{height int}
```

### New Policy Functions

Two new built-in functions are required:

- **`get_devices_with_perm(perm)`** -- Returns all devices whose role includes the specified permission. Used to determine the validator set and verify quorum size.
- **`verify_signature(device_id, signature, data)`** -- Verifies a cryptographic signature against the device's public signing key. Used to validate finalizer signatures on the Finalize command.

## Integration with Malachite

The consensus protocol is implemented using the malachite library. The integration maps Aranya concepts to malachite abstractions:

| Malachite Concept | Aranya Mapping |
|---|---|
| `Value` | Finalize command content (weave and facts Merkle roots) |
| `ValueId` | Hash of the proposed Finalize command content |
| `Height` | Finalization sequence number |
| `Validator` | Finalizer device |
| `ValidatorSet` | All devices with `Finalize` permission (equal voting power) |
| `Address` | Device ID |
| `Vote` | Prevote/precommit graph commands |
| `Proposal` | Finalization proposal graph command |

### Malachite Context Implementation

The `Context` trait is implemented with:

- **`select_proposer`** -- Deterministic selection from the sorted validator set using `height + round` as index modulo validator count.
- **`new_proposal`** -- Constructs a proposal containing the weave and facts Merkle roots.
- **`new_prevote` / `new_precommit`** -- Constructs vote commands signed with the finalizer's signing key.

## Future Work

- **Pruning** -- Define a garbage collection strategy for finalized graph data, retaining only Merkle proofs.
- **Light clients** -- Devices that verify Finalize commands without replaying the full weave.
- **Finalization metrics** -- Monitoring and alerting for finalization latency and participation rates.
