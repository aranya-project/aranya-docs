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

```
check envelope::author_id(envelope) == device
```

`check` evaluates a boolean expression and terminates policy execution
with a check failure if it evaluates to false.

`check` statements are meant to check policy invariants. For example, if
you need to make sure that the author of a command has the correct
permissions, `check` is the appropriate tool to enforce that. A failed
`check` statement causes the runtime to execute the [`recall`
block](../top-level/commands.md#recall-block), which allows a policy to
take corrective measures after a command is no longer valid. This could
for example, cascade to deleting a Fact or emitting an Effect that the
application can use to take further action.

```
command ActivateFoo {
    ...

    policy {
        let author = envelope::author_id(envelope)
        let perms = unwrap query Permissions[user: author]=>{level: ?}
        check perms.level == Permission::WRITE
        finish {
            ...
        }
    }

    recall {
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

You could alternatively think of `check` like a kind of exception return
and `recall` is a global `catch` block.

See the [Errors](../errors.md) section for more information on check
failures.