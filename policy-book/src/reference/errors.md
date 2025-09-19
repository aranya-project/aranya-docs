# Errors

Two types of terminating errors can be produced by executing policy
code. Check failures are caused by not meeting the expectations of a
`check` or `check_unwrap`. A runtime exception occurs when code violates
some execution invariant.

## Check failures

The `check` statement and the `check_unwrap` expression report failure
by exiting with a _check failure_. A check failure is distinct from
other errors in that it causes execution to fall to the `recall` block.
A check failure represents a failed precondition that the policy author
recognized could be possible in normal operation.

For example, an authorization check may depend on a device being an
administrator, which could be revoked by another command. If you stored
administrator status in a fact, querying that fact would return `None`
when the administrator status was revoked. So something like
`check_unwrap query Administrators[deviceId: this.adminId]` would capture
the intent to produce a check failure in that case.

## Runtime exceptions

Runtime exceptions happen when an execution invariant is violated. Many
things can cause runtime exceptions, including but not limited to:

- `unwrap`ping `None`
- integer over/underflow
- Running out of memory (including overflowing the VM stack)
- Creating a fact that already exists
- VM stack underflow caused by compiler errors or badly behaving FFI

There is no way to detect or recover from a runtime exception in the
policy language. Runtime exceptions do not execute `recall` blocks, and
instead return an error to the application.

## Errors in Actions

Errors in action code can fail as you'd expect, but they can also fail
if their `publish`ed commands fail. Regardless of whether the commands
fail due to check failure or a runtime exception, any failure during an
action causes all commands published from the action to not be accepted
into the graph[^atomic-action-clarifier]. For example, this action will
never successfully publish a command:

```
action do_nothing() {
    publish SomeCommand{}
    check false
}
```

And neither will this:

```
command FailCommand {
    fields {
        fail bool
    }

    // omit seal and open for example

    policy {
        check !this.fail
    }
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