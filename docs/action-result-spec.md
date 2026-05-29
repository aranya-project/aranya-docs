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
    because it is not authoritative, the sink is.
    *Note: This assumes the [unit type PR](https://github.com/aranya-project/aranya-core/pull/669) has landed.*
    The error type can be any `policy_vm::data::Value` type, including `unit`. Sometimes it's
    enough just to signal failure, without providing an additional value.

2. Bare `check` syntax is removed

    Since actions can now return, there is no need for the bare check syntax anymore. Existing bare
    `check`s can be replaced with `else return`s. This means infallible actions cannot use `check`s.

### Runtime changes

Propagating the error value back to the runtime:

If the VM terminates with a `Check` reason, the action's error value is popped off the stack via
`RunState::consume_return()` (at the end of `VmPolicy::call_action`). It is then wrapped in a
`PolicyError::Check` (which will need a new payload for the error value) and returned to the caller
(`ClientState::action`).

TODO: figure out what's needed for `ifgen`
