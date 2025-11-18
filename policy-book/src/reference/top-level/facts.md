# Facts

```
fact FooCounter[device id]=>{count int}
immutable fact FooUsed[deviceid id]=>{}
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
| Struct     | no       | yes[^1]    |
| Opaque     | no       | no         |

[^1]: Structs can be used in fact values as long as they obey the same
rules for their constituent field types.

#### Immutable facts

Immutable facts are prefixed with the `immutable` keyword, and can only
be created or deleted, never updated. Updating an immutable fact should
be a compile error.