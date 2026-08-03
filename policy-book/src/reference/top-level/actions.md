# Actions

```policy
action foo(a int, b string) {
    let cmd = Foo{a: a + 1, b: b}
    publish cmd
}
```

```policy
enum Error { InvalidID }

action foo(a int) result[unit, enum Error] {
    check a > 0 else return Err(Error::InvalidID)
    publish Foo{a: a}
    return Ok(Unit)
}
```

An action is a function callable from the application, which can perform
data transformations and publish zero or more commands. The effects of
an action are all or none &ndash; the commands published and side
effects emitted will only be visible to the rest of the system if the
entire action succeeds[^action-publish-clarification]. If the action
fails, no changes will occur (see [Errors in Actions](../errors.md)).

[^action-publish-clarification]: This does not mean that the commands
    have any kind of atomic relationship in the rest of Aranya. They
    will be processed individually regardless of how they were
    published.

## Return type

An action can optionally specify a return type to communicate
success/failure to the application. The return type is `result[unit, E]`,
where `E` can be any policy type. The success type is limited to `unit`,
to discourage applications from relying on the return value of an action,
because an action's success does not mean its commands have been accepted
on the graph.
