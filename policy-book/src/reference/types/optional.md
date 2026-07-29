# Optional Types

A type which can contain a value (`Some`) or no value (`None`). The type
of the value is specified after `optional`, e.g. `optional[int]`. The
literal expressions for optionals are `None` and `Some(❮expression❯)`.

```policy
// declare an optional field
effect Foo {
    a string,
    b optional[int]
}

// initialize an optional
let player1 = Some("George")
let player2 = None

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