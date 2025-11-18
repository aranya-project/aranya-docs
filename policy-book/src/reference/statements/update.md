# update

<div class="right">

| Scope  | |
|--------|----|
| global | ❌ |
| `action` | ❌ |
| `function` | ❌ |
| `policy`/`recall` | ❌ |
| `seal`/`open` | ❌ |
| `finish` | ✅ |
| `finish function` | ✅ |

</div>

```
update FooCounter[deviceID: myId] to {count: 1}
update FooCounter[deviceID: myId]=>{count: 0} to {count: 1}
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
let unused = unwrap query FooCounter[deviceId: myId]
check unused.count == 0
finish {
    update FooCounter[deviceID: myId] to {count: 1}
}
```

Except that this will produce a check error if the `count` is not as
expected.

In either case, attempting to update a non-existent fact is an error and
will terminate policy execution with a runtime exception. Updating a
fact that has not been defined by schema should fail with a compile
error.
