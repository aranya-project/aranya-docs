# `publish`

<div class="right">

| Scope  | |
|--------|----|
| global | ❌ |
| `action` | ✅ |
| `function` | ❌ |
| `get_key` | ❌ |
| `policy`/`recall` | ❌ |
| `finish` | ❌ |
| `finish function` | ❌ |

</div>

```
action foo() {
    // assume there is a `command Foo { ... }`
    let obj = Foo{a: 3, b: "hello"}
    publish obj
}
```

`publish` submits a Command struct to the Aranya runtime. It is how
Commands are created in the system. The command is then evaluated within
the runtime. Any failure in this evaluation will cause the action to
fail and no commands will be added to the graph, including commands
`publish`ed before it.

`publish` is not a terminating statement; multiple commands can be
published in a single action.
