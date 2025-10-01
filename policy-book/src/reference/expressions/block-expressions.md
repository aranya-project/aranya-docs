# Block Expressions

A block expression contains zero or more statements followed by a
required colon separator and terminal expression. The value of the block
is the value of that terminal expression.

```
action foo(x int) {
    let y = {
        let v = ffi::external_value()
        : x + v
    }
}
```

Block expressions allow the use of statements inside an expression to
help calculate a value. In particular, they're useful for [`if`
expressions](functions/if-match.md#if):

```
function saturated_level(level int) int {
    let result = if level > saturation_threshold then {
        let a = saturate(level)
        check a > 0
        let b = granulate(level)
        check b > 0
        : a + b
    }
}
```

Or [`match` expressions](functions/if-match.md#match).

```
action foo(location id, cap enum Capability) {
    let level = match x {
        Capability::Jump => {
            let user_perms = unwrap_check
                query UserJump[location: location]=>{allowed_level: ?}
            : user_perms.allowed_level
        }
        ...
    }
}
```