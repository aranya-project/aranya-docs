# Result type

A type that represents either a success (with an associated value), or a failure with a value descripbing the error . A `result[T, E]` is either `Ok(v)`, where `v` is a value of type `T` produced on success, or `Err(e)`, where `e` is a value of type `E` describing the failure. Result values can be inspected with a `match` to extract the inner value or propagate the error.

<img src="result-literal.svg">

## Example

Function that returns a result:

```policy
function get_value(n int) result[int, string] {
    if n > 0 {
        return Ok(n)
    } else {
        return Err("invalid n")
    }
}
```

## Matching
Result values are handled with `match` statements or expressions:

```policy
function foo() result[int, string] {
    let n = match get_value() {
        Ok(0) | Ok(1) => 1
        Ok(n) => do_something(n)
        Err(msg) => return Err(msg)
    }
    // At this point, `get_value` succeeded, and `n` holds an int value
    return Ok(n)
}
```

## Propagating errors with `?`

Writing `?` after an expression of type `result[T, E]` unwraps it: `Ok(v)`
evaluates to `v`, and `Err(e)` returns `Err(e)` from the enclosing function
or action. These are equivalent:

```policy
function foo() result[int, string] {
    let n = match get_value(1) {
        Ok(n) => n
        Err(msg) => return Err(msg)
    }
    return Ok(n)
}

function foo() result[int, string] {
    let n = get_value(1)?
    return Ok(n)
}
```

The operand can be any `result` expression: a call, a local, a field
access, etc.

Restrictions:

- The enclosing function or action must return a `result` with the same
  error type `E`. There is no automatic error conversion; use `match` to
  map one error type to another.
- `?` is not allowed in command `policy`, `recall`, or `finish` blocks.
- `?` does not apply to `option[T]`, which has no error value to
  propagate. Use [`or`](optional.md#coalescing-with-or) instead.
- `?` only covers the error path. A function must still `return` on its
  success path.

### Match pattern restrictions
Literal and binding patterns can be used together, but with some restrictions:

- A literal pattern cannot appear after a binding pattern, e.g.
  ```
  // okay
  Ok(5) =>
  Ok(n) =>
  
  // invalid
  Ok(n) =>
  Ok(5) => // this is unreachable
  ```
- Literal and binding patterns cannot be mixed *in the same arm*. E.g.
  ```
  Ok(5) | Ok(6) // okay
  ```
  ```
  Ok(5) | Ok(n) // invalid - binding (n) matches all values, so the literal is redundant
  ```

### Nesting
Results can be nested: `result[result[int, string], enum Error]`. `?` can be
repeated to unwrap nested results that share an error type, e.g. `x??` on a
`result[result[int, E], E]`. They can also be combined with optionals, e.g.
`result[option[int], enum Error]`.
