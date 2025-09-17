# Struct Conversion

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

Or a struct into an effect:

```
effect FooEffect {
    a int,
    b string,
}

struct Foo {
    a int,
    b string,
}

command Bar {
    ...
    policy {
        ...
        let result = ffi::get_thing()  // let's say this returns a `struct Foo`
        finish {
            emit result as FooEffect
        }
    }
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
