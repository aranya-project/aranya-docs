---
layout: page
title: "Policy Lang: the `?` operator"
permalink: "/policy-try-operator/"
---

## The `?` operator

Propagating an error out of a `result[T, E]` value is a common thing to
do, but it is verbose today. You have to `match` on the value and re-wrap
the error yourself:

```policy
function get_value() result[int, string] { ... }

function foo() result[int, string] {
    let n = match get_value() {
        Ok(v) => v
        Err(e) => return Err(e)
    }
    return Ok(do_something(n))
}
```

The `Err(e) => return Err(e)` arm is pure boilerplate: on failure, stop and
hand the same error back to the caller. The `?` operator captures exactly
that pattern. Like [Rust's `?`
operator](https://doc.rust-lang.org/std/result/index.html#the-question-mark-operator-),
it unwraps a successful `result` and propagates a failing one:

```policy
function foo() result[int, string] {
    let n = get_value()?
    return Ok(do_something(n))
}
```

The coalescing [`or` operator](/policy-or-recall/) can already
unwrap-or-escape, but it cannot forward the inner error value to its
right-hand side, so it cannot express "return this same error". `?` fills
that gap for `result` values.

## Semantics

`?` is a postfix operator applied to a `result[T, E]` value. `e?` is
equivalent to:

```policy
match e {
    Ok(v) => v
    Err(err) => return Err(err)
}
```

If `e` evaluates to `Ok(v)`, the `e?` expression evaluates to `v`. If `e`
evaluates to `Err(err)`, `?` performs an early `return Err(err)` from the
enclosing definition, and no further statements in the caller run.

Because the failing branch is a `return Err(err)`, `?` is only valid where
that exact `return` is legal: the enclosing definition must return a value,
that value must be a `result`, and its error type must match the operand's
error type. The three ways this can fail are described in [Enclosing context
requirements](#enclosing-context-requirements).

## Type rules

- The operand of `?` must have a `result[T, E]` type. Applying `?` to any
  other type (for example an `optional` or a plain `int`) is a compile
  error.
- `e?` has type `T`, the success type of the operand.
- The enclosing definition must return `result[_, E]`, with the same `E` as
  the operand.
- `?` is a postfix operator and binds more tightly than any prefix or infix
  operator. So `a + f()?` parses as `a + (f()?)`, and `x?.field` as
  `(x?).field`. Parentheses can override this as usual.

## Error messages

Because `?` expands to generated code that does not literally appear in the
policy source, diagnostics need to be mapped back to the operator carefully.
Every error above should point at the `?` operator and its operand, not at the
generated `return`:

| Case | Diagnostic should say |
|---|---|
| Enclosing definition returns nothing | `?` is not allowed in this context |
| Enclosing definition returns a non-`result` | `?` requires a `result` return type |
| Error types do not match | expected error type {e}, but `?` produces {f}  |
