# `let`

<div class="right">

| Scope  | |
|--------|----|
| global | ✅ |
| `action` | ✅ |
| `function` | ✅ |
| `policy`/`recall` | ✅ |
| `seal`/`open` | ✅ |
| `finish` | ❌ |
| `finish function` | ❌ |

</div>

```
let x = a + 3
let result = query FooCounter[deviceID: author]
```

`let` declares a new [named value](../../concepts/named-values.md) whose
value is evaluated from an expression. All named values created with
`let` are immutable and exclusive &mdash; their values cannot be changed
after they are defined, and the name must not already exist in this or
any enclosing scope. The names `this` and `envelope` are reserved.

Variables are [scoped](../../concepts/scope.md) to their containing
block &mdash; the action, function, `policy` block, `if` statement, etc.

```
let x = 3
if foo > 4 {
    let y = x + 4  // `x` is accessible from the enclosing scope, but
                   // `y` is only valid in this if block
}
// `y` no longer exists here but `x` still does
```