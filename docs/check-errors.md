# Overview

Policy writers should be able to provide custom error messages for `check` and `check_unwrap` statements. These messages would be returned to the application in case of a check failure, to help the developer narrow down the cause of the failure.

When a check fails, the VM will still terminate with an Normal or Panic exit reason, but it will now include the user-defined error message. The runtime will then return this message to the application.

# Implementation

## Capturing error information

The `check` and `check_unwrap` statements gain a required `else` clause to specify the error to return if the check fails. For example, `check <expr> else <error>`.

> **TBD**: What is the type of `error`? If enum, how would the compiler know which enum is valid for errors? What if different checks use different enums? Plus each policy would have to define error enums, possibly repeating the same ones. And an enum value provides very limited amount of information... A string seems like better choice.

## Responding to errors

The `recall` block will receive an optional error value. For check failures, the error will always be set; for panics the value will be None.

The recall block can switch on this value to attempt recovery.

```policy
recall(error /*optional string*/) {
    match error {
        ...
    }
}
```

## Returning errors to the application

The `ExitReason::Check` enum variant will have a new error field, which the VM will set on exit.

The `EngineError::Check` variant will also need an error field, which will be set to the exit reason's error value.

> **NOTE**: What about `ExitReason::Panic`? It would be nice to add some context/location information for that too.
