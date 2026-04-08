# Types

Aranya Policy Language supports several basic and structured types.
Notably, it does not support any collection types.

## Result type
A type that captures the outcome of an operation, and the resulting value or error: `result[OkType, ErrType]`.

```policy
function foo(n int) result[int, string] {
    if n > 0 {
        return Ok(n)
    } else {
        return Err("invalid n")
    }
}
```

### Coercion to Never
If only one variant is specified, the missing type is inferred as `Never`. E.g. `Ok(42)` becomes `result[int, Never]`, and `Err("fail")` becomes `result[Never, string]`.

### Matching
Result values are handled with `match`:

```policy
match get_color() {
    Ok(Color::amber) | Ok(Color::green) => {}
    Ok(color) => {}
    Err(msg) => {}
}
```

We can also use expressions:
```policy
let x = match r {
    Ok(n) => n
    Err(e) => return Err(e)
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
Results can be nested:
`result[result[int, string], enum Err]`. This is limited to one level.
