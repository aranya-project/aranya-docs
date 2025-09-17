# Foreign Function Interface

```
use crypto
use perspective
```

`use` defines an imported function library, which is provided by the
application. You must call functions from imported libraries with the
fully qualified library name (e.g. `crypto::sign()`). `use` can only be
used in global scope, and all `use` statements must appear before other
statements in the document.

#### The runtime model and FFI functions

Because policy may be executed more than once, imported functions should
not have side effects, or must have some way of managing state that
accounts for the fact that policy may be re-evaluated multiple times.

In a linear history of commands, each command will only be evaluated
once. But because Aranya allows divergent branches of commands that are
automatically merged, new commands can appear in the history where they
weren't before, prompting re-evaluation of later commands.

For example, suppose a command uses FFI to increment a value in an
external database. Without any kind of controls, that increment will
happen again after merging, causing double-counting. A more robust
solution would insert a row with the ID of the command and use a
database-side summing function to calculate the total number of times
the command was sent.

But commands can also be [recalled](commands.md#recall-block), which
effectively invalidates their effect on history. A properly written
command has to account for this, too, and should use a separate FFI
function to alter the database to remove its effect when recalled.

As you can see, this gets complicated and hard to debug, so it's better
to manage state through responding to [effects](effects.md) than using
FFI.