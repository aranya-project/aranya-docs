# Aranya Policy Tester

The Aranya Policy Tester is a CLI tool to execute actions and commands
in a production-ish environment, and inspect the emitted effects. It is
intended as a prototyping tool for policy writers so that they can test
a policy design without having to scaffold or continually rebuild a
crate that hosts it. It should be able to load production policy and
execute it in much the same way it works in the [Aranya
daemon](https://github.com/aranya-project/aranya/tree/main/crates/aranya-daemon).

## `aranya-runtime` Requirements

Building a functioning system on
[`aranya-runtime`](https://github.com/aranya-project/aranya-core/tree/main/crates/aranya-runtime)
requires choosing several supporting implementations. The tool
opinionatedly makes the same choices as the Aranya daemon - it uses
`aranya-runtime`'s `VmPolicy` with all production FFIs - `envelope`,
`perspective`, `device`, `crypto`, `idam`, and `afc`. Custom FFIs are
not supported, but may be offered later through customizing the tester
and recompiling.

### Working Directory

Run state for the crypto engine, keystore, and graph storage will be
stored in a "working directory" configurable from the command-line. If
no working directory is specified, the current directory is used. All
data in the working directory will be reused if it is specified in a
later run. In the rest of this document, `<wd>` will be used to indicate
the working directory in paths.

### RNG

`spideroak_crypto`'s RNG (`spideroak_crypto::default::Rng`) will be used
by default. Alternatively, a deterministic RNG can be chosen via a
command-line flag, which also specifies the seed.

### Crypto Engine

The "default" crypto engine (`aranya_crypto::default:DefaultEngine`)
will be used. The root key used by the engine will be randomly generated
and stored under `<wd>/crypto_root_key`.

### Key Store

The tool will use the `aranya_crypto::keystore::fs_keystore`
implementation with data stored in `<wd>/key_store`.

### Graph Storage

This will use a `LinearStorage` implementation with underlying file
manager using the `libc` implementation. Data will be stored in
`<wd>/graph`.

### FFI

`crypto`, `idam`, and `afc` FFIs depend on a key store, and they will
use the implementation specified above.

The `device` FFI needs a device ID specified. One will be randomly
generated and stored in `<wd>/device_id`.

## Run input format

A "run file" format contains an action/command sequence and an optional
additional values section.

The action/command sequence is a list of items, which are either action
calls or raw command structs. The format of these are the same as in the
policy itself (or the `vm_action!()` macro). These calls and structs
will be compiled in the same way as the rest of the policy, which means
they can use policy-defined types and global values.

The additional values section defines values that will be made available
to policy execution as globals (and thus available in the action calls
and command structs described above). This will be able to define any
legal `Value`s supported by the policy VM, including `id` and `bytes`
values that the policy cannot express as literals.

## Operation

The tool will accept a policy file and one or more run files as
command-line arguments.

```
policy-tester [OPTIONS] <POLICY> <RUNFILE> [RUNFILE ...]
```

First it will compile the policy file into a VM. Then for each run file,
it will load the file, define any additional values specified in it,
then execute its sequence of actions and command structs. Additional
values defined in earlier run files will remain defined while executing
later run files, to allow sequences to be composed through multiple
files. For example, you can have one run file that sets up a team, then
several others which perform more specific team manipulations.

Any effects produced will be printed out in the `Display` implementation
for `Value`s, which describes every fields' content, including `id` and
`bytes`. A command-line option will be available to print a separator
between the effects produced by different run files.