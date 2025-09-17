# return

<div class="right">

| Scope  | |
|--------|----|
| global | ❌ |
| `action` | ❌ |
| `function` | ✅ |
| `policy`/`recall` | ❌ |
| `seal`/`open` | ✅ |
| `finish` | ❌ |
| `finish function` | ❌ |

</div>

```
function foo() {
    let x = unwrap query FooCount[deviceID: myId]
    return x.count
}
```

`return` evaluates an expression and returns the value from the
function.
