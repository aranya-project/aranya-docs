# Errors

Two types of terminating errors can be produced by executing policy code:

- Command recalls, usually caused by not meeting the expectations of a
  `check` statement.
- Runtime exceptions, caused by code violating some execution invariant.

The difference is that a rejection is an outcome the policy author
anticipated and described, while a runtime exception is not.

## Rejections

A rejection is a failed precondition that the policy author recognized
could be possible in normal operation. Rejections are produced
explicitly, by a [`check`](statements/check.md) whose expression is
false, or by coalescing a `None` with
[`or`](types/optional.md#coalescing-with-or). In both cases a terminal
expression decides how the failure is reported:

- `recall` recalls the current command and continues at the named
  [recall block](top-level/commands.md#recall-block). The command is not
  accepted into the graph.
- `return` exits the current function or action. An action reports the
  failure to the application through its [return
  type](#errors-in-actions).

For example, an authorization check may depend on a device being an
administrator, which could be revoked by another command. If you stored
administrator status in a fact, querying that fact would return `None`
when the administrator status was revoked. Either of these would capture
the intent to reject the command in that case:

```policy
check query Administrators[deviceId: this.adminId] is Some else recall unauthorized()

let admin = query Administrators[deviceId: this.adminId] or recall unauthorized()
```

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

An action reports failure to the application through its [return
type](top-level/actions.md#return-type), which is a `result[unit, E]`.
Returning `Err(e)` fails the action and hands `e` back to the
application, so `check ... else return Err(...)` is how an action states
a precondition:

```policy
enum Error { InvalidID }

action foo(a int) result[unit, enum Error] {
    check a > 0 else return Err(Error::InvalidID)
    publish Foo{a: a}
    return Ok(Unit)
}
```

An action can fail as you'd expect, but it can also fail if its
`publish`ed commands fail. Regardless of whether the commands
fail due to a rejection or a runtime exception, any failure during an
action causes all commands published from the action to not be accepted
into the graph[^atomic-action-clarifier]. This is also why the success
type is limited to `unit`: an action returning `Ok` means the action
itself ran to completion, not that its commands were accepted.

For example, this action will never successfully publish a command:

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
        finish {}
    }

    recall failed() {}
}

action do_nothing_harder() {
    publish SomeCommand{}
    publish FailCommand{ fail: true }
}
```

Note that the rejection of `FailCommand` happens in command policy, not
in the action, so it is not something the action can `return`. An action
that returns `Ok(Unit)` only means the action itself ran to completion.

[^atomic-action-clarifier]: This does not mean that the set of commands
    published in an action are treated atomically. Each command is
    processed individually whether they are published by one action or
    many.
