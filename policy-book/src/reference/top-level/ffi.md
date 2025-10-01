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

Because policy may be evaluated more than once or never committed,
imported functions should not have side effects and rely only on
constant external state. In computer science parlance, they should be
"pure".

In a linear history of commands, each command will only be evaluated
once. But because Aranya allows divergent branches of commands that are
automatically merged, new commands can appear in the history where they
weren't before, prompting reevaluation of commands that occur later in
the braid.

Suppose a command uses FFI to increment a value in an external database.
When the command is reevaluated after a merge, that increment will
happen again, causing double-counting. Alternatively, if a command is
evaluated but not committed there will be over-counting.

If you need to keep track of state in response to commands, you should
maintain that state external to Aranya by responding to
[effects](effects.md).