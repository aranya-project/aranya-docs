# return

<div class="right">

| Scope  | |
|--------|----|
| global | ❌ |
| `action` | ✅ |
| `function` | ✅ |
| `get_key` | ✅ |
| `policy`/`recall` | ❌ |
| `finish` | ❌ |
| `finish function` | ❌ |

</div>

```
function foo() int {
    let x = query FooCount[deviceID: myId] or return 0
    return x.count
}
```

`return` evaluates an expression and returns the value from the
function. The value returned must have the type specified in the
function signature.
