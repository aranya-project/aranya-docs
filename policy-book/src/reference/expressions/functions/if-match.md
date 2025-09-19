# If and Match

## `if`

```policy
let y = if x == 3 "yes" else "no"
```

The `if` expression is a ternary operator. If the expression is true, it
evaluates to the `then` case, otherwise it evaluates to the `else` case.
Both cases must have the same type or it is a compiler error.

Not to be confused with the [`if` statement](../../statements/if.md).

## `match`

Much like the [`match` statement](../../statements/match.md), a `match`
expression evaluates to one of its arm expressions based on an equality
test against an expression. If no expression matches, it matches a
default case represented by `_`. The default case must exist.

```policy
action foo(x int) {
    let v = match x {
        3 => 1
        4 => 2
        _ => 0
    }
}
```

Each arm is a separate expression. Similarly to `if` expressions, each
subordinate expression in a `match` must evaluate to the same type as
the test expression or it is a compile error.

Not to be confused with the [`match` statement](../../statements/match.md).