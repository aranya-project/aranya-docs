---
layout: page
title: Aranya Policy Writing Guide
permalink: "/policy-writing-guide/"
---

# Aranya Policy Writing Guide

A comprehensive guide to understanding Aranya as a distributed system and writing effective policies.

**Table of Contents**

- [Introduction](#introduction)
- [Understanding Aranya](#understanding-aranya)
  - [What is Aranya?](#what-is-aranya)
  - [Core Architecture](#core-architecture)
  - [Control Plane vs Data Plane](#control-plane-vs-data-plane)
  - [The Directed Acyclic Graph (DAG)](#the-directed-acyclic-graph-dag)
  - [The Braid Algorithm](#the-braid-algorithm)
  - [Execution Model: Actions vs Commands](#execution-model-actions-vs-commands)
- [Policy Language Fundamentals](#policy-language-fundamentals)
  - [File Format](#file-format)
  - [Basic Syntax](#basic-syntax)
  - [Types](#types)
  - [Named Values](#named-values)
- [Core Policy Concepts](#core-policy-concepts)
  - [Actions](#actions)
  - [Commands](#commands)
  - [Facts](#facts)
  - [Effects](#effects)
- [Writing Policy Code](#writing-policy-code)
  - [Declaring Facts](#declaring-facts)
  - [Creating Commands](#creating-commands)
  - [Working with Actions](#working-with-actions)
  - [Emitting Effects](#emitting-effects)
  - [Querying the Fact Database](#querying-the-fact-database)
- [Advanced Topics](#advanced-topics)
  - [Error Handling](#error-handling)
  - [Command Priorities and Ordering](#command-priorities-and-ordering)
  - [Seal and Open Blocks](#seal-and-open-blocks)
  - [Recall Blocks](#recall-blocks)
  - [Foreign Function Interface (FFI)](#foreign-function-interface-ffi)
- [Best Practices](#best-practices)
- [Complete Example: Access Control System](#complete-example-access-control-system)

---

## Introduction

This guide provides a comprehensive overview of writing policies for Aranya, a decentralized peer-to-peer platform for secure data exchange and access governance. Policies define the rules that govern how devices interact, what operations are permitted, and how state changes are validated across the distributed network.

Understanding how to write effective policies is essential for leveraging Aranya's capabilities for:
- Access control and authorization
- Secure peer-to-peer communication
- Data segmentation and key management
- Audit logging and accountability

---

## Understanding Aranya

### What is Aranya?

Aranya is a decentralized, peer-to-peer platform that provides:

1. **Access Governance**: A fully customizable authority model that controls access to resources
2. **Secure Data Exchange**: End-to-end encrypted communication between endpoints
3. **Resilient Operations**: Designed to work in disconnected, disrupted, and denied (D3) environments

Key characteristics:
- **Lightweight**: <1.5 MB binary and <1.5 MB RAM
- **Hardware Agnostic**: Runs on Linux (ARM/ARM64/AMD64), macOS (ARM64), and embedded devices
- **Link Agnostic**: Works with any transport protocol
- **100% Rust**: Built with safety-first principles

### Core Terminology

| Term | Definition |
|------|------------|
| **Endpoint** | Hardware or software where Aranya is integrated |
| **Instance** | A single deployment of Aranya software |
| **Device** | An instance with assigned cryptographic keys for identity |
| **Policy** | Defines accepted actions and corresponding commands |

### Core Architecture

Aranya separates functionality into two planes:

```
┌─────────────────────────────────────────────────────────────────┐
│                         ARANYA SYSTEM                          │
├─────────────────────────────────┬───────────────────────────────┤
│         CONTROL PLANE           │          DATA PLANE           │
│  (On-Graph Components)          │   (Off-Graph Components)      │
├─────────────────────────────────┼───────────────────────────────┤
│  • Policy Engine                │  • Aranya Fast Channels (AFC) │
│  • Crypto Module                │  • Shared Local Memory        │
│  • Virtual Machine (VM)         │  • Channel Crypto Module      │
│  • Aranya Runtime               │  • Channel Transport API      │
│  • DAG Storage                  │                               │
│  • Fact Database                │                               │
│  • Sync Transport API           │                               │
│  • Actions/Effects API          │                               │
└─────────────────────────────────┴───────────────────────────────┘
```

### Control Plane vs Data Plane

#### Control Plane (On-Graph)
The control plane handles administrative functionality for access control operations:
- Manages and enforces the authority model
- Validates operations according to cryptographic credentials
- Stores commands in an immutable, verifiable DAG
- Broadcasts commands to all endpoints via sync protocol

**Characteristics:**
- Low throughput (~100s of messages/second)
- Higher latency due to graph operations
- Highly resilient with eventual delivery
- Uses asymmetric key authorization

#### Data Plane (Off-Graph)
The data plane provides high-throughput secure data exchange:
- End-to-end encryption between endpoints
- Low latency, high throughput communication
- Point-to-point channels governed by policy

**Characteristics:**
- High throughput (limited only by transport)
- Low latency
- Automatic message encryption
- Uses symmetric key authorization

### The Directed Acyclic Graph (DAG)

The DAG is the heart of Aranya's state management. It's a decentralized record of all commands, replicated across all endpoints.

```
Simple linear graph:
    A ← B ← C ← D

Branched graph (after parallel operations):
    A ← B ← C
         ↖
           D ← E (merge)
         ↗
        F

After merge, E joins branches C and F
```

Key properties:
- **Immutable**: Once added, commands cannot be modified
- **Verifiable**: Cryptographic signatures ensure authenticity
- **Eventually Consistent**: All endpoints converge to the same state
- **Branch-tolerant**: Handles disconnected operations gracefully

### The Braid Algorithm

When the graph has branches (from parallel operations on disconnected devices), Aranya needs to determine the order of command execution. The **braid function** deterministically flattens the DAG into a linear sequence.

```
Branched Graph:           Braided (flattened):
    A ← B ← C             A ← B ← C ← D ← E
         ↖
           E (merge)      or
         ↗
        D                 A ← B ← D ← C ← E
```

The ordering can be influenced by setting **priority** attributes on commands:

```policy
command HighPriorityCmd {
    attributes {
        priority: 10,  // Higher priority = ordered first
    }
    ...
}
```

### Execution Model: Actions vs Commands

Understanding when and where code executes is **critical** for writing correct policies, especially when dealing with cryptography, random number generation, or other nondeterministic operations.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          EXECUTION MODEL                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  CALLER'S DEVICE (executes ONCE)         ALL RECEIVING DEVICES (each node) │
│  ════════════════════════════════         ═══════════════════════════════  │
│                                                                             │
│  ┌─────────────────────────┐              ┌─────────────────────────┐      │
│  │       ACTION            │              │    COMMAND POLICY       │      │
│  │  • Runs once locally    │   sync       │  • Re-evaluated on      │      │
│  │  • Can use FFI freely   │ ─────────▶   │    EVERY node           │      │
│  │  • Nondeterminism OK    │              │  • Must be deterministic│      │
│  │  • Publishes commands   │              │  • FFI must be pure     │      │
│  └───────────┬─────────────┘              └─────────────────────────┘      │
│              │                                                              │
│              ▼                                                              │
│  ┌─────────────────────────┐              ┌─────────────────────────┐      │
│  │       SEAL BLOCK        │              │      OPEN BLOCK         │      │
│  │  • Runs once locally    │   wire       │  • Runs on each node    │      │
│  │  • Encrypt here         │ ─────────▶   │  • Decrypt here         │      │
│  │  • Sign here            │   format     │  • Verify here          │      │
│  └─────────────────────────┘              └─────────────────────────┘      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Key Principles

1. **Actions execute once** on the caller's device when the application invokes them
2. **Command `policy` blocks are re-evaluated** on every device that receives the command via sync
3. **`seal` blocks execute once** on the publishing device (use for encryption, signing)
4. **`open` blocks execute on every receiving device** (use for decryption, verification)

#### Why This Matters

**Encryption must happen in `seal`, not `policy`:**
```policy
// CORRECT: Encryption in seal (runs once on sender)
command SecureMessage {
    fields {
        recipient id,
        plaintext bytes,
    }

    seal {
        // This runs ONCE on the sender's device
        let encrypted = crypto::encrypt(this.plaintext, this.recipient)
        return envelope::new(encrypted)
    }

    open {
        // This runs on EACH receiving device
        let decrypted = crypto::decrypt(envelope::payload(envelope))
        return deserialize(decrypted)
    }

    policy {
        // Policy runs on EVERY device - no encryption here!
        check this.recipient != envelope::author_id(envelope)
        finish { ... }
    }
}
```

**Nondeterministic operations must be in actions:**
```policy
// CORRECT: Random ID generated in action (runs once)
action createResource(name string) {
    let resourceId = crypto::random_id()  // Nondeterministic - OK in action
    publish CreateResource {
        resourceId: resourceId,
        name: name,
    }
}

// WRONG: Random in policy would give different results on each node!
command BadCommand {
    policy {
        let id = crypto::random_id()  // WRONG! Different on each device!
        ...
    }
}
```

**FFI calls in policy must be deterministic:**
```policy
command ProcessData {
    policy {
        // OK: Deterministic FFI (same input = same output)
        let hash = crypto::hash(this.data)
        let valid = crypto::verify(this.signature, this.data)

        // NOT OK: Nondeterministic FFI
        // let timestamp = time::now()      // Different on each device!
        // let random = crypto::random()    // Different on each device!

        finish { ... }
    }
}
```

#### Summary Table

| Block/Context | Executes | Can Use Nondeterministic FFI | Use For |
|---------------|----------|------------------------------|---------|
| Action body | Once (caller) | Yes | Validation, random IDs, timestamps |
| `seal` block | Once (publisher) | Yes | Encryption, signing |
| `open` block | Each node | No (must verify deterministically) | Decryption, signature verification |
| `policy` block | Each node | No (must be deterministic) | Authorization checks, state updates |
| `recall` block | Each node | No (must be deterministic) | Cleanup, error notifications |

---

## Policy Language Fundamentals

### File Format

Policy files are Markdown documents with YAML front matter. This allows policies to be self-documenting with explanatory text alongside code.

```markdown
---
policy-version: 2
---

# My Policy

This section explains the policy purpose.

```policy
// Only code in policy-tagged blocks is parsed
fact Example[key id]=>{value int}
```

More explanatory text here...
```

**Requirements:**
- Front matter must be at the start of the document
- `policy-version` must be specified (currently `1` or `2`)
- Only code blocks marked with `policy` info-string are parsed

### Basic Syntax

#### Whitespace
Whitespace (spaces, tabs, newlines) is not significant.

#### Comments
```policy
// Line comment

/* Block comment
   spanning multiple lines */
```

#### Reserved Words
Cannot be used as identifiers:
- Types: `int`, `string`, `bytes`, `bool`, `id`, `optional`, `struct`, `enum`
- Declarations: `command`, `action`, `effect`, `fact`, `function`
- Statements: `check`, `let`, `publish`, `emit`, `create`, `update`, `delete`, `map`, `return`
- Expressions: `query`, `if`, `match`, `exists`, `unwrap`

### Types

#### Basic Types

| Type | Description | Example |
|------|-------------|---------|
| `int` | 64-bit signed integer | `42`, `-7` |
| `string` | UTF-8 encoded string | `"hello"`, `"line\n"` |
| `bytes` | Arbitrary byte sequence | (no literal) |
| `bool` | Boolean value | `true`, `false` |
| `id` | Opaque object identifier | (no literal) |

#### Optional Type

Optional values can contain a value (`Some`) or be empty (`None`):

```policy
let player1 = Some "George"
let player2 = None

// Access inner value (will error if None)
let winner = unwrap player1

// Check if optional has value
if player1 is Some {
    // ...
}
```

#### Structs

Named collections of fields:

```policy
struct Person {
    name string,
    age int,
    active bool,
}

// Struct literal
let p = Person {
    name: "Alice",
    age: 30,
    active: true,
}

// Field access
let n = p.name
```

#### Enumerations

Sets of unique identifiers:

```policy
enum Status {
    Pending,
    Approved,
    Rejected,
}

// Enumeration literal
let s = Status::Approved

// Match on enum
match s {
    Status::Pending => { /* ... */ }
    Status::Approved => { /* ... */ }
    Status::Rejected => { /* ... */ }
}
```

### Named Values

The policy language uses **static single assignment** - values are defined once and cannot be mutated:

```policy
let x = 3
let x = 4     // Error: cannot redefine x
let y = x + 1 // OK: y = 4
```

#### Automatically Defined Values

| Context | Name | Type | Description |
|---------|------|------|-------------|
| `policy`, `recall`, `seal` | `this` | `struct CommandName` | Command fields |
| `policy`, `recall`, `open` | `envelope` | opaque | Command envelope |

---

## Core Policy Concepts

Policies are built from four interconnected concepts:

```
┌─────────────┐     publishes      ┌─────────────┐
│   ACTION    │ ─────────────────▶ │   COMMAND   │
│ (entry pt)  │                    │ (operation) │
└─────────────┘                    └──────┬──────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
                    ▼                     ▼                     ▼
            ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
            │    FACT     │       │    FACT     │       │   EFFECT    │
            │  (create)   │       │  (update)   │       │   (emit)    │
            └─────────────┘       └─────────────┘       └─────────────┘
```

### Actions

Actions are the **application's entry point** into the policy. They are callable functions that perform data transformations and publish commands.

**Critical: Actions execute exactly once on the caller's device.** This makes them the appropriate place for nondeterministic operations like generating random IDs, getting timestamps, or performing encryption that should only happen once.

```policy
action enrollUser(userId id, name string) {
    // Validation logic - runs once on caller's device
    check name != ""

    // Nondeterministic operations are safe here
    let enrollmentId = crypto::random_id()
    let timestamp = time::now()

    // Publish a command (command policy will be re-evaluated on all nodes)
    let cmd = EnrollUser {
        enrollmentId: enrollmentId,
        userId: userId,
        name: name,
        timestamp: timestamp,
    }
    publish cmd
}
```

**Key characteristics:**
- **Execute once** on the caller's device only
- Called by the application through the API
- Can publish zero or more commands
- Execute atomically - all succeed or all fail
- Cannot return values to the application (use effects instead)
- **Safe for nondeterministic FFI** (random, timestamps, encryption)

### Commands

Commands are the **core functional unit**. They define:
- Structured data (`fields`)
- Serialization rules (`seal`/`open`)
- Validation and state changes (`policy`)
- Error recovery (`recall`)

**Critical: Command `policy` blocks are re-evaluated on EVERY node** that receives the command via sync. This means:
- Policy blocks must be **deterministic** - same inputs must produce same outputs
- **Never use nondeterministic FFI** in policy blocks (no random, no timestamps)
- Encryption/decryption should happen in `seal`/`open`, not `policy`

```policy
command EnrollUser {
    fields {
        // Data from the action - already contains any random/time values
        enrollmentId id,
        userId id,
        name string,
        timestamp int,
    }

    seal {
        // Runs ONCE on the publishing device
        let bytes = serialize(this)
        return envelope::new(bytes)
    }

    open {
        // Runs on EACH receiving device
        let fields = deserialize(envelope::payload(envelope))
        return fields
    }

    policy {
        // Runs on EVERY device - must be deterministic!
        // Uses data from fields (set by action), not generated here

        // Validate: user doesn't already exist
        check !exists User[userId: this.userId]

        finish {
            // Create the user fact
            create User[userId: this.userId]=>{
                name: this.name,
                enrolledAt: this.timestamp,  // Use timestamp from fields
            }

            // Notify application
            emit UserEnrolled {
                userId: this.userId,
                name: this.name,
            }
        }
    }

    recall {
        // Also runs on every device when command is recalled
        finish {
            emit EnrollmentFailed {
                userId: this.userId,
                reason: "User already exists or was revoked",
            }
        }
    }
}
```

### Facts

Facts are **key-value pairs** stored in the Fact Database. They represent the current state of the system.

```policy
// Syntax: fact Name[key fields]=>{value fields}
fact User[userId id]=>{name string, level int}
fact Permission[userId id, resource string]=>{}
immutable fact AuditLog[timestamp int, action string]=>{}
```

**Key vs Value:**
- **Key fields** (in `[]`): Used for lookups, must be unique
- **Value fields** (in `{}`): Data associated with the key

**Allowed types in facts:**

| Type | Key | Value |
|------|-----|-------|
| `int` | ✓ | ✓ |
| `string` | ✓ | ✓ |
| `bytes` | ✓ | ✓ |
| `bool` | ✓ | ✓ |
| `id` | ✓ | ✓ |
| `optional` | ✗ | ✓ |
| Struct | ✗ | ✓ |

### Effects

Effects are **structured data sent to the application**. They communicate changes and status from the policy.

```policy
effect UserEnrolled {
    userId id,
    name string,
}

effect OperationFailed {
    code int,
    message string,
}
```

Effects are emitted in `finish` blocks:
```policy
finish {
    emit UserEnrolled {
        userId: this.userId,
        name: this.name,
    }
}
```

---

## Writing Policy Code

### Declaring Facts

Define fact schemas before using them:

```policy
// Simple fact with key and value
fact Counter[name string]=>{count int}

// Fact with multiple key fields
fact Permission[userId id, resource string]=>{level int}

// Fact with only keys (set membership)
fact AdminUsers[userId id]=>{}

// Immutable fact (can only be created or deleted, never updated)
immutable fact AuditEntry[entryId id]=>{action string, timestamp int}
```

### Creating Commands

A complete command structure:

```policy
command IncrementCounter {
    // Optional: Control ordering in the braid
    attributes {
        priority: 5,
    }

    // Required: Define the data carried by this command
    fields {
        name string,
        amount int,
    }

    // Required: Convert fields to wire format
    seal {
        let bytes = serialize(this)
        return envelope::new(bytes)
    }

    // Required: Convert wire format to fields
    open {
        let fields = deserialize(envelope::payload(envelope))
        return fields
    }

    // Required: Validate and process the command
    policy {
        // Validation checks
        check this.amount > 0

        // Query current state
        let current = query Counter[name: this.name]

        if current is Some {
            // Update existing counter
            let c = unwrap current
            let newCount = c.count + this.amount

            finish {
                update Counter[name: this.name] to {count: newCount}
                emit CounterUpdated { name: this.name, count: newCount }
            }
        } else {
            // Create new counter
            finish {
                create Counter[name: this.name]=>{count: this.amount}
                emit CounterCreated { name: this.name, count: this.amount }
            }
        }
    }

    // Optional: Handle recalled commands
    recall {
        finish {
            emit CounterUpdateFailed { name: this.name }
        }
    }
}
```

### Working with Actions

Actions orchestrate command publishing:

```policy
// Simple action
action increment(name string) {
    publish IncrementCounter {
        name: name,
        amount: 1,
    }
}

// Action with validation
action transfer(from id, to id, amount int) {
    check amount > 0
    check from != to

    // Can query facts in actions
    let fromAccount = check_unwrap query Account[userId: from]
    check fromAccount.balance >= amount

    // Publish multiple commands
    publish Debit { userId: from, amount: amount }
    publish Credit { userId: to, amount: amount }
}

// Actions can call other actions
action initializeUser(userId id, name string, isAdmin bool) {
    action createUser(userId, name)

    if isAdmin {
        action grantAdmin(userId)
    }
}
```

### Emitting Effects

Effects communicate results to the application:

```policy
effect TransferComplete {
    from id,
    to id,
    amount int,
    newFromBalance int,
    newToBalance int,
}

effect TransferFailed {
    from id,
    to id,
    reason string,
}

command Transfer {
    fields {
        from id,
        to id,
        amount int,
    }

    policy {
        let fromAccount = check_unwrap query Account[userId: this.from]
        let toAccount = check_unwrap query Account[userId: this.to]

        if fromAccount.balance >= this.amount {
            let newFrom = fromAccount.balance - this.amount
            let newTo = toAccount.balance + this.amount

            finish {
                update Account[userId: this.from] to {balance: newFrom}
                update Account[userId: this.to] to {balance: newTo}
                emit TransferComplete {
                    from: this.from,
                    to: this.to,
                    amount: this.amount,
                    newFromBalance: newFrom,
                    newToBalance: newTo,
                }
            }
        } else {
            finish {
                emit TransferFailed {
                    from: this.from,
                    to: this.to,
                    reason: "Insufficient balance",
                }
            }
        }
    }
}
```

### Querying the Fact Database

#### Basic Query

```policy
// Returns optional struct with all fact fields
let result = query Account[userId: someId]

if result is Some {
    let account = unwrap result
    let balance = account.balance
}
```

#### Bind Markers

Use `?` to match any value in a key field:

```policy
// Find first account (any userId)
let anyAccount = query Account[userId: ?]

// Find first permission for a user (any resource)
let anyPerm = query Permission[userId: user, resource: ?]
```

**Important:** Bound fields (`?`) must be on the right side of concrete fields:

```policy
// OK - concrete fields on left
query Thing[a: 1, b: ?]
query Thing[a: ?, b: ?]

// NOT OK - bound field before concrete
query Thing[a: ?, b: 2]  // Error!
```

#### Counting Queries

```policy
// Check existence
check exists AdminUsers[userId: user]
check !exists BlockedUsers[userId: user]

// Count with bounds
let hasAdmins = at_least 1 AdminUsers[userId: ?]
let notTooMany = at_most 10 AdminUsers[userId: ?]
let exactlyOne = exactly 1 Owner[teamId: team, userId: ?]

// Get actual count (up to limit)
let adminCount = count_up_to 100 AdminUsers[userId: ?]
```

#### Iterating with Map

In actions, use `map` to iterate over matching facts:

```policy
action notifyAllAdmins(message string) {
    map AdminUsers[userId: ?] as admin {
        publish SendNotification {
            recipient: admin.userId,
            message: message,
        }
    }
}
```

---

## Advanced Topics

### Error Handling

Policy execution can terminate with two types of errors:

#### Check Failures

Caused by `check` or `check_unwrap` failing. These trigger the `recall` block:

```policy
// check statement
check balance >= 0  // Fails if balance is negative

// check_unwrap expression
let user = check_unwrap query User[userId: id]  // Fails if user doesn't exist
```

#### Runtime Exceptions

Caused by execution invariants being violated:

- `unwrap` on `None`
- Integer overflow/underflow
- Creating a fact that already exists
- Updating/deleting a non-existent fact
- Memory exhaustion

Runtime exceptions **do not** trigger `recall` blocks.

#### Best Practice: Use check_unwrap

```policy
// Good: check_unwrap triggers recall block
let user = check_unwrap query User[userId: id]

// Risky: unwrap causes runtime exception (no recall)
let user = unwrap query User[userId: id]
```

### Command Priorities and Ordering

Control how commands are ordered when the graph branches:

```policy
command HighPriorityCommand {
    attributes {
        priority: 100,  // Higher = processed first
    }
    ...
}

command LowPriorityCommand {
    attributes {
        priority: 1,
    }
    ...
}
```

**Use cases:**
- **Optimistic**: Give "add" commands higher priority than "remove" commands
- **Pessimistic**: Give "revoke" commands higher priority than "grant" commands

### Seal and Open Blocks

These blocks handle serialization between command fields and the wire format. Understanding their execution model is critical for security:

- **`seal`**: Executes **once** on the publishing device when the command is created
- **`open`**: Executes on **every device** that receives the command via sync

This asymmetry is intentional and enables secure encryption patterns:

```policy
command SecureCommand {
    fields {
        recipient id,
        secretData bytes,
    }

    seal {
        // RUNS ONCE on sender's device
        // Safe for encryption, signing, and nondeterministic operations

        // Encrypt the sensitive data (uses recipient's public key)
        let encrypted = crypto::encrypt(this.secretData, this.recipient)

        // Sign the envelope (may use random nonce internally)
        let sig = crypto::sign(encrypted)

        return envelope::new_signed(encrypted, sig)
    }

    open {
        // RUNS ON EVERY RECEIVING DEVICE
        // Must successfully decrypt/verify or command is rejected

        // Verify signature first (deterministic)
        let valid = crypto::verify(
            envelope::payload(envelope),
            envelope::signature(envelope),
            envelope::author_id(envelope)
        )
        check valid

        // Decrypt the data (deterministic given same ciphertext + key)
        let decrypted = crypto::decrypt(envelope::payload(envelope))

        return deserialize(decrypted)
    }

    policy {
        // RUNS ON EVERY DEVICE after open succeeds
        // this.secretData is now the decrypted plaintext
        // ... authorization checks here ...
    }
}
```

**Why this pattern works:**
1. Sender encrypts in `seal` (runs once, can use random nonces)
2. Each receiver decrypts in `open` (deterministic given the ciphertext)
3. Policy evaluates the decrypted data (deterministic checks)

### Recall Blocks

Recall blocks handle commands that fail validation after being initially accepted (due to concurrent operations on other devices):

```policy
command GrantPermission {
    fields {
        userId id,
        resource string,
        level int,
    }

    policy {
        // Check granter is admin
        let granter = envelope::author_id(envelope)
        check_unwrap query AdminUsers[userId: granter]

        finish {
            create Permission[userId: this.userId, resource: this.resource]=>{level: this.level}
            emit PermissionGranted { userId: this.userId, resource: this.resource }
        }
    }

    recall {
        // Called if this command is recalled (e.g., granter lost admin rights)
        finish {
            // Clean up if needed
            delete Permission[userId: this.userId, resource: this.resource]

            // Notify application
            emit PermissionRevoked {
                userId: this.userId,
                resource: this.resource,
                reason: "Granter authorization was revoked",
            }
        }
    }
}
```

### Foreign Function Interface (FFI)

Import external function libraries for cryptography, envelope handling, etc.:

```policy
use crypto
use envelope
use device
```

**Critical: FFI usage depends on execution context.** Because command `policy` blocks are re-evaluated on every node, FFI calls in policy must be deterministic (same inputs = same outputs).

#### FFI in Different Contexts

**In Actions (runs once - nondeterministic OK):**
```policy
action createSecureResource(name string) {
    // These are safe in actions - they run once on the caller
    let resourceId = crypto::random_id()
    let timestamp = time::now()
    let nonce = crypto::random_bytes(32)

    publish CreateResource {
        resourceId: resourceId,
        name: name,
        timestamp: timestamp,
        nonce: nonce,
    }
}
```

**In Seal Blocks (runs once - nondeterministic OK):**
```policy
command EncryptedMessage {
    fields {
        recipient id,
        message bytes,
    }

    seal {
        // Safe: seal runs once on the sender
        let encrypted = crypto::encrypt(this.message, this.recipient)
        let signature = crypto::sign(encrypted)
        return envelope::new_signed(encrypted, signature)
    }

    open {
        // Decryption is deterministic given the same ciphertext and key
        let encrypted = envelope::payload(envelope)
        let decrypted = crypto::decrypt(encrypted)
        return deserialize(decrypted)
    }

    policy { ... }
}
```

**In Policy Blocks (runs on every node - MUST be deterministic):**
```policy
command VerifyData {
    fields {
        data bytes,
        signature bytes,
        expectedHash bytes,
    }

    policy {
        // SAFE: Deterministic operations
        let author = envelope::author_id(envelope)
        let computedHash = crypto::hash(this.data)
        let validSig = crypto::verify(this.signature, this.data, author)

        check computedHash == this.expectedHash
        check validSig

        // UNSAFE - DO NOT DO THIS:
        // let timestamp = time::now()       // Different on each device!
        // let random = crypto::random()     // Different on each device!
        // let newId = crypto::random_id()   // Different on each device!

        finish { ... }
    }
}
```

#### FFI Determinism Summary

| FFI Category | Example Functions | Safe in Action | Safe in Seal | Safe in Policy |
|--------------|-------------------|----------------|--------------|----------------|
| Random | `random()`, `random_id()`, `random_bytes()` | ✓ | ✓ | ✗ |
| Time | `now()`, `timestamp()` | ✓ | ✓ | ✗ |
| Encryption | `encrypt()` | ✓ | ✓ | ✗ (nonce generation) |
| Decryption | `decrypt()` | ✓ | ✓ | ✓ (deterministic) |
| Hashing | `hash()`, `hmac()` | ✓ | ✓ | ✓ |
| Signing | `sign()` | ✓ | ✓ | ✗ (may use random) |
| Verification | `verify()` | ✓ | ✓ | ✓ |
| Envelope | `author_id()`, `payload()` | ✓ | ✓ | ✓ |

---

## Best Practices

### 1. Design Facts as Indexes

If you need to query by multiple fields, create multiple facts:

```policy
// Query users by ID
fact UserById[userId id]=>{name string, email string}

// Query users by email (for lookups)
fact UserByEmail[email string]=>{userId id}

// Keep both in sync in your commands
finish {
    create UserById[userId: id]=>{name: n, email: e}
    create UserByEmail[email: e]=>{userId: id}
}
```

### 2. Use Immutable Facts for Audit Logs

```policy
immutable fact AuditLog[timestamp int, commandId id]=>{
    action string,
    actor id,
    details string,
}
```

### 3. Prefer check_unwrap Over unwrap

```policy
// Better: allows recall handling
let user = check_unwrap query User[id: userId]

// Worse: runtime exception, no recovery
let user = unwrap query User[id: userId]
```

### 4. Validate Early in Policy Blocks

```policy
policy {
    // Validate inputs first
    check this.amount > 0
    check this.name != ""

    // Check authorization
    let author = envelope::author_id(envelope)
    check_unwrap query Authorized[userId: author]

    // Then do the work
    let current = query Counter[name: this.name]
    ...
}
```

### 5. Keep Actions and Effects as the Public API

```policy
// Actions and effects are the public interface
action createTeam(name string, ownerId id) { ... }
effect TeamCreated { teamId id, name string }

// Commands are implementation details
command InternalCreateTeam { ... }  // Can change without affecting app
```

### 6. Use Struct Field Insertion for Shared Fields

```policy
struct CommonFields {
    timestamp int,
    author id,
}

command CommandA {
    fields {
        +CommonFields,
        specificField string,
    }
}

command CommandB {
    fields {
        +CommonFields,
        otherField int,
    }
}
```

### 7. Set Appropriate Command Priorities

Consider the semantics of concurrent operations:

```policy
// Revocations should take priority (pessimistic security)
command RevokeAccess {
    attributes { priority: 100 }
    ...
}

command GrantAccess {
    attributes { priority: 50 }
    ...
}
```

### 8. Generate Nondeterministic Values in Actions

Move all random IDs, timestamps, and nonces to actions:

```policy
// GOOD: Nondeterministic values generated in action
action createDocument(title string, content bytes) {
    let docId = crypto::random_id()
    let createdAt = time::now()

    publish CreateDocument {
        docId: docId,
        title: title,
        content: content,
        createdAt: createdAt,
    }
}

// BAD: Generating in policy causes different values on each node
command BadCreateDocument {
    policy {
        let docId = crypto::random_id()  // WRONG!
        ...
    }
}
```

### 9. Encrypt in Seal, Not in Actions or Policy

Encryption should happen in `seal` to keep plaintext out of command fields:

```policy
// GOOD: Encrypt in seal block
command SecureMessage {
    fields {
        recipient id,
        plaintext bytes,  // Will be encrypted before transmission
    }

    seal {
        let ciphertext = crypto::encrypt(this.plaintext, this.recipient)
        return envelope::new(ciphertext)
    }

    open {
        let plaintext = crypto::decrypt(envelope::payload(envelope))
        return Message { recipient: ..., plaintext: plaintext }
    }
}

// BAD: Encrypting in action exposes to all nodes
action badSendMessage(recipient id, message bytes) {
    let encrypted = crypto::encrypt(message, recipient)  // Less secure pattern
    publish Message { data: encrypted }
}
```

### 10. Keep Policy Blocks Deterministic

Always ask: "If this command runs on 100 different devices, will they all produce the same result?"

```policy
command DeterministicExample {
    fields {
        userId id,
        amount int,
        timestamp int,  // Passed from action, not generated here
    }

    policy {
        // DETERMINISTIC: These produce same results on all nodes
        let author = envelope::author_id(envelope)
        let user = check_unwrap query User[id: this.userId]
        let hash = crypto::hash(serialize(this))

        check user.balance >= this.amount
        check author == this.userId

        finish {
            update User[id: this.userId] to {
                balance: user.balance - this.amount,
                lastTransaction: this.timestamp,  // From fields, not time::now()
            }
        }
    }
}
```

---

## Complete Example: Access Control System

Here's a complete policy implementing a role-based access control system:

```policy
---
policy-version: 2
---

# Role-Based Access Control Policy

This policy implements a role-based access control system with teams,
members, and permissions.

## Data Structures

```policy
// Roles in the system
enum Role {
    Owner,
    Admin,
    Member,
    Guest,
}

// Permission levels
enum PermissionLevel {
    None,
    Read,
    Write,
    Admin,
}

struct MemberInfo {
    userId id,
    role enum Role,
    addedBy id,
    addedAt int,
}
```

## Facts

```policy
// Team membership
fact TeamMember[teamId id, userId id]=>{
    role enum Role,
    addedBy id,
    addedAt int,
}

// Resource permissions
fact ResourcePermission[teamId id, resource string]=>{
    minRole enum Role,
    level enum PermissionLevel,
}

// Audit log
immutable fact TeamAuditLog[teamId id, timestamp int]=>{
    action string,
    actorId id,
    targetId optional id,
    details string,
}
```

## Effects

```policy
effect TeamCreated {
    teamId id,
    ownerId id,
}

effect MemberAdded {
    teamId id,
    userId id,
    role enum Role,
    addedBy id,
}

effect MemberRemoved {
    teamId id,
    userId id,
    removedBy id,
}

effect PermissionChanged {
    teamId id,
    resource string,
    newLevel enum PermissionLevel,
    changedBy id,
}

effect OperationDenied {
    teamId id,
    operation string,
    reason string,
}
```

## Helper Functions

```policy
// Check if user has at least the specified role
function hasRole(teamId id, userId id, requiredRole enum Role) bool {
    let member = query TeamMember[teamId: teamId, userId: userId]
    if member is None {
        return false
    }

    let m = unwrap member
    match requiredRole {
        Role::Owner => return m.role == Role::Owner,
        Role::Admin => return m.role == Role::Owner || m.role == Role::Admin,
        Role::Member => return m.role != Role::Guest,
        Role::Guest => return true,
    }
}

// Role comparison for permission checks
function roleAtLeast(actual enum Role, required enum Role) bool {
    match required {
        Role::Owner => return actual == Role::Owner,
        Role::Admin => return actual == Role::Owner || actual == Role::Admin,
        Role::Member => return actual != Role::Guest,
        Role::Guest => return true,
    }
}
```

## Commands

```policy
command CreateTeam {
    attributes { priority: 10 }

    fields {
        teamId id,
        ownerId id,
        timestamp int,
    }

    seal {
        return envelope::new(serialize(this))
    }

    open {
        return deserialize(envelope::payload(envelope))
    }

    policy {
        // Verify the creator is creating for themselves
        let author = envelope::author_id(envelope)
        check author == this.ownerId

        // Ensure team doesn't already have an owner
        check !exists TeamMember[teamId: this.teamId, userId: ?]

        finish {
            create TeamMember[teamId: this.teamId, userId: this.ownerId]=>{
                role: Role::Owner,
                addedBy: this.ownerId,
                addedAt: this.timestamp,
            }

            create TeamAuditLog[teamId: this.teamId, timestamp: this.timestamp]=>{
                action: "team_created",
                actorId: this.ownerId,
                targetId: None,
                details: "Team created",
            }

            emit TeamCreated {
                teamId: this.teamId,
                ownerId: this.ownerId,
            }
        }
    }
}

command AddMember {
    attributes { priority: 50 }

    fields {
        teamId id,
        userId id,
        role enum Role,
        timestamp int,
    }

    seal {
        return envelope::new(serialize(this))
    }

    open {
        return deserialize(envelope::payload(envelope))
    }

    policy {
        let author = envelope::author_id(envelope)

        // Cannot add as owner
        check this.role != Role::Owner

        // User must not already be a member
        check !exists TeamMember[teamId: this.teamId, userId: this.userId]

        // Author must be at least admin
        let authorMember = check_unwrap query TeamMember[teamId: this.teamId, userId: author]
        check roleAtLeast(authorMember.role, Role::Admin)

        // Admins cannot add other admins (only owners can)
        if this.role == Role::Admin {
            check authorMember.role == Role::Owner
        }

        finish {
            create TeamMember[teamId: this.teamId, userId: this.userId]=>{
                role: this.role,
                addedBy: author,
                addedAt: this.timestamp,
            }

            create TeamAuditLog[teamId: this.teamId, timestamp: this.timestamp]=>{
                action: "member_added",
                actorId: author,
                targetId: Some this.userId,
                details: "Member added",
            }

            emit MemberAdded {
                teamId: this.teamId,
                userId: this.userId,
                role: this.role,
                addedBy: author,
            }
        }
    }

    recall {
        finish {
            emit OperationDenied {
                teamId: this.teamId,
                operation: "add_member",
                reason: "Authorization revoked",
            }
        }
    }
}

command RemoveMember {
    attributes { priority: 100 }  // High priority for security

    fields {
        teamId id,
        userId id,
        timestamp int,
    }

    seal {
        return envelope::new(serialize(this))
    }

    open {
        return deserialize(envelope::payload(envelope))
    }

    policy {
        let author = envelope::author_id(envelope)

        // Member must exist
        let targetMember = check_unwrap query TeamMember[teamId: this.teamId, userId: this.userId]

        // Cannot remove the owner
        check targetMember.role != Role::Owner

        // Author must be admin or higher, or removing themselves
        if author != this.userId {
            let authorMember = check_unwrap query TeamMember[teamId: this.teamId, userId: author]
            check roleAtLeast(authorMember.role, Role::Admin)

            // Only owner can remove admins
            if targetMember.role == Role::Admin {
                check authorMember.role == Role::Owner
            }
        }

        finish {
            delete TeamMember[teamId: this.teamId, userId: this.userId]

            create TeamAuditLog[teamId: this.teamId, timestamp: this.timestamp]=>{
                action: "member_removed",
                actorId: author,
                targetId: Some this.userId,
                details: "Member removed",
            }

            emit MemberRemoved {
                teamId: this.teamId,
                userId: this.userId,
                removedBy: author,
            }
        }
    }
}
```

## Actions

```policy
action createTeam(teamId id, timestamp int) {
    let owner = device::current_device_id()
    publish CreateTeam {
        teamId: teamId,
        ownerId: owner,
        timestamp: timestamp,
    }
}

action addMember(teamId id, userId id, role enum Role, timestamp int) {
    publish AddMember {
        teamId: teamId,
        userId: userId,
        role: role,
        timestamp: timestamp,
    }
}

action removeMember(teamId id, userId id, timestamp int) {
    publish RemoveMember {
        teamId: teamId,
        userId: userId,
        timestamp: timestamp,
    }
}

action leaveTeam(teamId id, timestamp int) {
    let me = device::current_device_id()
    publish RemoveMember {
        teamId: teamId,
        userId: me,
        timestamp: timestamp,
    }
}
```

---

## Summary

Writing effective Aranya policies requires understanding:

1. **The distributed nature** of Aranya - commands propagate asynchronously and the graph can branch
2. **The execution model** - actions run once locally; command policy blocks are re-evaluated on every node
3. **Determinism requirements** - policy blocks must be deterministic; use actions for random/time operations
4. **The braid algorithm** - how concurrent commands are ordered and how priorities affect this
5. **Seal/Open for cryptography** - encrypt in `seal` (runs once), decrypt in `open` (runs on each node)
6. **Facts as state** - the fact database represents current system state, built from command execution
7. **Actions as entry points** - the public API your application calls (safe for nondeterministic FFI)
8. **Effects as output** - how the policy communicates results back to your application
9. **Error handling** - the difference between check failures (recoverable) and runtime exceptions

### Quick Reference: Where to Put Operations

| Operation | Where | Why |
|-----------|-------|-----|
| Generate random ID | Action | Runs once, deterministic result stored in command |
| Get current timestamp | Action | Runs once, timestamp stored in command fields |
| Encrypt data | `seal` block | Runs once on sender, ciphertext transmitted |
| Decrypt data | `open` block | Each receiver decrypts deterministically |
| Sign data | `seal` block | Signing may use random nonce |
| Verify signature | `open` or `policy` | Verification is deterministic |
| Authorization checks | `policy` block | Re-evaluated on each node for consistency |
| State updates | `finish` block | Deterministic fact mutations |

By following the patterns and best practices in this guide, you can build robust, secure policies for decentralized access control and data exchange.
