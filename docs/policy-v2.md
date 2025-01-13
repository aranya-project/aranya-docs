---
layout: page
title: Policy Language v2
---

All elements of [Policy Language v1](policy-v1.md) not modified by this document are unchanged.

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

## Block Expressions

A block expression contains zero or more statements followed by a
required colon separator and terminal expression. The expression is the
value of the block.

```
action foo(x int) {
    let y = {
        let v = ffi::external_value()
        : x + v
    }
}
```

### `match` and `if` in expressions

`match` is now usable in expression context, and block expressions are
used for the interior blocks in this usage. For example, assigning one
of many possible values used to look like:

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
// PL v2 match statement with block expressions
action foo(x int) {
    let v = match x {
        3 => {: 1 }
        4 => {: 2 }
        _ => {: 0 }
    }
}
```

Likewise, `if` expressions now use block expressions and can compute
more complex values.

```
action foo(x int) {
    let v = if x != 0 {
        let y = ffi::frob(x)
        : y + 1
    } else {
        : 0
    }
}
```

As was the case with `if` expressions, each subordinate block expression
in an `if` or `match` must evaluate to the same type or it is a compile
error.

A non-expression `match` or `if` does not use block expressions, and ending a block with an
expression in that context is an error.

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

A struct `A` whose fields are a strict subset of the fields of struct
`B` can be inserted into struct `B` with the struct composition operator
`...`.

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
        ...x,
        c: false,
    }
}
```

This can be used more than once, but the fields in the source structs
cannot overlap.

### Struct Subselection

A struct `A` whose fields are a strict subset of the fields of struct
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
