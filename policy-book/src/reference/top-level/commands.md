# Commands

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
        let fc = unwrap query FooCounter[device: author]

        let new_count = fc.count + this.a
        finish {
            update FooCounter[device: author]=>{count: fc.count} to {count: new_count}
            emit FooEffect {
                a: new_count,
                b: this.b,
            }
        }
    }

    recall {
        finish {
            emit FooError {
                kind: "bad FooCounter state",
                b: this.b,
            }
        }
    }
}
```

Commands define structured data (the `fields` block), rules for
transforming that structured data to and from a transportable format
(`seal` and `open` blocks), and policy decisions for determining the
validity and effects of processing that data (the `policy` and `recall`
blocks).

Policy statements may terminate execution on a variety of conditions,
like a failed check or unwrapping a `None` optional (see
[Errors](../errors.md) for how different kinds of errors affect policy
execution). Policy is transactional - a command is only accepted and
facts are only updated if policy execution reaches the end of a `finish`
block without terminating. Recall blocks allow the production of effects
and mutation of facts after a command is recalled.

Inside a `command` block are several sub-blocks:

## Fields block

The `fields` block defines the fields of the command, which is the data
that gets serialized and transported across the network to other nodes.
This data is accessible in `policy` and `recall` blocks through the
automatically-defined `this` struct. The `fields` block must be
specified even if it is empty.

All types are allowed in fields except for opaque values, the same as
for the [value side of Facts](../top-level/facts.md). Struct fields must
obey the same restrictions. You can use [Struct Definition Field
Insertion](structs.md#struct-definition-field-insertion) to define the
fields of an command with a previously defined struct.

A struct named after the command is automatically created based on the
fields. See [Struct
Auto-definition](../types/structs.md#struct-auto-definition). This
struct is used when `publish`ing a command in an action.

## Seal/Open

The `seal` and `open` blocks perform any operations necessary to
transform an envelope into command fields, and vice versa. `seal` is
automatically called when a command is `publish`ed, and `open` is
automatically called before command policy is evaluated (either when a
command is published, or when it is received via syncing). `seal` and
`open` are required blocks for commands.

These blocks operate like [pure
functions](functions.md#pure-functions) - `seal` has an implicit
argument `this`, which contains the pending command's fields just as it
does in the `policy` block. `seal` should return an envelope.

Conversely, `open` has an implicit argument `envelope`, an [envelope
struct](#envelope-type), and it should return a command struct with the
command's fields.

If `open` does not return a valid command struct, or `seal` does not
return a valid envelope, policy evaluation will terminate with a runtime
exception.

`seal`/`open` are the appropriate place to perform any serialization,
cryptography, or envelope validation necessary as part of this
transformation, but it is not required that they do anything other than
return a valid envelope or command struct respectively. It is valid
(though likely not useful) to do no work at all and return static
values.

When evaluating a policy block, the implicit argument `envelope` is also
available so that properties of the envelope can be obtained.

### `envelope` type

The envelope is a special type which contains a representation of the
"wire format" of the command. It is an opaque type typically defined and
manipulated by an `envelope` FFI specific to the application. For
example:

```
command Foo {
    ...

    open {
        // envelope::do_open turns the opaque envelope into a `bytes`
        // that deserialize turns into a command struct.
        let serialized_struct = envelope::do_open(envelope)
        return deserialize(serialized_struct)
    }

    ...
}
```

The policy writer should not assume any particular structure or
manipulate it directly.

## Policy block

The `policy` block contains statements which query data and check its
validity. The `policy` block must terminate with a `finish` block
(though it can have multiple `finish` blocks in branching paths). The
`finish` block must be specified even if it is empty (e.g. `finish {}`).

The policy block also defines the automatically-defined variables
`this`, which is a struct containing all of the fields for the command
being processed; and `envelope`, described above.

### Finish block

A finish block can contain only [`create`](../statements/create.md),
[`update`](../statements/update.md),
[`delete`](../statements/delete.md), and [`emit`](../statements/emit.md)
statements, as well as call [finish
functions](functions.md#finish-functions). No individual fact
(identified by the fact name and key values) can be manipulated more
than once in a finish block. Doing so is a runtime exception.

Allowed:
```
finish {
    // different facts
    delete Bar[deviceID: myId]=>{}
    create FooCount[deviceID: myId]=>{count: 1}
}

finish {
    // assuming id1 != id2
    create FooCount[deviceID: id1]=>{count: count1}
    create FooCount[deviceID: id2]=>{count: count2}
}
```

Not allowed:
```
finish {
    delete FooCount[deviceID: id3]
    create FooCount[deviceID: id3]=>{count: 1}
}
```

(instead of `delete` and `create` on a fact, you should use `update`)

Additionally, expressions inside finish blocks are limited to named
values and constants. Any calculations should be done outside the
`finish` block.

## Recall block

`recall` blocks are executed when a command of this type is recalled.
When the introduction of new commands causes a command to fail with a
check error, it is recalled. So the `recall` block is a kind of
exception handler for failed policy invariants.

The `recall` block is optional, and if not specified, a "default" recall
will be used that reports a generic check failure to the application.
Likewise, if a `recall` block encounters runtime exception, the default
recall will handle and report it.

Recall blocks can execute the same statements as a the `policy` block,
except for `check` (as its purpose is not to validate anything).
The application interface will mark effects produced in recall blocks
as recall effects, so that they can be distinguished from the same
effects produced in a policy block.

## Attributes

Commands may optionally have an `attributes` block containing one or
more named attributes and their values. Attribute values follow the same
rules as global `let` - their types can only be `int`, `string`, `bool`,
`enum`, `struct` literals (where the structs' fields follow the same
rules), or struct field references.

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