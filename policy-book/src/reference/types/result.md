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
Results can be nested: `result[result[int, string], enum Error]`. They can also be combined with optionals, e.g. `result[option[int], enum Error]`.
