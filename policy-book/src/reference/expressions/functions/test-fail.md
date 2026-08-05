# Test Fail

```policy
function f() int {
    check false else test_fail("this check should not fail")
    return 1
}
```

`test_fail()` exits with a runtime exception. It is intended for policy
that is written to exercise the compiler and VM, where reaching the
`test_fail()` means the policy did not behave as the test expected. Like
[`todo()`](todo.md), it can only be compiled in debug mode. It produces
a compile error otherwise.

`test_fail()` takes an optional string literal describing the
expectation that was violated.

`test_fail()` is a terminal expression, so it can stand in for a value
of any type. In practice it is the `else` of a `check` that states what
the policy under test is expected to do:

```policy
check exists Foo[] => {x: 3} else test_fail()

let count = count_up_to 5 Foo[i: ?]
check count == 3 else test_fail("expected three Foo")
```

## Compared to `todo()`

Both exit with a runtime exception and both are debug-only, but they say
different things about the code:

| | Meaning |
|---|---|
| `todo()` | This case is not handled yet |
| `test_fail()` | This case should never happen, and the test fails if it does |

Neither is appropriate in production policy. A condition the policy is
expected to encounter should be handled with a `check`, an
[`or`](../../types/optional.md#coalescing-with-or) fallback, or an early
`return`/`recall`.
