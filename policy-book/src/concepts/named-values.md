# Named Values

A "named value" is what you might call a "variable" in other languages.
The distinction is important, though. Aranya Policy Language is a static
single assignment language. In a particular [scope](scope.md), a named
value is defined once and never mutated. Some values may be predefined
in some scopes, or inherited from enclosing scopes.

```policy
let x = 3
let x = 4  // Error - cannot redefine `x`
if foo is None {
    let x = 5  // Can't shadow in an inner scope, either.
}
```

## Automatically defined named values

In some contexts, there are names automatically defined by the runtime.

- In `policy`, `recall`, and `seal` blocks, the fields of the command are available via the
  name `this`, which is of type `struct <CommandName>`.
- In `policy`, `recall`, and `open` blocks, the envelope of the command
  is available via the name `envelope`, which is an opaque type accessible via the `envelope` FFI.