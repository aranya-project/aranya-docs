# delete

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
delete FooCounter[deviceID: myId]
delete FooCounter[deviceID: myId]=>{count: 1}
```

`delete` takes an existing fact and removes it. It has two forms.

In the first form, the value fields are omitted, and it will delete the
fact matching the key fields regardless of its value.

In the second form, All fields must be specified. This will delete the
fact that matches the key and value fields, similarly to how it works in
`update`.

In either case, if the values specified do not match anything, it is an
error and will terminate policy execution with a runtime exception.
Deleting a fact that has not been defined by schema will fail with a
compile error.

<div class="warning">

Prefix deletion is not yet supported in the policy VM. So a request to delete all matching records like:

```
delete FooCounter[deviceId: ?]
```

Will not delete all facts as expected.

</div>