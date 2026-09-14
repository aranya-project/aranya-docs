# The `?` operator

## 1. Summary

`?` written after a call consumes the `result[T, E]` that call returns:
- `Ok(v)` evaluates to `v`
- `Err(e)` returns `Err(e)` from the enclosing callable.

It's essentially syntactic sugar for a `match`. It compiles to a branch and an unwrap.

## 2. Motivation

Propagation is written by hand today:

```policy
action foo() result[unit, enum Error] {
    let value = match try_get_value() {
        Ok(n) => n
        _ => return Err(Error::Fail)
    }
    ...
}
```

When calling multiple fallible functions, it gets verbose fast. With `?`:

```policy
action foo() result[unit, enum Error] {
    let value = try_return(succeed)?
    ...
}
```

## 3. Non-goals

- `?` on anything but a call — not on locals, `Ok`/`Err` literals, or field
  accesses (§4)
- `?` on `option[T]` - we can use the `or` operator for handling `None`
- error conversion — the language has no trait system, so no `From` analogue

## 4. Syntax

`?` is a postfix operator whose operand must be a call — it goes directly after
one, and nowhere else. It is part of the call form rather than a free-standing
postfix operator, so `x?` on a local, `this.field?`, and `Err(e)?` are parse
errors. It may repeat: `f(x)??` unwraps a `result[result[T, E], E]`,
since the chain still starts at a call.

The restriction keeps the parser simple, and avoids ambiguity against the *bind*
token, which is also `?`. A bind never follows a call, so
`query Stuff[x: k]=>{y: ?}` is unambiguous, and is easy to parse.

Whether nested `result` is a type worth having at all is a separate question —
the parser tests already flag it ("not sure we want it",
[tests.rs:240](../src/lang/parse/tests.rs#L240)). If it goes away, `f(x)??` goes
with it at no cost.

`?` is also not accepted on `action foo()`, which is a statement rather than an
expression; see §7.

A call with `?` is an atom, so the ordinary operators compose around it:
`f(x)?.field`, `!f(x)?`, and `f(x)? + g(y)?` needs no parentheses.

### 5. Diagnostics

Reuses the existing `InvalidType` and `InvalidReturn` error kinds.

On the call:

```
`?` can only be applied to a call returning `result[T, E]`; `f` returns `option[int]`
  note: `option` has no error to propagate; use `or`

`?` cannot propagate an error of type `string`
  the enclosing function returns `result[int, enum Error]`
  note: there is no automatic error conversion; use `match` to map the error
```

On the `?` itself, following the existing `return` wording:

```
cannot use `?` in an infallible action; declare a `result[unit, E]` return type
cannot use `?` in a function returning `int`; the return type must be `result[T, E]`
`?` is not valid in a command policy block; use `match`
`?` is not valid in a finish block
```

A `?` on a non-call operand is a parse error, not a type error, and should say
so plainly: ``the `?` operator can only follow a call``.

## 6. Dynamic semantics

`f(a)?` is an expression of type `T`, so it goes anywhere an expression of that
type goes: `let x = f(a)?`, a call argument, a struct field, either side of `+`.

## 7. Risks and open questions

**Return coverage.** The compiler's own check scans for any return instruction
in range, so the one `?` emits on the error path satisfies it even when the
success path falls through:

```policy
function f() result[int, string] {
    let x = g()?          // the `?` return satisfies the range scan
}                         // ...but the success path has none
```

The `FunctionAnalyzer` will detect the missing return, but only when compiling
with analysis enabled.

**Action-to-action calls.** `action foo()` is a statement, so when the callee is
fallible its error is silently dropped and the caller carries on as if it
succeeded. Tracked separately in
[#800](https://github.com/aranya-project/aranya-core/issues/800).

**Early exit from `map`.** A `map` body's query iterator is only released when
it is exhausted, so any early exit — an existing `return`, or a new `?` — leaks
one for the life of the run. This is an existing issue.

**`?` on `option[T]`.** Rust's `?` works on `Option`, so users may expect the
same here. It stays a compile error: `None` has no error value to propagate, and `or`
already covers the case. The §5.3 note points at `or` for that reason.

## 8. Tests

**Parser:** `f(x)?`, `mod::f(x)?`, and the compositions in §4; `x?`,
`this.field?`, `Err(e)?`, and `action foo()?` rejected with the §5.3 parse
error; `f(x)??` accepted; every existing bind form still parsing.

**Compiler:** one negative test per diagnostic in §5.3; calls returning `int`,
`unit`, and `option[T]` each rejected; error mismatch across `enum`, `string`,
and `struct` error types; `?` inside `match` arms, `if` branches, block
expressions, and `map` bodies; `f(x)??` on a `result[result[int, E], E]`, and
rejected when the two error types differ. Add the §7 fall-through to
`test_validate_return`.

**VM:** the `Ok` path continues with the inner value; the `Err` path returns the
original payload by identity, from a nested block and from inside a `map`; empty
stack and a normal exit reason on both.

**Runtime:** a fallible ephemeral action propagating with `?` yields
`PolicyError::Rejected`, matching an explicit `return Err(..)`.

Rewrite `test_result`'s `try` in `aranya-policy-vm/tests/vm.rs` to use `?`,
keeping a `match` version for coverage.
