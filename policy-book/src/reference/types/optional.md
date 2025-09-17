# Optional Types

A type which can contain a value (`Some`) or no value (`None`). The type
of the value is specified after `optional`, e.g. `optional int`. The
literal expressions for optionals are `None` and `Some(❮expression❯)`.

```
// declare an optional field
effect Foo {
     a string,
     b optional int,
}

// initialize an optional
// type of these player variables is `optional string`
let player1 = Some("George")
let player2 = None

// access inner value
// type of `winner` is `string`
let winner = unwrap player1
// This will terminate execution with a runtime exception
let winner = unwrap player2
```

<img src="optional-literal.svg">