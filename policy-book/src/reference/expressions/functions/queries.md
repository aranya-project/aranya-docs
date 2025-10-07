# Queries and Counting

## `query`

```
fact Foo[deviceID id]=>{count int}

let x = query Foo[deviceID: me]
```

Perform a query against the fact database, returning an optional struct
containing all fields of the first matching fact. The value side of the
fact must be omitted. The type of the struct returned is the
auto-generated struct for the fact.

In the above example, `x` is an `optional struct Foo` with two fields,
for `deviceID` and `count`. If no facts are found, it returns `None`.
`query` is commonly used with `unwrap` or `check_unwrap` to terminate
execution immediately if the fact does not exist, or to access field
values in the returned struct if it does.

### Bind Marker

In Fact queries and statements with indefinite values, the bind marker
`?` can be substituted to mark that a key field can be any value. This
allows more general matching to be achieved. For performance reasons,
the concrete fields must be strictly on the left. So binds should only
appear on the rightmost fields of the key. For example,

```
let x = query Thing[a: 1, b: ?]     // OK
let x = query Thing[a: ?, b: ?]     // OK
let x = query Thing[a: ?, b: 2]     // Not OK
```

A query will return one fact at most, and if more than one fact matches,
the one with the lowest sorted key will be returned (see [Queries and
Iteration](../../queries-and-iteration.md)).

## `at_least N`, `at_most N`, `exactly N`

```
check at_most 1 Foo[deviceID: ?]
let sufficient_admins = at_least 2 TeamAdmin[teamID: t, deviceID: ?]
let is_highlander = exactly 1 Immortals[name: ?]
```

`at_least`, `at_most`, and `exactly` are counting query functions which
return a boolean value depending on whether the fact expression
satisfies the condition. `at_least` requires at least the stated number,
`at_most` requires at most the stated number, and `exactly` requires
exactly the stated number of facts to exist.

The same fact key binding rules as `query` apply - unbound key fields
must be on the right.

## `exists`

```
check !exists FooCounter[deviceID: this.deviceId]
```

`exists` is syntactic sugar for `at_least 1`.

## `count_up_to`

```
let admin_count = count_up_to 5 TeamAdmin[teamID: t, deviceID: ?]
```

`count_up_to` counts the number of facts up to an upper bound, and
returns either the number of facts found or that upper limit.
