# Todo

```policy
action foo(type enum Bar) {
    let x = if type == Bar::Done {
        1
    } else {
        todo()
    }
}
```

`todo()` simply exits with a runtime error. It is intended to be used
during development to stub out things you haven't finished. It can only
be compiled in debug mode. It produces a compile error otherwise.

`todo()` is a terminal expression, so it can stand in for a value of any
type. That makes it the stopgap for an unhandled `None`, in place of the
`unwrap` operator the language no longer has:

```policy
let x = y or todo()
```

Handling the `None` with a fallback value, a `return`, or a `recall` is
always preferable; `todo()` states that the case is simply not handled
yet. To state instead that a case should never be reached, see
[`test_fail()`](test-fail.md).
