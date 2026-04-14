---
layout: page
title: "Policy Lang: 'or' and 'recall'"
permalink: "/policy-or-recall/"
---

## `or` operator

`or` is an optional coalescing operator that combines `unwrap` with a
fallback value, similar to [Rust's
`.unwrap_or()`](https://doc.rust-lang.org/std/option/enum.Option.html#method.unwrap_or)
or [JavaScript's nullish coalescing operator
`??`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Nullish_coalescing).

```policy
fact Capability[object_id id] => {
    read bool,
    write bool,
}

// default `struct Capability` created by fact above
function default_capability(object_id id) struct Capability {
    return Capability {
        object_id: object_id,
        read: false,
        write: false,
    }
}

function get_capability(object_id id) struct Capability {
    let cap_opt = query Capability[object_id: object_id]
    return cap_opt or default_capability(object_id)
}
```

There are two subexpressions on either side of `or`. The left
subexpression must be an `optional` type. If the left subexpression
evaluates to `Some(v)`, it is unwrapped and `v` is the value of the
expression. If it is `None`, then the value of the expression is the
value of the right subexpression. `let x = a or b` is equivalent to:

```policy
let x = if a is Some {
    unwrap a
} else {
    b
}
```

And just like the `if` arms, the inner type of the left-hand optional
must match the type of the right-hand subexpression. `or` always
evaluates to a single type. So it cannot, for example, convert `None`
into `Err()` (unless the optional's inner type is an appropriate
`result`).

`or` lazily evaluates its right side expression, performing the
evaluation only when the left side is `None`. So `or` can be naturally
chained across several `optional` expressions until one is `Some`,
followed by a default value, `return`, or `recall`.

```policy
let authorized_user = primary_user() or admin() or return Err("user not found")
```

`or` is valid in any context.

## `recall`

Recall is both an expression and statement that immediately transfers
policy evaluation to the named recall block.

```policy
command Foo {
    ...

    policy {
        let user = get_user(this.user_id) or recall invalid_user(this.user_id)

        if user.privilege_level < ADMIN_LEVEL {
            recall insufficient_privileges(user)
        }
    }

    recall invalid_user(user_id id) {
        // handle the error
    }

    recall insufficient_privileges(user struct User) {
        // ...
    }
}
```

The `recall` keyword is followed by a function call-like item that
refers to a recall block within the command. The command is recalled, and evaluation continues at the named recall block.

`recall` is valid only within `policy` blocks.

## Removal of `unwrap` and `check_unwrap`

The `or` statement should provide a safe alternative to `unwrap` and `check_unwrap`, so they are removed from the language.

### Migrating error handling

Unwrap panicking is still possible by explicitly invoking `todo()`,
which makes it more clear that the error is not being handled.

```policy
// let x = unwrap y
let x = y or todo()
```

But what is better is using `or` to report error conditions by early
exiting with a `recall` (appropriate within policy blocks) or a `result`
(for everywhere else).

```policy
let x = y or recall policy_failed()
let x = y or return Err(Error::Y)
```

A common use case for `check_unwrap` was to produce a check failure on a
nonexistent fact. This now looks more clear by use of `or` with
`recall`.

```policy
// let data = check_unwrap query Foo[user_id: user_id]
let data = query Foo[user_id: user_id] or recall user_not_found()
```