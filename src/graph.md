---
title: Graph Auth
taxonomy:
  category: docs
---

Disclaimer: this document is somewhat out-of-date and incomplete.

## Introduction
In Aranya, the event graph will branch and merge much like the change history in a distributed revision control system such as Git.

We will model Aranya in the alloy model checker. The Alloy language requires that libraries used are specified at the start of the document so we include them here:
```alloy
open util/ordering[Id]
sig Id {}
```
(This statement tells us that there is a `Id` type which has no fields but which is ordered.)

The goal of Aranya is to allow for continued operation of all nodes during a network partition. This continued operation must be allowed regardless of the size and number of partitions.

This introduces new core challenges when designing protocols:

1. All branches must be automatically mergeable without conflicts.
2. Race conditions are of unbounded interval due to unbounded number of partitions.
3. Branching from the past and merging to the current state must not provide adversarial advantage.

The first two challenges have prior art we can borrow from:

- Conflict free merging is the topic of CRDTs (Conflict-free Replicated Data Types).

- Race conditions can be bounded through the blockchain concept of "finalization", which can be achieved using a consensus protocol if some part of the device population can reach consensus.

The third challenge, adversarial branching, is a new topic with little published research on the topic. What research does exist is on the topic of byzantine CRDTs, but does not offer a solution we can use. This challenge of adversarial branching will be a core topic to cover in this document. This concept is stated concretely as *Goal-1*:

> **Goal-1**: Given an acyclic graph of commands which are indexed as a collection of key value pairs known as facts. At every state *s*, if an entity is not able to transition to state *s+1* by evaluating policy over a new command `A` and the set of facts produced by *s*, they should not be able to produce a branch from an ancestor state (i.e. from evaluating a sub-state), which when merged with state *s* results in a state containing `A`.
```alloy
// State this as an assertion in alloy
```

## Overview
Aranya can be thought of as consisting of three concepts: Commands, Facts, and Policy.

Commands are a type of message and are the basis of any Aranya protocol.

Facts are structured key-value pairs which are produced by executing commands. This index is known as the FactDB.

Policy is a set of rules which describe how an existing set of facts and a command produce a new set of facts:

>*policy(command, facts) -> facts'*

These three concepts are combined by repeated evaluation of policy over commands and facts:
```
  facts_0 = empty set
  facts_1 = policy(command_0, facts_0)
  facts_2 = policy(command_1, facts_1)
  ...
  facts_n = policy(command_n-1, facts_n-1)
```

In addition to evaluating a command over a set of facts, policy will also validate and verify the command. We then say that a command is "accepted by the policy" if it is valid, passes verification, and is successfully evaluated with the given set of facts.

<!---
Using above definition to arrive at State Transition by implications:

1. Evaluation of policy over a command `A` and a set of facts produces a new set of facts.

2. Given set of commands. Repeated evaluation of policy over each command in the set and the corresponding set of facts that resulted from the previous evaluation, produces the final set of facts which represents the indexing of the set of commands.

3. Evaluation of policy over a state *s* produces a collection of facts which indexes the commands in *s*.

4. Transitioning from state *s* to *s+1* occurs by evaluating policy over new command `C` and the set of facts produced by state *s*. (Equivalently, this says that transition occurs by evaluating policy over *s* + `C`)

5. If evaluation fails, then the state could not be transitioned and the command is said to be rejected by the policy. If evaluation succeeds, `C` is said to be accepted by the policy and the current state is set to *S+1*, which contains `C`.
--->

### States
A state in Aranya is a set of Commands. For example if we had the command instances `Alpha, Beta` we could construct three states `{Alpha}`, `{Beta}`, and `{Alpha, Beta}`.

Given a deterministic function which provides a total ordering over any set of Commands this approach can be used to build a distributed system which supports eventual consistency.

Most blockchains in productions use an ordering approach that is provided by a partial deterministic ordering augmented by a Validator, a miner in blockchain parlance, which extends the deterministic partial order into a total order. 

In this approach Validators have large amounts of freedom over the total order. For financial transactions between mutual distrusting parties, this is workable as the prevention of double spending requires a global consistent state and the freedom of the miners to produce different orderings can largely be ignored. (Though Miner Extractable Value, MEV, is still an issue that is exacerbated by this flexibility in ordering.)

 In Aranya we will choose maximal availability and eventual consistency over global consistency. To do this we must replace the Validator with a `weave` function which provides deterministic total ordering over Commands.

## Definitions
Before describing the system we will define some terms used in our discussion.

### Command
A command is a typed message serialized using the Aranya Event Format. Each message has a static list of user fields defined by a schema as well as a common set of base fields: *id*, *policy*, *group*, *parent*, and *priority*.


The *policy* field specifies which policy rule should be used to process the command.
<!--- what is the representation of this field? --->

The *group* field is a 32 byte field used to partition commands for use by policy, access controls, and to support partial replication.
<!--- 32 bytes might be bigger then we need, could use 16. The goal is that it can be picked without coordination in a way that will avoid coalitions -->

The *parent* field contains the cryptographic hashes of other commands which have a causal relationship with a given command. There may 0, 1, or 2 values in the parent field.

The *priority* is a 32bit unsigned integer value used to order events which do not have a causal relationship.
<!--- is 32bits the right size? How should we pick the size? --->

```alloy
abstract sig Group {}

abstract sig Command {
  group   : one Group,
  parent  : set Command,
  priority: one Int,
}
```

### Parent
Command `A` is a parent of command `B` if and only if `B` has `A` in its `parent` field.
```alloy
// Test if a is a parent of b.
pred parent[ a, b: one UserCommand ] {
  a in b.parent
}
```

### Ancestor
Command `A` is ancestor of command `B` if and only if  `A` can be reached from be `B` by walking the graph of parents from child to parent.
```alloy
// Test if a is an ancestor of b.
pred ancestor[ a, b: one Command ] {
  a in b.^parent
}
```

### State
A state is a distinct set of commands which all share a single common ancestor.
```alloy
// Test if a set of commands is a state.
pred is_state[commands: some Command] {
    one init: commands | {
    no init.parent
    all decendent : commands - init |
      ancestor[init, decendent]
  }
}
```

## State Transition

A state `S` is said to transition to a new state `S+1` if and only if the policy accepts a command `A` which is not in `S` by evaluating over `A` and the set of facts produced from `S`.

State `S+1` may then be the set union of `S` and `{A}`, or, if `A` is part of a set of commands that are accepted by the policy over `S`, then `S+1` may be the union of `S` and that set of commands.

<!---
going from one state to another:
state is just a set of commands with single common ancestor, so to go to the next state means adding command(s) to the commandSet, which occurs when policy receives and approves new commands.
--->

### Weave
Given a set of commands which form a state (`is_state[commands]`), the weave is a total ordering of the commands. We will formally define the requirements of the weave function later after discussion of the requirements.

### FactDB
A FactDB is a set of triples `<path, key, value>`.  Path is a name space, and key and value are tuples. There can be only a single value associated with any key in a name space.
```alloy
abstract sig Path {}
abstract sig Key {}
abstract sig Value {}

sig FactDB {
  var event     : lone Command,
  var facts     : Path -> Key -> Value,
}
```
In the model we additionally include the Command which transitioned the FactDB to it's current state.

### Policy
Policy is a set of rules which verify commands are valid given a FactDB. If found to be valid the policy may mutate the FactDB.

### Fact Mutation
A fact `F` is said to be mutated by a command `A` if and only if the policy which accepts `A`, inserts, updates, or deletes, the key or value of `F`.
```alloy
pred mutation[path: Path, key: one User, command: one UserCommand] {
  some st: FactDB | eventually {
    st.event = command
    st.facts[path][key] != st.facts'[path][key]
  }
}
```
<!--- this definiton implies that if a command sets a fact to its current value that does not count as a mutation. Is that correct? --->

### Dependency
Command `B` is said to depend on command `A` if and only if neither `A` nor `B` are ancestors of each other and the policy rule that accepts `A` mutates a fact which is read by the policy rule that accepts `B`.
<!--- this can not be modeled as we don't model policy --->

### Recalled Command
A command `A` is said to be recalled if there is some set of commands `S1` for which `A` is accepted in the weave of `S1`, but there is some distinct set `S2`, where `S2` is a super set of `S1`, and `A` is not accepted in `S2`.
<!--- model TBD --->

### Finalization
If an event `A` has been finalized in some set of commands `S`, then all the commands which appear in the weave of `S` prior to `A` must be ancestors of `A`.
```alloy
pred finalized[final: one Command, commands: some Command] {
  weave[commands]
  all st: FactDB | {
    eventually st.event = final implies {
      before historically ancestor[st.event, final]
    }
  }
}
```

### Head
The head of a set of commands `S` is a command `A` where all other commands in `S` are ancestors of `A`. An implication of this definition is that a set can have only one head; but any set without a head can be broken up into subsets which do have heads.
```alloy
pred head[head: one Command, commands: some Command] {
  head in commands
  all c: commands - head | ancestor[c, head]
}
```

### Extension
A set of commands `S` is an extension of a command `A` iff:
  - `S` has a head.
  - `A` is an ancestor of all commands in `S`.
  - At least one command in `S` has `A` as a parent.
  - No command in `S` has a parent that is not in `A` + `S`.

```alloy
pred extension[base: one Command, commands: some Command] {
    all c: commands | ancestor[base, c]
    some c: commands | base in c.parent
    all p: commands.parent | p in commands + base
    one c: commands | head[c, commands]
}
```

### Branch
Two sets of commands `S1` and `S2` are branches of some command `A` iff `S1` and `S2` are extensions of `A` and there are no commands in the intersection of `S1` and `S2`

```alloy
pred branch[ a: one Command, s1, s2: some Command] {
  extension[a, s1]
  extension[a, s2]

  no s1 & s2
}
```

## Weave Function
In this section we will discuss the properties the weave function must have before presenting a formalization of the weave function.

We will consider two types of order which must be implemented: causal, and priority ordering. Together these will allow policy writers to implement secure decentralized protocols.

### Causal Order
The *parent* relationship defines a causal graph for Commands. This "happens before" relationship communicates the intended sequencing of commands from the client that issues them. Causality must be honored by a weave function:

> **Requirement-1:** A weave must not order a command before any of it's ancestors.
```alloy
pred ancestor_order {
  all st: FactDB | always {
     all parent: st.event.parent | before once st.event = parent
  }
}

assert requirement_ancestor_order {
  weave[Command] implies ancestor_order[]
}

check requirement_ancestor_order for 4 but 1..8 steps
```

This order, though, is insufficient to provide a total order over a set of commands. So we must extend this with priority order.

### Priority Order
When two commands share the same parent this creates a branch in the causal order. Such a branch can be resolved by using a merge command, a command with more than one parent. In this case there is no "happens before" relationship between commands on each side of the branch between the merge and the first common ancestor. To provide a total order, a weave algorithm must have a non-causal approach to ordering commands.
<!--- this needs to be improved to motivate the need to merge branches --->

 To explore this lets assume a simple set of commands with the following effects and an example event graph:

| Command   | Meaning
|:----------|:---
| `I(f0..fn)`| Initialize `state` with facts `f0` through `fn`.
| `C(f, d)` | Add a fact `f` to the `state` which is dependent on fact `d`.
| `D(f)`   | Delete fact `f` from the `state`.
| `M`       | Merge two `state`s in to a single `state`.

And the following event graph:
```
      C2(f2, f1) -- C3(f3, f1)
    /                         \
I(f1)                          M
    \                         /
      -------- D(f1) --------
```
(*fig 1*)

In any cycle-free walk from `I` to `M`, commands visited earlier in the walk happen before commands later in the walk; but we cannot assign a "happens before" relationship between commands which are not included in the same walk. For example, causally `D` cannot be said to have happened before or after `C2` or `C3`.

This lack of ordering across the branches is a challenge when merging state at `M`. Our end goal is to produce a deterministic total order of commands but there are several reasonable orderings:

| Weave | First | Second | Third | in `E` |
|:-----:|:-----:|:------:|:-----:|-------:|
|1      | D     | C2     | C3    |        |
|2      | C2    | D      | C3    | f2     |
|3      | C2    | C3     | D     | f2, f3 |
*Table 1*

Given this we must come up with a method of choosing one weave deterministically so all nodes compute the same order at `M`.

Additionally we must assume an adversary may create a branch to try and invalidate some state later in the causal order as part of an attack. Defending against this would require ordering 1, or 3 in table 1.

To achieve this we must provide a way for commands which are not causally related to have a deterministic order. We do this by introducing the concept of command priority.

#### Command Priority
Command priority is an unsigned integer value. In a weave higher priority commands must come before lower priority ones unless the lower priority command is an ancestor of the higher priority command.

> **Requirement-2**: In a weave, if command `A` is immediately followed by command `B` and `A` is not the parent of `B`, implies that the priority of `A` must be greater than or equal to the priority of `B`. The one exception to this rule is that finalized commands must occur before all commands which are not their ancestors.

In the case that two commands have the same priority they will be ordered pseudo randomly.
```alloy
pred prorityOrder[first, second: one Command] {
  first in Finalize ||
  first.priority >= second.priority
}

pred has_prority_order {
  all st: FactDB | always {
    (some st.event' and (not parent[st.event, st.event'])) implies
      prorityOrder[st.event, st.event']
  }
}

assert requirment_prority_order {
  weave[Command] implies has_prority_order[]
}

check requirment_prority_order for 4 but 2..8 steps
```
We can now extend our previous example adding priorities to it, denoted with the syntax `[n]`, where `n` is the priority.
```
      C2(f2, f1)[0] -- C3(f3, f1)[0]
    /                               \
I(f1)                               M
    \                              /
      --------- D(f1)[1] ---------
```
(*fig 2*)
In this example the order must be:
`I - D - C2 - C3 - M`

Resulting in weave 1 and a desired outcome.

A remaining question is that of how the priorities should be assigned. Given that priorities are used to compute the weave and thus affect the "happens before" relationship, it is critical that we make sure assigned priorities are correct before they are used by the weave function.

To do this we must evaluate events in the branch they were created in and evaluate the priorities at that time.

This approach will not solve all possible problems though. Consider the following graph annotated with priorities:
```
          C3(f3, f1)[0] - D2(f2)[1]
         /                         \
I(f1, f2)                           M
         \                         /
          C4(f4, f2)[0] - D1(f1)[1]
```
*fig 3*

In this example valid weaves would be:

`I - C3 - D2 - C4 - D1 - M`

or

`I - C4 - D1 - C3 - D2 - M`

but this would result in differing factDBs.

We know of no generic resolution to such conflicts which do not open the door to branch+merge attacks. Known resolutions rely on deterministically picking one of the branches as the winner but any such approach can be gamed by an adversary to ensure their branch wins. Instead policy designers must ensure that such conflicts do not occur for security critical contexts.

To support developers we will provide tooling to aid in checking their policy is free of conflicts.

#### ID Order
In some cases there will not be a causal relationship between events and a pair of events may have the same priority; to resolve this ambiguity we order by the event ID.
```alloy
one sig CommandIdMap {
  ids: Command one -> one Id
}

fun id[command: one Command]: one Id {
  CommandIdMap.ids[command]
}

pred greater[id1, id2: one Id] {
  id2 in id1.nexts
}
```
The ID of an event is based on the cryptographic hash of the event and it is guaranteed that two distinct events will never have the same ID.

#### Transactions
> Transactions will not be in initial release.

Aranya includes built-in support for transactions which are a sequence of commands which must be processed sequentially and must all be accepted for any to be accepted. This implies that all commands in a transaction must be sequential in a weave.

> **Requirement-3**: All commands in a transaction must be sequential in a weave.

> **To be worked out**: What is the priority of a transaction? I think all commands in a transaction should have the same priority as they must have the same author.


### Weave Algorithm
We now have enough context to specify a weave function.

The weave function will understand three concrete and two abstract command types.


#### Init
The `Init` event is the common ancestor for all other Commands in any execution of a Aranya protocol. It necessarily has no parents.
```alloy
sig Init extends Command {
  roles: User -> Role,
} {
  no parent
  priority = 0
}

pred init[st: one FactDB] {
  one ev: Init | {
    st.event = ev
    no st.facts
    st.facts' = RolePath -> ev.roles
  }
}
```
<!--- this should be an abstract type which dose not have the roles filled which instead should be applied to a sub type in our example usage -->

#### Merge
In the case that a branch occurs in the parent graph, a `Merge` event can be used to ensure that future commands are after the heads of both branches in the weave. It necessarily has two parents.
<!--- we must show that merge is commutative or else it is possible to use merge to control weave order in a non causal way. I think it must be as we can write a compare function which returns the order of any two elements AB and that means we can use any sort algorithm, but I am not sure that is a full argument --->
```alloy
sig Merge extends Command {} {
  #parent = 2
  priority = 0
}

fact {
  // Two merge operations must have distinct branches.
  all disj m1, m2 : Merge | {
    m1.parent != m2.parent
  }
}

pred merge[st: one FactDB] {
  one ev: Merge | {
    st.event = ev
    st.facts' = st.facts
  }
}
```
<!--- Do we need to ensure that a event can not be merged with one of it's ancestors? It seems like this should be harmless but should we allow it? --->

#### Finalize
The Finalize command has two type fields, `order`, and `facts`. Both are of the type `MerkleRoot` which is the root element of a Merkle tree. The order field is the Merkle tree which represents the finalized weave. The `facts` field is the root of a Merkle tree for the finalized FactDB.

```alloy
sig MerkleRoot {}

sig Finalize extends Command {
  order: one MerkleRoot,
  facts: one MerkleRoot,
} {
  one parent
  priority = 0
}
```

In the weave, a `Finalize` event must occur after all its ancestors, and before all events which are not its ancestors.

```alloy
pred finalize_order {
  all f: Finalize | eventually some st: FactDB | {
    st.event = f
    all c: Command | {
      (before once st.event = c) implies
        ancestor[c,f]
    }
  }
}

assert requirement_finalize_order {
  weave[Command] implies finalize_order[]
}

check requirement_finalize_order for 4 but 1..8 steps
```
This implies that the effects of ancestors of a `Finalize` event will never be recalled.

It also implies that for all pairs of `Finalize` events which occur in a weave one must be an ancestor of the other. Aranya does not provide any mechanisms to enforce this, and a protocol that uses `Finalize` must have a means to guarantee this property as a weave can not be produced if it is violated.

Finalize is a very powerful command and can be abused. An adversary is able to control which commands get finalized. Policy writers must take care if they allow finalization in their protocols.

#### Algorithm
The weave algorithm must ensure that:
  - There is exactly one Init command in a weave.
  - All commands are part of the weave.
  - All parents occur before their children.
  - If an element `A` immediately precedes another element `B` in the weave, and `A` is not a parent of `B`, the priority of `A` must be greater than or equal to the priority of `B`.
  - If an element `A` immediately precedes another element `B` in the weave, and `A` is not a parent of `B`, and the priorities are equal, then `A` must have a greater ID than `B`.

```alloy
pred weave[commands: some Command] {
  one c:Init | c in commands

  one st: FactDB | {

    // all commands are part of the weave
    all c: commands | eventually {
      st.event = c
    }

    // Parents must be in the past
    always {
      all p: st.event.parent |
        before once st.event = p
    }

    // Next command must be child or
    // equal or lower priority
    always {
      some st.event' implies {
        (st.event in st.event'.parent) || {
          prorityOrder[st.event, st.event']
          st.event.priority = st.event'.priority implies
            greater[id[st.event], id[st.event']]
        }
      }
    }
  }
}
```
Any implementation of a weave must guarantee that these properties hold but there are many different implementations which do that making different space time tradeoffs.

An example procedural approach would be:
1. Find an Init event and set that to the current event.
2. Iteratively walk from parent to child processing each event and updating the FactDB and adding commands to the weave.
3. If an event has two children take a snapshot of the FactDB and the weave, storing a pointer to them on a stack. Pick a child and go to step 2
4. If a merge command is encountered and both parents of the merge have been found, walk backwards merging the two branches. Then pop the stack and set the state FactDB to the snapshot. Then reprocess events in the merged order up to the merge event adding commands to the weave. Go to step 2.
5. If a merge is encountered and the second parent has not been processed, return the FactDB to the state at the head of the stack and continue at step 2 with the unprocessed child events.
6. When no more children can be found but the stack is not empty, return the weave and FactDB from the bottom of the stack. Return all commands not part of the returned weave as orphan commands.

### Management of Siblings
If there was an Aranya policy where one Admin may modify the role of a sibling Admin, this could lead to a conflict where they both remove the fact that makes them an admin creating a case with no valid weave.

#### Mitigation
The authority hierarchy must only allow a user to manage themselves and roles below them.

### Counters and Other Dependent Updates
To implement incrementing a counter we use a test and set approach to updating a fact value. This will cause a conflict if a counter is updated on two branches.

#### Mitigation
**Option 1:** Instead of having a single counter concurrently updated by all users there should be a sub counter for each user with the current value of the counter being calculated as sum of the user counters.

It is not clear how to do this when the number of sub counters is unknown as queries in the policy language only support reading static keys.

**Option 2:** We could extend the operations that can be performed on a fact value. Currently we support only set and delete. We could add other operations such as increment and decrement.

# Thoughts to be integrated into this document

- **Recalled commands**: When an event would be accepted in one branch but was not accepted on merge due to conflict; the event should be event marked as recalled. A recalled event should still be available to applications. If an event has been provided to an application but is later recalled, the application must be notified that the event is recalled.

- **Events/Effects**: When an event is accepted, instead of passing the event to the application, it should instead explicitly trigger an Application Effect. This will pass some or all of the data in the event and state to the application as a message.


## Model
Here we present an example use of Aranya in a toy protocol.

### User Command
Protocol specific commands will extend the User Command type. A User Command has an `author` which is a cryptographic signature asserting authorship. User Commands have exactly one `parent`.
```alloy
abstract sig UserCommand extends Command {
  author: one User,
} {
  one parent
}

fact {
  all ev: Command | eventually {
    one st: FactDB | st.event = ev
  }
}
```
### Protocol Commands
The protocol we are building is based on four user commands: add member, set role, delete user, and send message.
```alloy
fact {
  all st: FactDB | {
    init[st] after always {
      stutter[st]
      || merge[st]
      || addMember[st]
      || setRole[st]
      || deleteUser[st]
      || sendMessage[st]
    }
  }
}

fact {
  all st: FactDB | eventually {
    always stutter[st]
  }
}

pred ignore[st: one FactDB] {
  st.facts' = st.facts
}
```
The facts in our system use users as keys, and their roles as values.
```alloy
one sig RolePath extends Path {}

sig User extends Key {}

abstract sig Role extends Value {}

one sig Owner  extends Role {}
one sig Admin  extends Role {}
one sig Member extends Role {}

pred subordinateRole[ higher: one Role, lower: one Role] {
    (higher = Owner && lower = Admin )
  ||(higher = Owner && lower = Member)
  ||(higher = Admin && lower = Member)
}
```

In our model we tie the priority of user events to the role of the author of the event.
```alloy
pred setDynamicPrority[st: one FactDB, ev: one UserCommand] {

  let role = st.facts[RolePath][ev.author] | {
    role = Owner implies {
      ev.priority = 3
    }  else role = Admin implies {
      ev.priority = 2
    } else role = Member implies {
      ev.priority = 1
    } else {
      ev.priority = 0
    }
  }

  no st.facts[RolePath][ev.author] implies
    ev.priority = 0
}
```
Our stutter command is used for time steps where nothing happens.
```alloy
pred stutter[st: one FactDB] {
  no st.event
  no st.event'
  ignore[st]
}
```

Show Init in example protocol.
```alloy
pred showInit[] {
  weave[Command]

  one u: User |
    Init.roles = u -> Owner
}

run showInit for 0 but
  1 Group,
  2 Command,
  2 Id,
  1 User,
  exactly 1 FactDB
```

The `AddMember` command is used to add a new member and can only be performed by roles greater then Member.
```alloy
sig AddMember extends UserCommand {
  member: one User,
} {
  one parent
}

pred addMember[st: one FactDB] {

  one ev: AddMember | {
    st.event = ev

    checkAddMember[st, ev] implies {
      st.facts'     = st.facts + RolePath -> ev.member -> Member

    } else ignore[st]
  }
}

pred checkAddMember[st: one FactDB, ev: one AddMember] {
  setDynamicPrority[st, ev]

  no st.facts[RolePath][ev.member]

  let ar = st.facts[RolePath][ev.author] |
    subordinateRole[ar, Member]
}

pred showAddMember[] {
  weave[Command]

  one u: User |
    Init.roles = u -> Owner

  eventually checkAddMember[FactDB, AddMember]
}

run showAddMember for 0 but 3..3 steps,
  1 Group,
  exactly 1 Init,
  exactly 1 AddMember,
  exactly 2 Id,
  2 User,
  exactly 1 FactDB
```

The `SetRole` command is used to change the role of a user. It is required that the affected user be the author or have a lower role than the affected user. Additionally, the new role must be at the same level or lower than the author's role.
```alloy
sig SetRole extends UserCommand {
  user: one User,
  role: one Role,
} {
  one parent
}

pred setRole[st: one FactDB] {
  one ev: SetRole | {
    st.event = ev

    checkSetRole[st, ev] implies {
      st.facts' = st.facts
        - RolePath -> ev.user -> st.facts[RolePath][ev.user]
        + RolePath -> ev.user -> ev.role

    } else ignore[st]
  }
}

pred checkSetRole[st: one FactDB, ev: one SetRole] {
  setDynamicPrority[st, ev]
  some st.facts[RolePath][ev.user]

  let ar = st.facts[RolePath][ev.author], ur = st.facts[RolePath][ev.user]| {
    subordinateRole[ar, ur] || ev.author = ev.user
    subordinateRole[ar, ev.role]
  }
}

pred showSetRole [] {
  weave[Command]

  one u: User | {
    Init.roles = u -> Owner

    AddMember.author = u
    AddMember.member != u

    SetRole.parent = AddMember
    SetRole.user   = AddMember.member
    SetRole.author = u
  }

  eventually checkSetRole[FactDB, SetRole]
}

run showSetRole for 0 but 4..4 steps,
  1 Group,
  exactly 1 Init,
  exactly 1 AddMember,
  exactly 1 SetRole,
  exactly 3 Id,
  2 User,
  exactly 1 FactDB
```

The `DeleteUser` command removes a user from the FactDB. The affected users must have a lower role than the author except for the case that the author removes themselves.
```alloy
sig DeleteUser extends UserCommand {
  user: one User,
} {
  one parent
}

pred deleteUser[st: one FactDB] {
  one ev: DeleteUser | {
    st.event = ev

    checkDeleteUser[st, ev] implies {
      st.facts' = st.facts
        - RolePath -> ev.user -> st.facts[RolePath][ev.user]

    } else ignore[st]
  }
}

pred checkDeleteUser[st: one FactDB, ev: one DeleteUser] {
  setDynamicPrority[st, ev]
  some st.facts[RolePath][ev.user]

  let ar = st.facts[RolePath][ev.author], ur = st.facts[RolePath][ev.user]|
    subordinateRole[ar, ur] || ev.author = ev.user
}

pred showDeleteUser [] {
  weave[Command]

  all i: Init | one u: User |
    i.roles = u -> Owner

	DeleteUser.author != DeleteUser.user
  DeleteUser.parent = AddMember

  eventually checkDeleteUser[FactDB, DeleteUser]
}

run showDeleteUser for 0 but 4..4 steps,
  1 Group,
  exactly 1 Init,
  exactly 1 AddMember,
  exactly 1 DeleteUser,
  exactly 3 Id,
  2 User,
  exactly 1 FactDB
```

The `SendMessage` command can be performed by any author that has a role in the FactDB
```alloy
sig SendMessage extends UserCommand {} {
  one parent
}

pred sendMessage[st: one FactDB] {
 one ev: SendMessage | {
    st.event = ev

    checkSendMessage[st, ev] implies {
      st.facts'     = st.facts
    } else ignore[st]
  }
}

pred checkSendMessage[st: one FactDB, ev: one SendMessage] {
  setDynamicPrority[st, ev]
  some st.facts[RolePath][ev.author]
}
```

Here we show an example of a merge between an `AddMember` and a `SetRole` event.
```alloy
pred showMerge [] {
  weave[Command]

  one u: User | {
    Init.roles = u -> Owner
    AddMember.parent = Init
    AddMember.author = u
    AddMember.member != u
    SetRole.parent = Init
    SetRole.author = u
    Merge.parent = AddMember + SetRole
    eventually {
      FactDB.event = AddMember
      checkAddMember[FactDB, AddMember]
    }
    eventually {
      FactDB.event = SetRole
      checkSetRole[FactDB, SetRole]
    }

  }
}

run showMerge for 0 but 5..5 steps,
  1 Group,
  exactly 1 Init,
  exactly 1 AddMember,
  exactly 1 SetRole,
  exactly 1 Merge,
  exactly 4 Id,
  2 User,
  exactly 1 FactDB
```

Here we show an example `DeleteUser` merging before `AddMember`.
```alloy
pred showAdversialMerge1 [] {
  weave[Command]

  one disj u1, u2: User |
    Init.roles = u1 -> Owner
      + u2 -> Admin

  one add2: AddMember, del1: DeleteUser, m: Merge | {

    add2.parent = Init
    add2.author = Init.roles.Admin
    add2.member not in Init.roles.univ

    eventually {
      FactDB.event = del1
      checkDeleteUser[FactDB, del1]
    }

    del1.parent = Init
    del1.author = Init.roles.Owner
    del1.user   = add2.author

    m.parent = del1 + add2
  }
}

run showAdversialMerge1 for 0 but 5..5 steps,
  1 Group,
  exactly 1 Init,
  exactly 1 AddMember,
  exactly 1 DeleteUser,
  exactly 1 Merge,
  exactly 4 Id,
  exactly 3 User,
  exactly 1 FactDB
```




<!---
Example of backwards merge:

```
A[0] - C[2]
           \
            M
           /
B[1] - D[0]


A - C - B - D - M
```


Example to consider forward merge:
```
AddUser(x)[0] - y.SendMessage[1]
                                 \
                                  M
                                 /
RemoveUser(x)[3] - y.SendMessage[0]

AddUser(x) - y.SendMessage - RemoveUser(x) - y.SendMessage
```
--->
