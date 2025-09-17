# create

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
create FooCounter[deviceID: myId]=>{count: 0}
```

`create` creates a [fact](../top-level/facts.md) with the given
parameters. The names and types of the values given must match a fact
declaration of the same name. All values must be specified. Attempting
to create a fact which has the same key values as an existing fact is an
error and will terminate policy execution with a runtime exception.
Creating a fact that has not been defined by schema should fail with a
compile error.