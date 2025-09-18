# Overview

Currently, check failures simply terminate with no additional information. This makes it hard to diagnose errors. We want to improve the way check failures are handled in the policy, and the way errors are communicated back to the application.

# Proposal

* Commands can now have more than one recall block. This lets the policy decide how to respond to errors.
  * Each block has a name and optional arguments.
  * The default empty block remains, and is called by `check` statements that don't specify a recall block. This keeps existing policies working. Only one unnamed block is allowed.
  * Named blocks may accept arguments. The number and types are verified by the compiler at the check site, based on block name.
* Recall blocks emit effects to signal errors to the application. Which effect(s), if any, are emitted is up to the policy.
* The runtime adds an `error: true` attribute to effects emitted in a recall context. This lets the application distinguish successful effects from errors.
* The `check` statement gains an optional `or recall <name>` clause, which specifies which recall block to execute if the check fails. 
* The `or recall` clause is optional to avoid breaking existing policies.
* `check` is not allowed in actions anymore since there's no command to recall. This will break existing policies. Needs more discussion.

Example:

```policy
enum Err {NoUser, NoPermission}

effect Result { error optional enum Err }

command Foo {
    policy {
        check ... // calls default recall block
        check ... or recall user(Err::NoUser) // calls named block
        check ... or recall something_else
        finish {
            emit Result { error: None } // success
        }
    }
    recall {

    }
    recall no_user(error enum Err) {
        emit Result { error: error }
    }
    recall something_else { // named recall block with no args... allowed?

    }
}

action foo() {
    publish Foo {}
}
```

## TBD

> Should we allow named recall blocks with no args, e.g. the `something_else` block in the example above?

> If `check` is no longer allowed in actions, what should be done instead?
