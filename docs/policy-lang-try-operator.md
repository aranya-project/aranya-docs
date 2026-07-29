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
enclosing function or action, and no further statements in the caller run.

Because the failing branch is a `return`, `?` is only valid where such
a `return` is legal - in functions and actions returning `result[_, E]`.

## Type rules

- The operand of `?` must have a `result[T, E]` type. Applying `?` to any
  other type (for example an `optional` or a plain `int`) is a compile
  error.
- `e?` has type `T`, the success type of the operand.
- `?` is a postfix operator and binds more tightly than any prefix or infix
  operator. So `a + f()?` parses as `a + (f()?)`, and `x?.field` as
  `(x?).field`. Parentheses can override this as usual.

## Error type compatibility

The `?` operator ties the operand's error type to the enclosing
definition's error type. The error types must match by type; there
is no implicit conversion between error types.

To carry a value across two different error types, convert the error
explicitly:

```policy
function to_my_error(e OtherError) MyError { ... }

function outer() result[int, MyError] {
    // inner() returns result[int, OtherError]
    let n = match inner() {
        Ok(v) => v
        Err(e) => return Err(to_my_error(e))
    }
    return Ok(n)
}
```

## Error messages

Because `?` expands to generated code that does not literally appear in the
policy source, diagnostics need to be mapped back to the operator carefully.
A type error from the propagated `Err` - most commonly an error type mismatch
with the enclosing function, described above - should point at the `?` operator
and its operand, not at the generated `return`. The same applies when `?` is
used in a context that cannot return a `result`.
