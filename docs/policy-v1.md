---
layout: page
title: Policy Language v1
permalink: "/policy-language-v1/"
---

## File format

The policy document is a Markdown document with YAML front matter (as
defined by [Jekyll](https://jekyllrb.com/docs/front-matter/)). Front
matter is delimited by `---` markers before and after. And, as the name
implies, it must exist at the head of the document. The YAML metadata
must specify a `policy-version` key. Currently, the only valid value for
this key is `1`.

```
---
policy-version: 1
---
... document follows
```

Only code inside code blocks marked with the `policy`
[info-strings](https://spec.commonmark.org/0.30/#info-string)
are parsed as policy code. Everything else is ignored.

~~~
# Title

Some explanatory text

```policy
// This is policy code
fact Example[]=>{}
```
~~~

## Basic syntax

### Whitespace

Whitespace is not significant in Policy Lang v3. Whitespace is any
sequence of spaces, tabs, and newlines (which includes `\n`, `\r\n`, and
`\r`).

### Comments

Comments are C99-style, supporting both block comments(`/* */`) and
line comments (`//`).

### Reserved words

Identifiers cannot use names defined by the language, including types
(`int`, `string`, etc.), top-level declarations (`command`, `emit`,
etc.), statements (`check`, `let`, etc.), and expressions (`query`,
`if`, etc.).

## Types

### `int`

A 64-bit signed integer.

### `string`

A UTF-8 encoded string. Literal string values are surrounded by
double-quotes (`"`). String literals support escapes for `\n`, `\"`,
`\\`, and two-digit hex escapes `\xNN`.

### `bytes`

Bytes represents an arbitrary byte sequence. It is similar to a
`string`, but it provides no validation for its contents, nor any way to
specify a literal. The `id` type below is similar, but fixed-length and
should be preferred specifically for identifier types.

### `bool`

A boolean. `true` and `false` are literal bool values.

### `id`

An opaque type for object identifiers. It is not possible to specify
literal `id`s.

### `optional ❮type❯`

A type which can contain a value (`Some`) or be empty (`None`). The type
of the value is specified after `optional`, e.g. `optional int`. The
literal expressions for optionals are `None` and `Some ❮expression❯`.
For example:

```
// declare an optional field
effect Foo {
     a string,
     b optional int,
}

// initialize an optional
// type of these player variables is `optional string`
let player1 = Some "George"
let player2 = None

// access inner value
// type of `winner` is `string`
let winner = unwrap player1
// This will terminate execution with a runtime exception
let winner = unwrap player2
```

### Structs

An ordered collection of fields accessed with the `.` operator. In
addition to being returned by some internal and FFI functions, like
`query`, named struct types can be defined by the user. Named structs
are also defined by Commands, Effects, and Facts (see [Struct
Auto-definition](#struct-auto-definition) below).

A struct literal is the name of the struct, followed by a series of
field definitions enclosed in curly braces. All fields must be
specified.

```
// user-defined struct
struct Bar {
    c string,
}

command Foo {
    fields {
        a int,
        b struct Bar,
    }
}

action make_foo() {
    // `struct Foo is automatically defined by `command Foo`
    let x = Foo {
        a: 2,
        b: Bar {
            c: "hello",
        },
    }

    publish x
}
```

#### Struct Auto-definition

Commands, Effects, and Facts auto-define a struct with the same name.
Commands define a struct whose fields match its `fields` block. Effects
define a struct whose fields match its `effect` block. Facts define a
struct whose fields are the combination of its key and value fields. For
example:

```
command Foo {
    fields {
        a int,
        b string,
    }
}

function make_struct_foo() struct Foo {
    return Foo {
        a: 3,
        b: "foo",
    }
}

effect Bar {
    x int,
}

function make_struct_bar() struct Bar {
    return Bar {
        x: 5,
    }
}

fact Baz[x int]=>[y string]

function make_struct_baz() struct Baz {
    return Baz {
        x: 5,
        y: "Baz",
    }
}
```

### Enumerations

```
enum Foo {
    A,
    B,
    C,
}

function is_a(v enum Foo) {
    match v {
        Foo::A => return true,
        _ => return false,
    }
}
```

Enumerations are a set of unique identifiers grouped under a single
name. They are defined in a top level [`enum` declaration](#enumerations-1).
An enumeration literal is the name of the enumeration and the name of the
item separated by `::`. So `Foo::A` is the `A` value of `Foo`, and is
distinct from `Bar::A`.

The only valid operation you can perform with an enumeration is
equality, either through the `==` operator, or via the `match`
statement. This comparison is only valid for enums of the same type.
Comparing `Foo::A` to `Bar::A` should be a compile-time error or
run-time exception.

See also the [`enum` declaration](#enumerations-1) below.

### Opaque types

Some operations (primarily ones imported from FFI) may have "opaque"
types which can only be referenced but not otherwise manipulated.

## Expressions

Expressions are similar to C-like languages, and have similar
precedence. Operations on the wrong type will produce either a compile
error or a runtime exception. In addition to these operators,
parentheses (`()`) can be used to set precedence explicitly.

### Binary Operators

| Operator | Meaning |
|----------|---------|
| `.`      | `A.B` accesses field B in struct A |
| `-`      | `A - B` subtracts B from A |
| `+`      | `A + B` adds A and B |
| `>`      | `A > B` is true if A is greater than B |
| `<`      | `A < B` is true if A is less than B |
| `>=`     | `A >= B` is true if A is greater than or equal to B |
| `<=`     | `A <= B` is true if A is less than or equal to B |
| `==`     | `A == B` is true if A is equal to B |
| `!=`     | `A != B` is true if A is not equal to B |
| `&&`     | `A && B` is true if A and B are both true |
| `\|\|`   | `A \|\| B` is true if A or B are true |

All overflow, underflow, range violations, and type mismatches are
errors and will terminate execution with a runtime exception.

### Prefix Operators

| Operator | Meaning |
|----------|---------|
| `-`      | `-A` is the numerical negation of A |
| `!`      | `!A` is the logical negation of A |
| `unwrap` | `unwrap A` is the value inside A if the option is Some, or else stop with a runtime exception |
| `check_unwrap` | Same as `unwrap`, but stop with a check failure instead of a runtime exception |

### Postfix Operators

| Operator | Meaning |
|----------|---------|
| `is None` | `A is None` is true if there is no value inside the optional A |
| `is Some` | `A is Some` is true if there is a value inside the optional A |

Using `is` on a non-optional value will fail with a compile error or
runtime exception.

### Operator precedence

| Priority | Op |
|----------|----|
| 1        | `.` |
| 2        | `-` (prefix), `!`, `unwrap`, `check_unwrap` |
| 3        | `+`, `-` (infix) |
| 4        | `>`, `<`, `>=`, `<=`, `is` |
| 5        | `==`, `!=` |
| 6        | `&&`, `\|\|` |

### Pure Functions

Pure functions can be called in an expression and evaluate to their
return value.

### Internal functions

Several expression items that look like operators are actually
implemented with their own syntax as "internal functions".

#### `query`

```
fact Foo[userID id]=>{count int}

let x = query Foo[userID: me]
```

Perform a query against the fact database, returning an optional struct
containing all fields of the first matching fact (see [Queries and
Iteration](#queries-and-iteration)). The value side of the fact must be
omitted. The type of the struct returned is the auto-generated struct
for the fact.

In the above example, `x` is an `optional struct Foo` with two fields,
for `userID` and `count`. If no facts are found, it returns `None`.
`query` is commonly used with `unwrap` or `check_unwrap` to terminate
execution immediately if the fact does not exist, or to access field
values in the returned struct if it does.

##### Bind Marker

In Fact queries and statements with indefinite values, the bind marker
`?` can be substituted to mark that a key field can be any value. This
allows more general matching to be achieved. For performance reasons,
the concrete fields must be strictly on the left. So binds should only
appear on the rightmost fields of the key. For example,

```
let x = query Thing[a: 1, b: ?]     // OK
let x = query Thing[a: ?, b: ?]     // OK
let x = query Thing[a: ?, b: 2]     // Not OK
```

A query will return one fact at most, and if more than one fact matches,
the one with the lowest sorted key will be returned.

#### `at_least N`, `at_most N`, `exactly N`

```
check at_most 1 Foo[userID: ?]
let sufficient_admins = at_least 2 TeamAdmin[teamID: t, userID: ?]
let is_highlander = exactly 1 Immortals[name: ?]
```

`at_least`, `at_most`, and `exactly` are counting query functions which
return a boolean value depending on whether the fact expression
satisfies the condition. `at_least` requires at least the stated number,
`at_most` requires at most the stated number, and `exactly` requires
exactly the stated number of facts to exist.

The same fact key binding rules as `query` apply - unbound key fields
must be on the right.

#### `exists`

```
check !exists FooCounter[userID: this.userId]
```

`exists` is syntactic sugar for `at_least 1`.

#### `count_up_to`

```
let admin_count = count_up_to 5 TeamAdmin[teamID: t, userID: ?]
```

`count_up_to` counts the number of facts up to an upper bound, and
returns either the number of facts found or that upper limit.

#### `if`

```
let y = if x == 3 { "yes" } else { "no" }
```

The `if` expression is a ternary operator. If the expression is true, it
evaluates to the `then` case, otherwise it evaluates to the `else` case.
Both cases must have the same type.

Not to be confused with the [`if` statement](#if-else-if-else).

#### `serialize()`/`deserialize()`

```
seal {
    let bytes = serialize(this)
    return envelope::new(bytes)
}

open {
    let fields = deserialize(envelope::payload(envelope))
    return fields
}
```

These functions turn structs into bytes and vice versa. `serialize()`
takes a `struct` argument (of any kind) and produces a serialized
`bytes` representation. It can only be used in a `seal` block.
`deserialize()` takes a `bytes` argument and produces a `struct`. It can
only be used inside a `open` block.

## Top-level declarations

All top-level identifiers share a single namespace. So it is not valid,
for example, to give the same name to an action and a struct.
Identifiers must start with an ASCII alpha character (`a-z`, `A-Z`) and
all following characters must be ASCII alphanumeric (`a-z`, `A-Z`,
`0-9`) or `_`. Identifiers are case sensitive.

### Global values

```
let x = 3
let default_name = "default"
```

Using `let` in global scope defines a global value. The value can be
used like a `let` in any other scope, and the same rules about
redefining names applies - `let` in a smaller scope cannot redefine a
name defined in global scope.

Values defined this way can only be `int`, `string`, `bool`, or
`struct`. The struct types must have fields of those types. The
initializer expression cannot access facts.

```
let x = 3 + 5           # OK
let y = query Fact[]    # Not OK; accesses facts
let z = f()             # OK if `f` is a pure function
                        # returning int, string, or bool
```

### Facts

```
fact FooCounter[user id]=>{count int}
immutable fact FooUsed[userid id]=>{}
```

A fact definition defines the schema for a fact. The first set of fields
between the `[]` is the key part of the fact, and the second set between
`{}` is the value. Fact names should be unique, and for each fact, the
field names must be unique across both the key and the value. The
number of values in the key and value sets is implementation-defined.

Fact fields use a more limited set of types because of ordering and
storage restrictions. This table defines which types are allowable.

| Type       | fact key | fact value |
|------------|----------|------------|
| `int`      | yes      | yes        |
| `string`   | yes      | yes        |
| `bytes`    | yes      | yes        |
| `bool`     | yes      | yes        |
| `id`       | yes      | yes        |
| `optional` | no       | yes        |
| Struct     | no       | yes (1)    |
| Opaque     | no       | no         |

Note 1: Structs can be used in fact values as long as it obeys the same
rules for its constituent field types.

#### Immutable facts

Immutable facts are prefixed with the `immutable` keyword, and can only
be created or deleted, never updated. Updating an immutable fact should
be a compile error.

### Actions

```
action foo(a int, b string) {
    let cmd = Foo{a: a + 1, b: b}
    publish cmd
}
```

An action is a function callable from the application, which can perform
data transformations and publish zero or more commands. The effects of
an action are atomic - the commands published and side effects published
will only be visible to the rest of the system if the entire action
succeeds. And error that causes termination will result in no changes
(see [Errors in Actions](#errors-in-actions) below).

### Effects

```
effect FooEffect {
    a int,
    b string,
}
```

An effect is a specific kind of struct declaration used to send
information to the application. Effects are used in `emit` statements
in `finish` blocks.

Effect field types can be any type except for opaque values, the same as
for the value side of Facts. Struct fields must obey the same
restriction.

Effects delivered through the application API will report the ID and
recall status of the Command that emitted them.

### Structs

```
struct MyStruct {
    a int,
    b string,
}
```

Arbitrary struct types can be defined in `struct` blocks. To use these
types in parameters, fields, or return types, use `struct ❮name❯`. e.g.

```
function foo(s struct MyStruct) { ... }
function makeStruct() struct MyStruct { ... }
struct InteriorStruct { thing struct MyStruct }
```

Any type may be used for struct fields except opaque types, though
further restrictions may be enforced when the structs are used with
`publish` and `emit` statements.

### Enumerations

```
enum MyEnum {
    A,
    B,
}
```

Enumerations are defined in `enum` blocks, which name the enumeration,
and then inside curly braces, list the items of that enumeration. The
items should be unique, and follow the normal rules for identifiers.
Duplicate items is a compile error. The type of an enumeration is `enum
❮name❯`. See also [Enumerations](#enumerations) above for usage
information.

### Commands

```
command Foo {
    attributes {
        // attributes can only be literals, so their type is implied
        priority: 3,
    }

    fields {
        a int,
        b string,
    }

    policy {
        let author = envelope::author_id(envelope)
        check count_valid(this.b)
        let fc = unwrap query FooCounter[user: author]

        let new_count = fc.count + this.a
        finish {
            update FooCounter[user: author]=>{count: fc.count} to {count: new_count}
            emit FooEffect {
                a: new_count,
                b: this.b,
            }
        }
    }

    recall {
        finish {
            emit FooEffect {
                a: 0,
                b: this.b,
            }
        }
    }
}
```

Commands define structured data (the `fields` block), rules for
transforming that structured data to and from a transportable format
(`seal` and `open` blocks), and policy decisions for determining the
validity and effects of that data (the `policy` and `recall` blocks).

Policy statements may terminate execution on a variety of conditions,
like a failed check or unwrapping a `None` optional (see
[Errors](#errors) below for how different kinds of errors affect policy
execution). Policy is transactional - a command is only accepted and
facts are only updated if policy execution reaches the end of a `finish`
block without terminating (though it may still not be accepted if it is
created from an action with mutliple `publish`es and a later one fails).
Recall blocks allow the production of effects and mutation of facts
after a command is recalled.

#### Fields block

The `fields` block defines the fields of the command, which is the data
that gets serialized and transported across the network to other nodes.
This data is accessed in the `policy` block through the `this` struct.
The `fields` block must be specified even if it is empty.

All types are allowed in fields except for opaque values, the same as
for the value side of Facts. Struct fields must obey the same
restrictions.

A struct named after the command is automatically created based on the
fields. See [Struct Auto-definition](#struct-auto-definition) above.
This struct is used when `publish`ing a command in an action.

#### Seal/Open

The `seal` and `open` blocks perform any operations necessary to
transform an envelope into command fields, and vice versa. `seal` is
automatically called when a command is `publish`ed, and `open` is
automatically called before command policy is evaluated. `seal` and
`open` are required blocks for commands.

These blocks operate like pure functions - `seal` has an implicit
argument `this`, which contains the pending command's fields just as it
does in the `policy` block. `seal` should return an envelope.
Conversely, `open` has an implicit argument `envelope`, an envelope type
(see below), and it should return a command struct with the command's
fields. If `open` does not return a valid command struct, or `seal` does
not return a valid envelope, policy evaluation will terminate with a
runtime exception.

`seal`/`open` are the appropriate place to perform any serialization,
cryptography, or envelope validation necessary as part of this
transformation, but it is not required that they do anything other than
return a valid envelope or command struct respectively. It is valid
(though likely not useful) to do no work at all and return static
values.

When evaluating a policy block, the implicit argument `envelope` is also
available so that properties of the envelope can be obtained.

##### `envelope` type

The envelope is a special struct which contains a representation of the
"wire format" of the command. It is typically defined by the `envelope`
FFI.

```
struct Envelope {
  parent_id id,
  author_id id,
  command_id id,
  sealed_payload bytes,
  signature bytes,
}
```

This definition is provided for reference, and may differ from
implementation to implementation. It is not expected that the policy
writer will manipulate it directly, but it may be transformed, or its
properties inspected, via the `envelope` FFI. In the future, it may be
possible to define envelope types on a per-command basis.

#### Policy block

The `policy` block contains statements which query data and check its
validity. The `policy` block must terminate with a `finish` block
(though it can have multiple `finish` blocks in branching paths). The
`finish` block must be specified even if it is empty (e.g. `finish {}`).

The policy block also defines the implied variables `this`, which refers
to a struct containing all of the fields for the command being
processed; and `envelope`, described above.

##### Finish block

A finish block can contain `create`, `update`, `delete`, and `emit`
statements, as well as call finish functions with the `finish` keyword.
No individual fact (identified by the fact name and key values) can be
manipulated more than once in a finish block. Doing so is a runtime
exception.

Allowed:
```
finish {
    delete Bar[userID: myId]=>{}
    create FooCount[userID: myId]=>{count: 1}
}

finish {
    // assuming id1 != id2
    create FooCount[userID: id1]=>{count: count1}
    create FooCount[userID: id2]=>{count: count2}
}
```

Not allowed:
```
finish {
    delete FooCount[userID: id3]
    create FooCount[userID: id3]=>{count: 1}
}
```

(instead of `delete` and `create` on a fact, you should use `update`)

Additionally, expressions inside finish blocks are limited to named
values and constants.

#### Recall block

The `recall` blocks are executed when a command of this type is
recalled. When changes in the weave cause a command to fail with a check
error, it is recalled. So the `recall` block is a kind of exception
handler for failed policy invariants.

The `recall` block is optional, and if not specified, a "default" recall
will be used that reports the error to the application (mechanism TBD).
Likewise, if a `recall` block encounters runtime exception, the default
recall will handle and report it.

Recall blocks can execute the same statements as a the `policy` block,
except for `check` (as its purpose is not to validate anything).
The application interface will mark effects produced in recall blocks
as recall effects, so that they can be distinguished from the same
effects produced in a policy block.

#### Attributes

Commands may optionally have an `attributes` block containing one or
more named attributes and their values. Attribute values follow the same
rules as global `let` - their types can only be `int`, `string`, `bool`,
or `struct` literals (where the structs follow the same rules).

```
command Foo {
    attributes {
        priority: 3,
        ephemeral: false,
    }
    ...
}
```

Attributes are metadata provided to the runtime. It is a mechanism to
decouple important operational parameters, like command priorities, from
the implementation of the language. They have no effect on policy
execution and are not accessible from its code, but they can be queried
through the machine interface.

### Functions

```
function count_valid(v count) bool {
    return v >= 0
}

finish function increment_foo(user id, current int) {
    update FooCounter[user: user]=>{count: current} to {count: current + 1}
}
```

Functions abstract statements into reusable blocks. There are two types
of functions - pure functions and finish functions.

Pure functions can contain data processing statements (`let`, `if`,
`match`), must have a return type, and must return a value with
`return`.

Finish functions can only contain finish block statements (`create`,
`update`, `delete`, `emit`) and cannot return a value.

Finish functions can call other finish functions in the same way as in
finish blocks. Like finish blocks, expressions in finish functions are
limited to named values and constants. Finish functions are called with
the `finish` keyword.

Pure functions are valid in any expression, but due to the restrictions
on finish blocks and functions, they may only be used in actions, pure
functions, command `seal`/`open`/`policy`/`recall` blocks outside finish
blocks, and global `let` definitions (subject to their restrictions). No
function type may be used in a way that would cause recursion.

### Foreign Function Interface

```
use crypto
use perspective
```

`use` defines an imported function library, which is provided by the
application. You must call functions from imported libraries with the
fully qualified library name (e.g. `crypto::sign()`). `use` can only be
used in global scope, and all `use` statements must appear before other
statements in the document.

Proposed libraries:

- crypto - for cryptography functions like `crypto::sign()` and
  `crypto::encrypt()`
- envelope - for safely accessing properties of the envelope like
  `envelope::parent_id()`
- device - for information about the current device like
  `device::current_user_id()`
- perspective - for information about the current perspective like
  `perspective::head_id()`

#### Imported function side-effects

Because policy may be executed more than once, imported functions should
not have side effects.

## Statements

### `let`

_Valid in global scope, actions, pure functions, and command `policy`,
`recall`, `seal`, and `open` blocks. Not valid in `finish` blocks or
functions._

```
let x = a + 3
let result = query FooCounter[userID: author]
```

`let` declares a new named value and assigns it a value evaluated from
an expression. All named values created with `let` are immutable and
exclusive &mdash; their values cannot be changed after they are defined,
and the name must not already exist in this scope. The names `this` and
`envelope` are reserved.

Variables are scoped to their containing construct &mdash; the action,
function, `policy` block, or `recall` block. Statements that have
interior statements like `match` do not create interior lexical scopes.

### `publish`

_Valid only in actions._

```
action foo() {
    let obj = Foo{a: 3, b: "hello"}
    publish obj
}
```

`publish` submits a Command struct to the Aranya runtime. It is how
Commands are created in the system. The struct given to `publish` is
then passed to the command's `seal` block as `this`, so the command can
be transformed into a serialized format. Then the sealed command is
evaluated within the runtime. Any failure in this evaluation will cause
the action to fail and the command will not be added to the graph.

`publish` is not a terminating statement; multiple commands can be
published in a single action.

### `check`

_Valid in actions, pure functions, and command `policy`, `recall`,
`seal`, and `open` blocks._

```
check envelope::author_id(envelope) == user
```

`check` evaluates a boolean expression and terminates policy execution
with a check failure if it evaluates to false. See [Errors](#errors)
below for more information on check failures.

### `match`

_Valid only in actions, pure functions, and command `policy`, `recall`,
`seal`, and `open` blocks_

```
let foo = 3
match foo {
    3 => { check bar == 3 }
    4 => { check bar == 0 }
    _ => { check bar > 3 }
}
```

`match` checks an expression against a series of match arms containing
unique constant literal expressions (that is, expressions made up of
only individual literals), and executes the first one that matches. You
can think about it conceptually like a series of `if`-`else if`
statements checking for equality between the first expression and the
constant in each match arm. Except in the case of a `match`, all
possibilities must be checked for.

The `_` token is a "default" match that matches anything. This also
means `_` should be the last match arm, as nothing will be matched
afterwards.

A match expression must match exactly one arm in order for the match
statement to be valid. Non-exhaustive matches may produce a compile
error or a runtime exception when all match arms have failed to match.
Duplicate match arms may never be executed or produce a compile error.

### `if`/ `else if`/ `else`

_Valid in actions, pure functions, and command `policy`, `recall`,
`seal`, and `open` blocks._

```
if x == 3 {
    check bar == 3
} else if x == 2 {
    check bar == 2
} else {
    finish {
        emit BadBar {}
    }
}
```

The `if` statement executes a statement block if an expression is true.
If the statement is false, execution continues at the following `else`,
which may be a block or another `if` statement, or the following
statement if there is no `else`.

Note that this is similar to, but distinct from the [`if`
expression](#if). Unlike the expression, it is valid to have an `if`
statement with no `else`.

### `create`

_Valid only in policy `finish` blocks and finish functions._

```
create FooCounter[userID: myId]=>{count: 0}
```

`create` creates a fact with the given parameters. The names and types
of the values given must match a fact declaration of the same name. All
values must be specified. Attempting to create a fact which has the same
key values as an existing fact is an error and will terminate policy
execution with a runtime exception. Creating a fact that has not been
defined by schema should fail with a compile error.

### `update`

_Valid only in policy `finish` blocks and finish functions._

```
update FooCounter[userID: myId] to {count: 1}
update FooCounter[userID: myId]=>{count: 0} to {count: 1}
```

`update` takes an existing fact and updates its value fields. It has two
forms. In both forms, new values are fully specified in a value struct
specified after `to`, and all value fields must be specified.

In the first form, only the key fields are specified, and any value
fields are updated unconditionally for the fact that matches the keys.
Bind values cannot be used.

In the second form, all fields must be specified. If a fact does not
exist matching key and value fields, policy evaluation terminates with a
runtime exception. This is conceptually similar to:

```
let unused = unwrap query FooCounter[userId: myId]
check unused.count == 0
finish {
    update FooCounter[userID: myId] to {count: 1}
}
```

Except that this will produce a check error if the `count` is not as
expected.

In either case, attempting to update a non-existent fact is an error and
will terminate policy execution with a runtime exception. Updating a
fact that has not been defined by schema should fail with a compile
error.

### `delete`

_Valid only in policy `finish` blocks and finish functions._

```
delete FooCounter[userID: myId]
delete FooCounter[userID: myId]=>{count: 1}
```

`delete` takes an existing fact and removes it. It has two forms.

In the first form, the value fields are omitted, and it will delete the
fact matching the key fields regardless of its value.

In the second form, All fields must be specified. This will delete the
fact that matches the key and value fields, similarly to how it works in
`update`.

In either case, if the values specified do not match anything, it is an
error and will terminate policy execution with a runtime exception.
Deleting a fact that has not been defined by schema should fail with a
compile error.

### `emit`

_Valid only in policy `finish` blocks and finish functions._

```
emit FooEffect {
    a: 3,
    b: "hello",
}
```

`emit` submits an effect to the application interface. The effect
must be a struct previously defined by an `effect` declaration. Effects
are delivered in the order that they are produced.

### `map`

_Valid only in actions._

```
map FooCounter[userID: ?]=>{count: ?} as counter {
    check counter.count > 0
}
```

`map` executes a fact query, and for each fact found, defines the given
name as a struct containing the bound fields. This can result in zero
or more iterations.

Like `query` and related functions, fact values or the entire value part
of the fact literal can be omitted.

### `action`

_Valid only in actions._

```
action foo() {
    action bar()
}
```

`action` calls another action from inside of an action, so that actions
can be abstracted. It is not allowed for actions to call themselves, or
to call other actions in a way that would cause recursion.

### `return`

_Valid only in pure functions and command `seal` and `open` blocks._

```
let x = unwrap query FooCount[userID: myId]
return x.count
```

`return` evaluates an expression and returns the value from the
function.

## Errors

Two types of terminating errors can be produced by executing policy
code. Check failures are caused by not meeting the expectations of a
`check` or `check_unwrap`. A runtime exception occurs when code violates
some execution invariant.

### Check failures

The `check` statement and the `check_unwrap` expression report failure
by exiting with a _check failure_. A check failure is distinct from
other errors in that it causes execution to fall to the `recall` block.
A check failure represents a failed precondition that the policy author
recognized could be possible in normal operation.

For example, an authorization check may depend on a user being an
administrator, which could be revoked by another command. If you stored
administrator status in a fact, querying that fact would return `None`
when the administrator status was revoked. So something like
`check_unwrap query Administrators[userId: this.adminId]` would capture
the intent to produce a check failure in that case.

### Runtime exceptions

Runtime exceptions happen when an execution invariant is violated. Many
things can cause runtime exceptions, including but not limited to:

- `unwrap`ping `None`
- integer over/underflow
- Running out of memory (including overflowing the VM stack)
- Creating a fact that already exists
- VM stack underflow caused by compiler errors or badly behaving FFI

There is no way to detect or recover from a runtime exception in the
policy language. Runtime exceptions do not execute `recall` blocks, and
instead execute a "default recall" defined by the policy runtime.

### Errors in Actions

Errors in action code can fail as you'd expect, but they can also fail
if their `publish`ed commands fail. Regardless of whether the commands
fail due to check failure or a runtime exception, any failure during an
action causes the published commands to not be accepted into the graph.
For example, this action will never successfully publish a command:

```
action do_nothing() {
    publish SomeCommand{}
    check false
}
```

And neither will this:

```
command FailCommand {
    fields {
        fail bool
    }

    // omit seal and open for example

    policy {
        check !this.fail
    }
}

action do_nothing_harder() {
    publish SomeCommand{}
    publish FailCommand{ fail: true }
}
```

## Queries and Iteration

For fact queries that can match or operate on multiple facts, we define
an ordering over their key values. The first key field has priority,
then the second, etc, and fields are sorted in order defined by this
table.

| Type     | Order |
|----------|-------|
| `int`    | ascending numerically |
| `string` | ascending by unicode codepoint, the leftmost character is most significant |
| `bytes`  | ascending by byte value, the leftmost byte is most significant |
| `bool`   | `false`, then `true` |
| `id`     | ascending by byte value, the leftmost byte is most significant |
