# Facts

Facts are a kind of database embedded in the Aranya runtime. They keep
track of a fairly regular key/value store, but they are modified as a
consequence of running policy commands. And because the graph can
branch, the value of a fact depends on what commands currently exist in
your graph.

Let's start with an example. Suppose you have a fact that keeps track of
a counter value per user.

```policy
fact Counter[user id]=>{value int}
```

The fields on the left of `=>` between square brackets are the **key**,
and they are used to look up facts in the database. The fields to the
right in curly brackets are the **value**, which just hold the data
associated with the key.

Now let's write some commands that manipulate these facts. First, we
need to initialize the fact to something.

```policy
command Enroll {
    fields {
        user id,
    }

    policy {
        check !exists Counter[user: this.user]

        finish {
            create Counter[user: this.user]=>{value: 0}
        }
    }
}
```

This command first [`check`](../reference/statements/check.md)s that no
fact exists using
[`exists`](../reference/expressions/functions/queries.md#exists).
`query` returns a boolean for whether the fact exists in the fact
database. Since we're creating a new fact, we want to ensure that it
doesn't exist yet. Then in the `finish` block we use
[`create`](../reference/statements/create.md) to create the fact with
the `user` value coming from the `user` field in the command, and an
initial value of zero.

Next we need a command that can change the value.

```policy
command Increment {
    fields {
        user id,
    }

    policy {
        let current_count = check_unwrap query Counter[user: this.user]=>{value: ?}
        let new_value = current_count.value + 1

        finish {
            update Counter[user: this.user] to {value: new_value}
        }
    }
}
```

We first fetch the value using
[`query`](../reference/expressions/functions/queries.md#query). Note the
use of the bind marker `?` in the value side of the fact
description[^query-value-side]. This tells `query` that you don't care
what that value is. And indeed, that's the value we're looking for when
we fetch this fact.

[^query-value-side]: If all of the value fields are bound, you can
    actually omit the value side entirely: `query Counter[user:
    this.user]`.

We use
[`check_unwrap`](../reference/expressions/operators.md#optional-operators)
to unwrap the optional given to us by the query. If the optional is
`None`, `check_unwrap` exits with a [check
failure](../reference/errors.md#check-failures). `check` and
`check_unwrap` should always be used to check the preconditions of a
command. Next we increment the value, and finally in the `finish` block
we use [`update`](../reference/statements/update.md) to change the value
in the fact database.

And finally, let's write a command that does something with this.

```policy
effect AuthorizationResult {
    authorized bool,
}

command Authorize {
    fields {
        user id,
    }

    policy {
        let current_count = check_unwrap query Counter[user: this.user]
        let authorized = current_count >= 2

        finish {
            emit AuthorizationResult {
                authorized: authorized
            }
        }
    }
}
```

This command uses the count stored in the fact database and checks
whether it is at least 2. Then it emits an effect to the application
reporting this status. So you can see this kind of works like a vote
system. If you have at least two `Increment` commands, you're
authorized.

## Exploring Alternate Realities

Now that we have our commands, let's see what happens if we issue a
series of them. I'll use a shorthand to describe the series of commands.

```
A: Enroll{ user: Bob }
B: Increment{ user: Bob }
C: Increment{ user: Bob }
D: Authorize{ user: Bob }

A -> B -> C -> D
```

This is a linear sequence of commands. We start with enrolling Bob, then
we increment twice, then we Authorize, which according to our rules
should produce `AuthorizationResult { authorized: true }`.

What's important to understand about the fact database is it is not just
the sum of all database operations. It exists and is queryable at every
point in this sequence so that it can be reconstructed when other
sequences of commands are merged. Let's suppose that instead the graph looks like this:

```
 /-> B -\
A        -> M -> D
 \-> C -/
```

And B and C were created in parallel branches. Here `M` is a "merge
command", which is just a join point for diverging parts of the graph so
that we can continue to add commands linearly. But we still need to turn
this into a linear sequence of commands so we can calculate the final
facts in `D`. The Aranya runtime does this with the [weave
function](/graph-auth/#weave), which makes repeatable choices to turn a
graph into a linear sequence of commands.

But how does the weave function make this choice? Which comes first, `B`
or `C`? Well, since they are the same command, the weave function just
makes an arbitrary and random decision[^weave-decision]. Let's say for
the sake of demonstration that this decision is "alphabetical order" so
`B` comes first. Then this looks exactly like the original linear
sequence. And since they're the same command we know it doesn't matter
anyway.

[^weave-decision]: It actually orders them based on their command ID,
    which is a hash derived from their serialized contents.

But sometimes order does matter. Suppose we had this instead.

```
 /-> B -> D -\
A             -> M
 \-> C ------/
```

Now which branch comes first determines whether the `Authorize` command
in `D` is true or false. Because if we order it `A, C, B, D` it's like
before, but if it's `A, B, D, C` we only have one `Increment` before the
`Authorize` and it will produce `AuthorizationResult { authorized: false
}`[^weave-order].

[^weave-order]: Weave order isn't actually a branch-to-branch choice.
    The resulting order could have interleaved `C` between `B` and `D`.

How do we make sure the order is what we expect? Commands can be given
priorities that let the weave function know which commands should come
first when there's a decision to be made. If we gave `Increment` a
higher priority than `Authorize` we would have an optimistic solution
that orders both `B` and `C` before `D`. If we gave `Authorize` a higher
priority, we'd have a pessimistic solution that would order `C` after
`D`. It's important to understand that there is no one solution for
ordering commands and it depends on your application.

## Using Keys and Bind Markers

The query engine in the fact database can match on partial keys using
the bind marker, but it has an important constraints. First is that any
bound key fields must be strictly to the right of any concretely
specified key fields (see [Bind
Marker](../reference/expressions/functions/queries.md#bind-marker)). The
second is that it will always query by [sorted key
order](../reference/queries-and-iteration.md). The fact returned by
`query` is the first ordered fact matching the key fields. Likewise, the
order of facts iterated by [`map`](../reference/statements/map.md) is
the key sort order.

It is tempting to think that because you can use bind markers on the
value side that they offer the same kind of lookup functionality. For
example, take this very ordinary fact definition for a set of users:

```policy
fact Users[user id]=>{level enum AuthorizationLevel}
```

You can, of course, find the authorization level of a particular user.

```policy
query Users[user: this.user]=>{level: ?}
```

But trying to do the opposite &ndash; finding a user with the given
authorization level &ndash; won't work as you expect.

```policy
query Users[user: ?]=>{level: AuthorizationLevel::Admin}
```

Why not? It's important to understand that anything on the value side of
a query is only matched against what the key side finds. This query
means "find the first user with any user ID, and if that user's level is
admin, return it." It does not mean "find the first user whose level is
admin". To do the latter query, you will have to create a fact with both
fields as keys and no values.

```policy
fact UsersByAuthorization[level enum AuthorizationLevel, user id]=>{}
```

Now you can query on the `level` field and find the first user at that level.

```policy
query UsersByAuthorization[level: AuthorizationLevel::Admin, user: ?]
```

This generally means that if you want to query on multiple fields, you
will have to create and maintain multiple facts as different indexes to
retrieve that data.