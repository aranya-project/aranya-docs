# Actions

```
action foo(a int, b string) {
    let cmd = Foo{a: a + 1, b: b}
    publish cmd
}
```

An action is a function callable from the application, which can perform
data transformations and publish zero or more commands. The effects of
an action are all or none &ndash; the commands published and side
effects emitted will only be visible to the rest of the system if the
entire action succeeds[^action-publish-clarification]. And error that
causes termination will result in no changes (see [Errors in
Actions](../errors.md)).

[^action-publish-clarification]: This does not mean that the commands
    have any kind of atomic relationship in the rest of Aranya. They
    will be processed individually regardless of how they were
    published.