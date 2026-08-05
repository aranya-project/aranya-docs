# Optional Types

A type which can contain a value (`Some`) or no value (`None`). The type
of the value is specified after `option`, e.g. `option[int]`. The literal
expressions for optionals are `None` and `Some(❮expression❯)`.

```policy
// declare an optional field
effect Foo {
    a string,
    b option[int]
}

// initialize an optional
let player1 = Some("George")    // type is `option[string]`
let player2 = None              // type matches any optional type

// access the inner value with the coalescing `or`, providing a
// fallback when the optional is `None`
let winner = player1 or "nobody"   // "George"

// value can also be unwrapped via `match`
let p2 = match player2 {
     None => "nobody"
     Some(p) => p
}

// test whether an optional holds a value
let have_winner = player1 is Some  // true
let no_other    = player2 is None  // true
```

<img src="optional-literal.svg">

## Testing with `is`

`is` tests whether an optional holds a value. It returns true if the value is `Some`, and false if it is `None`. 

It does not compare against an inner value, so `x is Some(3)` is not valid. Use
[`match`](../expressions/functions/if-match.md#match) to test the value
inside an optional.

`is` binds more tightly than `==` and the logical operators, so
`a is Some && b is None` groups as expected. See [Operator
Precedence](../expressions/operators.md#operator-precedence).

## Coalescing with `or`

`or` is the optional coalescing operator. `A or B` evaluates to the value
inside `A` when `A` is `Some`, and to `B` when `A` is `None`. The left
side must be an `option[T]`, and the type of the right side must be `T`.

```policy
let cap = query Capability[object_id: object_id] or default_capability()
```

The right side is evaluated lazily, only when the left side is `None`.
`or` can be chained across several optionals until one of them is
`Some`, ending in a fallback value:

```policy
let value = get_cached() or get_from_db() or default_value()
```

### Escaping instead of falling back

The right side may also be a terminal expression &ndash;
[`return`](../statements/return.md),
[`recall`](../top-level/commands.md#recall-block), or
[`todo()`](../expressions/functions/todo.md) &ndash; which leaves the
current block instead of producing a value. This is how a `None` is
turned into an error:

```policy
// in a command policy block, recall the command
let data = query Foo[user_id: user_id] or recall user_not_found()

// in a function or action, return an error to the caller
let data = query Foo[user_id: user_id] or return Err(Error::NoSuchUser)

// during development, panic
let data = query Foo[user_id: user_id] or todo()
```
