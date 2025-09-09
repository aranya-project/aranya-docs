# Overview

Policy writers should be able to provide custom errors for `check` and `check_unwrap` statements. These errors would be returned to the application in case of a check failure, to help the developer narrow down the cause of the failure.

When a check fails, the VM terminates with an `ExitReson::Check` variant, which is returned to the application. This exit variant will accept an error value, provided by the failing check statement.

Example:

```policy
enum Err { InvalidUserId, UserNotFound }

action foo(user_id int) {
    check user_id > 0 else Err::InvalidUserId
    let user = check_unwrap query User[user_id: user_id] else Err::UserNotFound
    ...
}
```

# Implementation

## Capturing error information

The `check` and `check_unwrap` statements gain a required `else` clause to specify the error to return if the check fails. For example, `check <expr> else <error>`. The `error` is an expression yielding a `VType`.

> **TBD**: Should the else clause be optional? Otherwise it would be a breaking change.

## Responding to errors

If a check fails within a command, the command's `recall` block will be called, with the error as an argument. 

```policy
recall(error /* optional string|enum|... */) {
    match error {
        ...
    }
}
```

> **TBD**: Not sure how the `error` parameter type will work. Each check can "throw" any VType, so the compiler can't verify it. The policy writer would have to be consistent with the error type.

Check failures outside command contexts simply terminate.

## Returning errors to the application

The check error is captured by the VM's `ExitReason::Check` enum variant. But the runtime (VmPolicy) terminates with an `EngineError::Check` variant, which will also need an error parameter. The VmPolicy will need to copy the VM's error value to the engine error.
