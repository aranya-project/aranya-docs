# Action returns spec

An `action` should be able to return a result to the calling application to signal whether it
succeeded, and if not, a reason for the failure.

## Motivation

Today, a failing action produces a `runtime::ClientError`, but there is no way to pass an error
value back to the runtime. Failing commands can publish error effects, but an action can fail
before/without publishing any commands.

## Summary of changes

### Language changes

1. Actions gain *optional* `result` return type

    ```policy
    action infallible() {}
    action can_fail() result[unit, enum Error] {}
    ```
    
    The success type is limited to `unit`; returning success values from actions is disallowed
    because the action result is not authoritative, the sink is.
    *Note: This assumes the [unit type PR](https://github.com/aranya-project/aranya-core/pull/669) has landed.*
    The error type can be any `policy_vm::data::Value` type, including `unit`. Sometimes it's
    enough just to signal failure, without providing an additional value.

2. Bare `check` syntax is removed

    Since actions can now return, there is no need for the bare check syntax anymore, and it is
    removed. 
    - Existing policies will need to be updated to either remove the `check` or add
      `else return`.
    - Any commands that have not been updated since the multiple-recall rollout will also need to
      be updated to specify which recall block to invoke, since there is no default recall block
      anymore.

3. `check_unwrap` is removed

    The `check_unwrap` statement broke after the default recall block went away - no syntax to
    specify which recall block to run. It is therefore removed, and existing policies can use `match`
    instead:

    ```policy
    let x = query Foo[...]
    if x is None {
        recall Err::not_found
    }
    ```
    *TODO Add ticket to implement optional matching so we can do `let x = match query { ... }`.
    At that point, we probably don't need `unwrap` either - one less way to panic.*

### Runtime changes

Returning from an action terminates the policy with a Normal exit. The VmPolicy then tries to
retrieve the return value from the stack.
- If the value is `Err`, the extract its payload, and return a `PolicyError::Check`,
with the payload. The `PolicyError::Check` variant gains a payload of type `Value`.
- If the value is `unit`, the action succeeded. If it is not found, the action is infallible. In
either case, return a success value to the caller (client/session).




TODO:
- if PolicyError::Check has required value, how does that work with #648 (invoke-recall-from-policy)?
    actions return Err(<value>), but commands don't. yet both produce Check exit
- figure out what's needed for `ifgen`