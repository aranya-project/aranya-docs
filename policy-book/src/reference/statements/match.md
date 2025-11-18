# match

<div class="right">

| Scope  | |
|--------|----|
| global | ❌ |
| `action` | ✅ |
| `function` | ✅ |
| `policy`/`recall` | ✅ |
| `seal`/`open` | ✅ |
| `finish` | ❌ |
| `finish function` | ❌ |

</div>

```
let foo = 3
match foo {
    3 => { check bar == 3 }
    4 => { check bar == 0 }
    _ => { check bar > 3 }
}
```

`match` checks an expression against a series of match arms containing
unique constant literal expressions (that is, expressions made up of
only individual literals), and executes the first one that matches. You
can think about it conceptually like a series of `if`-`else if`
statements checking for equality between the first expression and the
constant in each match arm. Except in the case of a `match`, all
possibilities must be checked for.

The `_` token is a "default" match that matches anything. This also
means `_` should be the last match arm, as nothing will be matched
afterwards.

A match expression must match exactly one arm in order for the match
statement to be valid. Non-exhaustive matches will produce a compile
error when all match arms have failed to match.
Duplicate match arms will produce a compile error.

Note that unlike the [`match`
expression](../expressions/functions/if-match.md#match), the `match`
statement requires the use of curly braces around the statements in each
arm.