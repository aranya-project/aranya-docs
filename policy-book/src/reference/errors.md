# Errors

Two types of terminating errors can be produced by executing policy code:

- Command recalls, usually caused by not meeting the expectations of a
  `check` statement.
- Runtime exceptions, caused by code violating some execution invariant.

## Check failures

The `check` statement either returns from the current function/action or
recalls the current command by executing a named recall block. The recall
block terminates with a _check failure_.
A check failure represents a failed precondition that the policy author
recognized could be possible in normal operation.

For example, an authorization check may depend on a device being an
administrator, which could be revoked by another command. If you stored
administrator status in a fact, querying that fact would return `None`
when the administrator status was revoked. So something like
`check query Administrators[deviceId: this.adminId] is Some else recall unauthorized()` would capture
the intent to produce a check failure in that case.

## Runtime exceptions

Runtime exceptions happen when an execution invariant is violated. Many
things can cause runtime exceptions, including but not limited to:

- Running out of memory (including overflowing the VM stack)
- Creating a fact that already exists
- VM stack underflow caused by compiler errors or badly behaving FFI

There is no way to detect or recover from a runtime exception in the
policy language. Runtime exceptions do not execute `recall` blocks, and
instead return an error to the application.

## Errors in Actions

An action can fail as you'd expect, but it can also fail if its
`publish`ed commands fail. Regardless of whether the commands
fail due to check failure or a runtime exception, any failure during an
action causes all commands published from the action to not be accepted
into the graph[^atomic-action-clarifier]. For example, this action will
never successfully publish a command:

```policy
enum Error { Failed }

action do_nothing() result[unit, enum Error] {
    publish SomeCommand{}
    return Err(Error::Failed)
}
```

And neither will this:

```policy
command FailCommand {
    fields {
        fail bool
    }

    // omit seal and open for example

    policy {
        check !this.fail else recall failed()
    }

    recall failed() {}
}

action do_nothing_harder() {
    publish SomeCommand{}
    publish FailCommand{ fail: true }
}
```

[^atomic-action-clarifier]: This does not mean that the set of commands
    published in an action are treated atomically. Each command is
    processed individually whether they are published by one action or
    many.
