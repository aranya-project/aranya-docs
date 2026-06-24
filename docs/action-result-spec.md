# Action returns spec

An `action` should be able to return a result to the calling application to signal whether it
succeeded, and if not, a reason for the failure.

## Motivation

Today, a failing action produces a `runtime::ClientError`, but there is no way to pass a reason
value back to the runtime. Failing commands can publish error effects, but an action can fail
before/without publishing any commands.

## Summary of changes

### Language changes

1. Actions gain an *optional* `result` return type

    ```policy
    action infallible() {}
    action can_fail() result[unit, enum Error] {}
    ```
    
    The success type is limited to `unit`. Applications should not rely on the return value of an
    action, because its success does not mean the command(s) and their effect will be
    accepted on the graph.
    
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
    - `check` no longer exits with `Check` reason
      Since the else clause is required, a check failure will run the terminal else expression:
      return or recall.
    - `check` not allowed in recall
      Recall blocks cannot return or call other recall blocks, so the check statement cannot be
      used in this context.


### Error value propagation

Actions don't exit, they simply return; this is to allow nested action calls. So execution ends not
when a check fails, but when the outermost action returns. The runtime detects when the call stack
becomes empty, and that signals the end of execution. This unchanged; what's new is how the return
value is propagated to the calling application.

After execution has completed (with a Normal reason), the runtime checks the VM stack for the
action's return value.

- If the value is `Err`, then extract its payload, and return a `PolicyError::Check(reason)`. The
  `PolicyError::Check` variant gains a payload of type `Value`.
- If the value is `unit`, the action succeeded. If it is not found, the action is infallible. In
  either case, return a success value to the caller (client/session).

Note that check failures exit with a `Normal` reason, not `Check`. This is because actions simply
return. The runtime will return a `PolicyError::Check` if the action returned an error.
