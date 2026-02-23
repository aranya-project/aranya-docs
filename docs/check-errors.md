# Overview

Currently, check failures simply terminate with no additional information. This makes it hard to diagnose errors. Additionally, the failing command cannot recover intelligently, because it doesn't know which check failed happened. We want to improve the way check failures are handled in the policy, and the way errors are communicated back to the application.

# Proposal

* Commands can now have more than one recall block, and checks can specify which one to invoke. This lets the policy decide how to respond to errors.
  * Each block has a name and optional arguments.
  * Existing policies with unnamed blocks will have to rename them to something like `recall _() {}`.
  * Named blocks may accept arguments. The number and types are verified by the compiler at the check site, based on block name.
* Recall blocks can emit effects to signal errors to the application. Which effect(s), if any, are emitted is up to the policy. This is not a new change, just a convention for communicating errors to the app.
* The runtime adds an `error: true` attribute to effects emitted in a recall context. This lets the application distinguish successful effects from errors.
* The `check` statement gains an optional `or recall <name>()` clause, which specifies which recall block to execute if the check fails. 
* `check` is not allowed in actions anymore since there's no command to recall. This will break existing policies. Needs more discussion.

Example:

```policy
enum Err {NoUser, NoPermission}

effect Result { error optional enum Err }

command Foo {
    policy {
        check ... // calls default recall block
        check ... or recall user(Err::NoUser) // calls named block
        finish {
            emit Result { error: None } // success
        }
    }
    recall _() {

    }
    recall no_user(error enum Err) {
        emit Result { error: error }
    }
}

action foo() {
    publish Foo {}
}
```

## Use in actions/pure functions

Since checks now trigger command recalls, they can no longer be used outside of commands, e.g. in actions or pure functions. So a new `assert ... else <error>` statement will be added, which can be used outide commands. It exits with a new `ExitReason::Assert(error)`, passing along the error (likely an enum variant). This value can then be returned to the application.

## TBD

> Can the proposed `assert` statement be used in commands? Probably not.

## NOTES/TODOs

> Compiler will have to ensure named (or anonymous) block exists in the current command.
