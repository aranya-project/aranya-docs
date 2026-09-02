---
layout: page
title: "Migrating Policies to aranya-core v2"
permalink: "/policy-migration-core-v2/"
---

# Migrating Policies to aranya-core v2

Migrating policy source and host Rust code from the `2026-07-09`
release (`25247720`, `aranya-core` 1.1.0) to the `2026-08-25`
release (`a14b8d64`, `aranya-core` 2.0.0).

| Crate                    | From   | To     |
| ------------------------ | ------ | ------ |
| `aranya-core`            | 1.1.0  | 2.0.0  |
| `aranya-policy-lang`     | 0.16.0 | 0.17.0 |
| `aranya-policy-ast`      | 0.15.0 | 0.16.0 |
| `aranya-policy-compiler` | 0.24.0 | 0.25.0 |
| `aranya-policy-module`   | 0.22.0 | 0.23.0 |
| `aranya-policy-vm`       | 0.23.0 | 0.24.0 |
| `aranya-policy-ifgen`    | 0.24.0 | 0.25.0 |
| `aranya-runtime`         | 0.24.0 | 0.25.0 |
| `aranya-*-ffi`           | 0.23.0 | 0.24.0 |

Every existing policy needs edits: at minimum every `check`
statement and every `seal`/`open` block. `policy-version: 2` is
unchanged and remains the only accepted value.

## Checklist

1. Add `else` to every `check`.
2. Replace `unwrap` / `check_unwrap` with `or` or `match`.
3. Rewrite `seal` and `open`; remove `serialize` / `deserialize`.
4. Wrap the key argument to `crypto::sign` / `crypto::verify` in
   `Some(...)`.
5. Add `recall` blocks for any `recall f()` you introduced.
6. Optionally declare `result[unit, E]` on actions that can fail.
7. Update Rust call sites for the renamed runtime errors.
8. Recompile and re-ship serialized `Module` artifacts.

## 1. `check` requires `else` ([#706])

```
check_statement = { "check" ~ expression ~ "else" ~ expression }
```

The `else` expression must have type `Never`. Otherwise the compiler
reports *check else must be terminal (e.g. `return`, `recall`)*.
Which terminal expression to use depends on the block:

- `policy` blocks are expected to trigger a recall on error, so they
  use `recall f()`. `recall` is only valid inside `policy` blocks.
- Functions and actions can return results, so they use
  `return Err(e)` (see section 4 for actions).
- `seal` and `open` fail through FFI failures rather than `check`
  (see section 3).
- `recall` blocks must be infallible.

To get a policy compiling quickly, write `else todo()` (and
`or todo()`, below) everywhere first, then replace each one. `todo()`
is only accepted when the compiler is in debug mode
(`Compiler::debug(true)`, default `cfg!(debug_assertions)`); a
release-mode compile fails with `DebugModeRequired` until they are
gone.

```policy
// before
policy {
    check this.nonce > 0
    finish {}
}

// after
policy {
    check this.nonce > 0 else recall reject()
    finish {}
}

recall reject() {}
```

## 2. `unwrap` and `check_unwrap` removed ([#736])

Both keywords are gone. Replace them with `or` or `match`.

### `or`

`lhs or rhs` where `lhs` is `option[T]`: yields the inner value if
`Some`, otherwise evaluates `rhs`. `rhs` must unify with `T`, and
`Never` unifies with anything, so a terminal expression works.

The left side must be an `option`; `or` does not apply to `result`.
A non-option left side is reported as *invalid type* with the
label *expected `optional` but found `...`*.

```policy
// before
let owner = unwrap query Owner[]
let new_x = unwrap add(stuff.x, this.value)

// after
let owner = query Owner[] or recall reject()
let new_x = add(stuff.x, this.value) or recall reject()
```

`add` and `sub` return `option[int]`, so they need the same
treatment as `query`. In a function, the right side can be a default
or a return:

```policy
function f() int {
    let x = Some(42) or return 0
    return x
}
```

### `Some(ident)` patterns ([#712])

`match` arms can bind the inner value of an option:

```policy
let n = match query Foo[i: 1] {
    Some(f) => f.x
    None => 0
}
```

The existing binding rules (already enforced for `Ok(x)` / `Err(e)`)
apply: a literal in the same arm as a binding is *redundant*, a
literal in a later arm is *unreachable*, and `Some(x)` alone is not
exhaustive, so you still need `None` or `_`.

## 3. `seal` / `open` rewritten ([#738], [#750])

The runtime now assumes the envelope payload is `serialize(this)`,
which lets it skip `open` when braiding. As a result:

- `serialize()` and `deserialize()` are removed from the language.
- `seal` receives `this` and an implicit `payload bytes` (the
  serialized command).
- `open` receives `this` (already deserialized), `payload bytes`,
  and `envelope`, and **returns `unit`**. Its only job is
  verification.
- `struct Envelope` no longer has a `payload` field;
  `envelope::payload()` is removed; `envelope::new()` no longer
  takes a payload.
- `crypto::sign` takes `our_sign_sk_id option[id]`; `crypto::verify`
  takes `author_sign_pk option[bytes]` and returns `unit` (was
  `bytes`). `None` fails verification inside the FFI instead of
  requiring a `check_unwrap` in policy.

```policy
// before
seal {
    let parent_id = perspective::head_id()
    let author_id = device::current_device_id()
    let payload = serialize(this)
    let author_sign_key_id = idam::derive_sign_key_id(this.owner_keys.sign_key)

    let signed = crypto::sign(author_sign_key_id, payload)
    return envelope::new(parent_id, author_id, signed.command_id, signed.signature, payload)
}

open {
    let payload = envelope::payload(envelope)
    let author_sign_key = deserialize(payload).owner_keys.sign_key

    let verified_command = crypto::verify(
        author_sign_key,
        envelope::parent_id(envelope),
        payload,
        envelope::command_id(envelope),
        envelope::signature(envelope),
    )
    return deserialize(verified_command)
}

// after
seal {
    let parent_id = perspective::head_id()
    let author_id = device::current_device_id()
    let author_sign_key_id = idam::derive_sign_key_id(this.owner_keys.sign_key)

    let signed = crypto::sign(Some(author_sign_key_id), payload)
    return envelope::new(parent_id, author_id, signed.command_id, signed.signature)
}

open {
    return crypto::verify(
        Some(this.owner_keys.sign_key),
        envelope::parent_id(envelope),
        payload,
        envelope::command_id(envelope),
        envelope::signature(envelope),
    )
}
```

### Shared helpers

Helpers that looked up the signing key with `check_unwrap` become a
`match` that forwards the option to the FFI. An `open` helper takes
the payload and returns `unit`.

```policy
// before
function seal_command(payload bytes) struct Envelope {
    let parent_id = perspective::head_id()
    let author_id = device::current_device_id()
    let author_sign_pk = check_unwrap query DeviceSignPubKey[device_id: author_id]

    let signed = crypto::sign(author_sign_pk.key_id, payload)
    return envelope::new(parent_id, author_id, signed.command_id, signed.signature, payload)
}

function open_envelope(sealed_envelope struct Envelope) bytes {
    let author_id = envelope::author_id(sealed_envelope)
    let author_sign_pk = check_unwrap query DeviceSignPubKey[device_id: author_id]

    return crypto::verify(
        author_sign_pk.key,
        envelope::parent_id(sealed_envelope),
        envelope::payload(sealed_envelope),
        envelope::command_id(sealed_envelope),
        envelope::signature(sealed_envelope),
    )
}

// after
function seal_command(payload bytes) struct Envelope {
    let parent_id = perspective::head_id()
    let author_id = device::current_device_id()
    let author_sign_id = match query DeviceSignPubKey[device_id: author_id] {
        Some(pk) => Some(pk.key_id)
        None => None
    }

    let signed = crypto::sign(author_sign_id, payload)
    return envelope::new(parent_id, author_id, signed.command_id, signed.signature)
}

function open_envelope(payload bytes, sealed_envelope struct Envelope) unit {
    let author_id = envelope::author_id(sealed_envelope)
    let author_sign_pk = match query DeviceSignPubKey[device_id: author_id] {
        Some(pk) => Some(pk.key)
        None => None
    }

    return crypto::verify(
        author_sign_pk,
        envelope::parent_id(sealed_envelope),
        payload,
        envelope::command_id(sealed_envelope),
        envelope::signature(sealed_envelope),
    )
}
```

Call sites:

```policy
seal { return seal_command(payload) }
open { return open_envelope(payload, envelope) }
```

### Test shims

The `do_seal` / `do_open` helpers in
`aranya_runtime::vm_policy::testing` changed accordingly:

```policy
seal { return envelope::do_seal(serialize(this)) }        // before
open { return deserialize(envelope::do_open(envelope)) }  // before

seal { return envelope::do_seal(payload) }                // after
open { return envelope::do_open(payload, envelope) }      // after
```

## 4. Actions can return `result[unit, E]` ([#706])

Additive; infallible actions keep compiling. This is the intended
replacement for actions that used to fail through a bare `check`.

```policy
action infallible() {}

action can_fail(x int) result[unit, string] {
    check x > 0 else return Err("negative input")
    return Ok(Unit)
}
```

Compiler rules:

- The success type must be `unit` (*an action's success type must be
  `unit`*).
- A result-typed action must return on every path (*missing return
  statement*).
- An infallible action cannot `return` (*cannot return from an
  infallible action; declare a `result[unit, E]` return type*).

At runtime an action that returns `Err(..)` surfaces as
`PolicyError::Rejected`. The `policy-ifgen` generated interface is
unchanged.

## 5. Rust API changes

### Runtime errors ([#706])

- `PolicyError::Check` is now `PolicyError::Rejected`.
- `ClientError::NotAuthorized` is removed. `From<PolicyError>` is now
  a plain `#[from]`, so a rejection arrives as
  `ClientError::PolicyError(PolicyError::Rejected)`.

```rust
// before
Err(ClientError::NotAuthorized) => ...

// after
Err(ClientError::PolicyError(PolicyError::Rejected)) => ...
```

### `Command::max_cut` / `Command::address` ([#742])

`max_cut()` and `address()` moved off `trait Command` onto
`CommandExt`, which has a blanket impl for all `C: Command` and
always derives max cut from the parents. Remove these methods from
your `Command` impls and import `CommandExt` where you call them.

### Struct deserialization ([#748])

Deserialization validates enum values against the module's enum
definitions and returns `DeserializeError::UnknownEnum` on a miss.
Payloads with out-of-range enum discriminants that used to
deserialize will now be rejected.

### `ActionDef`

`ActionDef` gained `result_type: TypeKind` and `is_fallible()`. Code
constructing `ActionDef` by hand must set the new field.

## 6. Recompile `Module` artifacts

`ModuleData::V0` is still the only tag, but `ModuleV0` changed
incompatibly. The module and VM types no longer carry source `Span`s
([#726]); as part of that, `action_defs`, `command_defs`,
`fact_defs`, `struct_defs`, and `enum_defs` moved from maps to
`Vec`s. `ActionDef` also gained `result_type` ([#706]). Modules
serialized by the previous release will not deserialize. Recompile
from source.

## Syntax reference

| Removed                        | Replacement                                        |
| ------------------------------ | -------------------------------------------------- |
| `check <expr>`                 | `check <expr> else <terminal>`                     |
| `unwrap <expr>`                | `<expr> or <terminal>`, or `match { Some(x) => .. }` |
| `check_unwrap <expr>`          | `<expr> or recall f()`, or `match { Some(x) => .. }` |
| `serialize(this)`              | implicit `payload` in `seal`                       |
| `deserialize(bytes)`           | implicit `this` in `open`                          |
| `envelope::payload(e)`         | `payload` parameter                                |
| `envelope::new(.., payload)`   | `envelope::new(..)` without the payload            |
| `open { .. return <Command> }` | `open { .. return <unit> }`                        |

| Added                         | Notes                                           |
| ----------------------------- | ----------------------------------------------- |
| `Some(ident)` match patterns  | binds the inner value                           |
| `action f() result[unit, E]`  | success type must be `unit`                     |

`or` predates this release but is now the main replacement for
`unwrap`. The keyword list is in
`crates/aranya-policy-lang/src/lang/parse/keywords.rs`; the grammar
is `crates/aranya-policy-lang/src/lang/parse/policy.pest`.

## Reference policies

Policies in `aranya-core` that use the new syntax:

- `crates/aranya-core-example/src/policy.md`
- `crates/aranya-model/src/tests/basic-policy.md`
- `crates/aranya-model/src/tests/ffi-policy.md`
- `crates/aranya-policy-runner/examples/policy.md`

Expect errors in this order: parse errors for `check` / `unwrap`,
then type errors in `seal` / `open`, then missing `recall` blocks.

[#706]: https://github.com/aranya-project/aranya-core/pull/706
[#712]: https://github.com/aranya-project/aranya-core/pull/712
[#726]: https://github.com/aranya-project/aranya-core/pull/726
[#736]: https://github.com/aranya-project/aranya-core/pull/736
[#738]: https://github.com/aranya-project/aranya-core/pull/738
[#742]: https://github.com/aranya-project/aranya-core/pull/742
[#748]: https://github.com/aranya-project/aranya-core/pull/748
[#750]: https://github.com/aranya-project/aranya-core/pull/750
