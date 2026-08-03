# `check`

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

```policy
check envelope::author_id(envelope) == device else recall unauthorized()
```

`check` evaluates a boolean expression. If it is true, execution
continues with the next statement. If it is false, the `else` expression
is evaluated instead. The `else` expression must be terminal &ndash; a
[`recall`](../top-level/commands.md#recall-block), a [`return`](return.md),
or [`todo()`](../expressions/functions/todo.md) &ndash; so a failed
`check` always performs an early exit.

`check` statements are meant to enforce policy invariants. For example, if
you need to make sure that the author of a command has the correct
permissions, `check` is the appropriate tool to enforce that. The `else`
expression decides what happens on failure:

- In a command `policy` block, `recall` the command so the policy can
  take corrective measures after a command is no longer valid. This
  could, for example, cascade to deleting a `Fact` or emitting an `Effect`
  the application can use to take further action.
- In a `function` or `action`, `return` an error to the caller.

```policy
command ActivateFoo {
    ...

    policy {
        let author = envelope::author_id(envelope)
        let perms = query Permissions[user: author]=>{level: ?} or recall activation_failed()
        check perms.level == Permission::WRITE else recall activation_failed()
        finish {
            ...
        }
    }

    recall activation_failed() {
        let author = envelope::author_id(envelope)
        finish {
            // oopsie doopsie
            emit ActivationFailed {
                author: author
            }
        }
    }
}
```

See the [Errors](../errors.md) section for more information on check
failures.