---
layout: page
title: Policy Language v2
permalink: "/policy-language-v2/"
---

# Policy Language v2

All elements of [Policy Language v1](/docs/policy-v1.md) not modified by this document are unchanged.

## File Format

The `policy-version` front-matter field can now accept the value `2` to specify
this version of the Policy Language.

```
---
policy-version: 2
---
```

## Block Scope

`let` in an enclosing block is scoped to that block. It is an error to
use such a definition outside of that block, and it will cause a compile
error.

```
action foo(x int) {
    if x == 1 {
        let y = 4
        publish Foo { y: y }
    }
    // This is an error - y does not exist in the outer scope
    publish Foo { y: y }
}
```

Resolving an identifier traverses upwards through enclosing scopes. The
global scope is the last scope in this search and is always present.

`let` assignments cannot assign to any names already resolvable in the
current scope. Shadowing an existing identifier this way is a compile
error.

## Match Expressions

`match` is now usable in expression context, and arms can be arbitrary
expressions. For example, assigning one of many possible values used to
look like:

```
// PL v1 match statement conditional variable set
action foo(x int) {
    match x {
        3 => {
            let v = 1
        }
        4 => {
            let v = 2
        }
        _ => {
            let v = 0
        }
    }
}
```

But is now expressed more clearly as:

```
// PL v2 match statement with expressions
action foo(x int) {
    let v = match x {
        3 => 1
        4 => 2
        _ => 0
    }
}
```

As was the case with `if` expressions, each subordinate expression in an
`match` must evaluate to the same type or it is a compile error.

## Block Expressions

A block expression contains zero or more statements followed by a
required colon separator and terminal expression. The value of the block
is the value of that terminal expression.

```
action foo(x int) {
    let y = {
        let v = ffi::external_value()
        : x + v
    }
}
```

## `if` expression improvements

`if` expressions have now removed the braces around expressions. More
complex operations can be performed through block expressions.

```
action foo(x int) {
    let v = if x != 0 {
        let y = ffi::frob(x)
        : y + 1
    } else 0
}
```

A non-expression `match` or `if` still uses statement blocks with the
curly braces, not expressions, and ending a block with an expression in
that context is an error.

```
action foo(x int) {
    match x {
        3 => { 4 }  // Error - 4 is not a statement
        _ => { ... }
    }
}
```

## Struct Definition Field Insertion

When defining a struct, you can refer to a previously defined struct to
insert those field definitions into your struct.

```
struct Foo {
    a int,
    b bool,
}

struct Bar {
    +Foo,
    c string,
}
```

Defines `Bar` equivalently to specifying fields `a`, `b`, and `c`
explicitly. This also works in command fields:

```
command Baz {
    fields {
        +Bar,
        d optional bytes,
    }
    ...
}
```

Fields are inserted in the order specified by the referenced struct.
Expansion happens as the struct is compiled. You can only refer to a
struct that has been previously defined (though because commands may be
compiled in a later pass, all structs may be defined at that point).
Multiple references can be made, and they can be inserted anywhere in
the struct.

Duplicate fields from referenced struct definitions are a
compile error, e.g.

```
struct A { a int }
struct B { +A, a int }
```

Struct `B` will cause an error because `a` is already defined in `A`.

## Struct Conversion

There are now several shortcuts for transferring multiple fields between
structs.

### Isomorphic Struct Conversion

If two structs have fields with the same names and types, they are
isomorphic. A struct can be converted to an isomorphic struct with the
`as` operator. For example, this can be used to easily convert an
arbitrary struct to a command struct:

```
struct Foo {
    a int,
    b string,
    c bool,
}

command Bar {
    fields {
        a int,
        c bool,
        b string, // order is not important, just names and types
    }
    ...
}

action frob(f Foo) {
    // external::foo_creator() returns a Foo
    let b = external::foo_creator() as Bar
    publish b
}
```

### Struct Composition

A struct `A` whose fields are a subset of the fields of struct `B` can
be inserted into a struct `B` literal with the struct composition
operator `...`.

```
struct Foo {
    a int,
    b string,
}

struct Bar {
    a int,
    b string,
    c bool,
}

action frob(x Foo) {
    let b = Bar {
        c: false,
        ...x,
    }
}
```

As with struct conversion, fields of the same name must have the same
type. Any structs included this way must appear after any directly
specified fields. Fields directly specified are excluded from the
inserted structs. Or to state that differently, directly specified
fields always override the fields of included structs.

```
let x = Foo { a: 3, b: "hello" }
let y = Foo { a: 4, ...x }   // y = Foo { a: 4, b: "hello" }
```

More than one struct can be inserted this way, but the fields sourced
from any included structs must not overlap. Fields directly specified do
not count for this requirement.

```
let z = Foo{ a: 5, ...x, ...y }   // Fails due to `b` existing in both `x` and `y`
```

It is an error to add a composed struct when all fields are directly
specified. Even though no conflict occurs as no fields should be sourced
from the included structs, this is disallowed because it probably
indicates programmer error.

```
let z = Foo { a: 6, b: "goodbye", ...x }
```

### Struct Subselection

A struct `A` whose fields are a subset of the fields of struct
`B` can be assigned from struct `B` with the struct subselection
operator `substruct`.

```
struct Foo {
    a int,
    b string,
}

struct Bar {
    a int,
    b string,
    c bool,
}

action frob(x Bar) {
    let f = x substruct Foo
}
```
