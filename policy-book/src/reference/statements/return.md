# return

<div class="right">

| Scope  | |
|--------|----|
| global | ❌ |
| `action` | ✅ |
| `function` | ✅ |
| `policy`/`recall` | ❌ |
| `seal`/`open` | ✅ |
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
