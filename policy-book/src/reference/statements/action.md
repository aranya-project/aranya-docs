# action

<div class="right">

| Scope  | |
|--------|----|
| global | ❌ |
| `action` | ✅ |
| `function` | ❌ |
| `policy`/`recall` | ❌ |
| `seal`/`open` | ❌ |
| `finish` | ❌ |
| `finish function` | ❌ |

</div>

```policy
action foo() result[unit, string] {
    action bar() // call an infallible action
    action baz()? // call an action which returns a result, and handle it
}
```

`action` calls another action from inside of an action, so that actions
can be abstracted. It is not allowed for actions to call themselves, or
to call other actions in a way that would cause recursion.

The statement form is for actions without a return type. If the action has a
[return type](../top-level/actions.md#return-type), use the expression form,
i.e. capture the value. Since the success type of an action is limited to
`unit`, the only meaningful check is that the value is not `Err`; this is
most easily done with the try `?` operator.

