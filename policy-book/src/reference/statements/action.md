# action

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
    action bar()
}
```

`action` calls another action from inside of an action, so that actions
can be abstracted. It is not allowed for actions to call themselves, or
to call other actions in a way that would cause recursion.
