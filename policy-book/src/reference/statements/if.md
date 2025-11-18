# if

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
if x == 3 {
    check bar == 3
} else if x == 2 {
    check bar == 2
} else {
    finish {
        emit BadBar {}
    }
}
```

The `if` statement executes a statement block if an expression is true.
If the statement is false, execution continues at the following `else`,
which may be a block or another `if` statement, or the following
statement if there is no `else`.

Note that this is similar to, but distinct from the [`if`
expression](../expressions/functions/if-match.md#if). An `if` expression
_must_ have an else clause because it provides functional alternation.
An `if` statement can have an `else if` or it can have no `else` clauses
because it merely provides alternate execution paths.

Note that unlike the [`if`
expression](../expressions/functions/if-match.md#if), the `if` statement
requires the use of curly braces around each block of statements.