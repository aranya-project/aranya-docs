## Motivation

Enable users of the aranya-core crates (open-source community and external customers) to upgrade to newer versions without encountering compilation errors. The primary user workflow is **runtime + sync integration**; this plan prioritizes stabilizing the APIs on that critical path.

## Stability Guarantees
  
- **Strict semver**: No breaking changes without a major version bump (e.g., `1.x` -> `2.x`).

- **Updates**: Stable crates should receive backward compatible bug fixes, vulnerability patches, and potentially new features that can be added in a backward compatible way.

- **Versioning**: Per-crate decision on whether to bump to `1.0` or remain at `0.x` based on whether the team decides a crate is ready.

- **Timeline**: ???

## Release Strategy

Stabilization will proceed in **two phases**:

| Phase                   | Scope                                                                                      | Goal                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| **Phase 1 (Immediate)** | Runtime, sync, storage, crypto engine, FFI modules, policy ifgen, Aranya IDs               | Stabilize the APIs users touch for the runtime + sync workflow to minimize compilation errors. |
| **Phase 2 (Follow-up)** | Policy language, sync wire format, compiled policy module format, Policy ID / Policy Store | Stabilize these to allow for stronger backwards compatibility guarantees.                      |

---

## Phase 1: Immediate Work

  
### 1. New User-Facing Crate (name TBD)

Create a new crate that wraps `aranya_runtime::client::ClientState` and the sync protocol, providing a simplified interface for users.

**Rationale**: `ClientState<PS, SP>` is currently generic over two type parameters:

- `PS: PolicyStore` — the policy store (associated types: `Policy`, `Effect`)

- `SP: StorageProvider` — the storage backend (associated types: `Perspective`, `Segment`, `Storage`)

For the initial stabilization, the only supported policy implementation is `VmPolicy` and the only supported storage implementation is `LinearStorageProvider<FM>`.

**Scope**:

- Fix the `PS` type parameter to a concrete `VmPolicy`-based `PolicyStore` implementation. The crate should provide this so users should don't need to implement `PolicyStore` themselves.

- Remain generic over `FM: IoManager` in `LinearStorageProvider<FM>`, allowing users to select their storage backend:

	- `FileManager` — file-backed storage

	- `testing::Manager` — in-memory storage

- The `IoManager` trait itself should be sealed; users cannot provide custom implementations.

- Exposes sync protocol APIs (requester/responder) with serialization/deserialization built in (users should not need to use `postcard` directly).
  
### 2. Sync Protocol APIs (`aranya-runtime`)

- **Hide the wire format**: Add deserialization functions/methods so users do not need to depend on `postcard` to deserialize sync messages. This removes `postcard` from the user-facing API surface.

- **Pull out Sync APIs**: We may be able to pull the current set of APIs for syncing into a separate crate and consider them as stable. The [refactor](#sync-api-refactor) will be a breaking change that will be in a v2 (or the next major version of that crate).
  
**Open questions**:

- [x] Will future sync optimizations change the sync APIs? (Ask Ben.) Example: `SyncResponder::poll` was modified to take `TraversalBuffers`.
	- A: Potentially. The "braid" function will change but other API changes are still TBD.

### 3. Graph Storage (`aranya-runtime`)

- **Seal `IoManager`**: Restrict the `IoManager` trait so only the two existing implementations can be used:

	- `aranya_runtime::storage::linear::libc::imp::FileManager` (File-based)

	- `aranya_runtime::storage::linear::testing::Manager` (In-memory)

- Users pick one of these two; custom `IoManager` implementations are not supported.

- The storage backend traits (`StorageProvider`, etc.) are **not** part of the stability commitment in Phase 1.

### 4. `aranya-crypto` (Partial)


Stabilize only the following from `aranya-crypto`:

- `Engine` trait

- `DefaultEngine` implementation


**Explicitly excluded**: AFC (Aranya Fast Channels) and other internal crypto machinery.

**Action needed**: Audit `aranya-crypto` to identify any other types that leak into the public API of runtime crates.

### 5. Policy Interface Generator (`aranya-policy-ifgen`, `aranya-policy-ifgen-build`)

  
These crates generate Rust bindings from policy definitions. Stabilization is **blocked on fallible actions**:

- The fallible actions feature (actions update their signatures to return results) is designed but not yet implemented.

- The ephemeral action modifier and exported globals are the most recent breaking changes to the language interface.

- Fallible actions will be another **breaking** interface change and must be implemented before these crates can stabilize.


**Dependency**: The policy language interface[^1] must be stable for these crates to be stable.

### 6. FFI Modules (`aranya-*-ffi` crates)

The FFI modules are policy language extensions written in Rust. There are five[^2] core modules:

  

| Crate                    | Purpose                                        |
| ------------------------ | ---------------------------------------------- |
| `aranya-crypto-ffi`      | Sign/verify operations                         |
| `aranya-idam-ffi`        | Identity and access management, key derivation |
| `aranya-device-ffi`      | Device context (current device ID)             |
| `aranya-envelope-ffi`    | Command envelope operations                    |
| `aranya-perspective-ffi` | Graph perspective (head ID)                    |

These crates can be stabilized independently of the policy language itself.

**TODO**: Determine what "stabilization" means concretely for FFI modules.
- [ ] Ask Jonathan M.
	- [ ] Would limiting custom FFIs and only allowing the currently implemented set of FFIs suffice for now?


**[Known issue](https://github.com/aranya-project/aranya-core/issues/618)**: FFI module ordering is fragile. Modules passed to `VmPolicy::new()` **must** be in the same order as the schemas given to the compiler. Incorrect ordering causes silent misbehavior or runtime errors. See [this thread](https://github.com/aranya-project/aranya-core/pull/549/changes#r2914047791) for further context

### 7. Aranya IDs (`aranya-id`)

- [x] **Open question**: Should the `ID` type from `aranya-id` be stabilized? (Ask Jonathan D.)

	- The crate appears to already be stable in practice, so the effort here may be minimal.
	- Answered: Yes.

---
## Phase 2: Follow-up Work

These items are **not** part of the initial stabilization release. They will be addressed in a subsequent release once designs and implementations have settled.

### Policy Language (`aranya-policy-lang`, `aranya-policy-compiler`, `aranya-policy-vm`)

The policy language has several planned **breaking** changes that must land before stabilization:

- Multiple recall blocks

- Disallowing `check` and `check_unwrap` outside of policy blocks

- Fallible pure functions and actions should use the new `Result[T, E]` for return types

- Move custom serialization/deserialization outside of policy code

### Sync API refactor

Proposed but **still under discussion**. The idea is to refactor sync types to use a state machine to drive syncing.

### Sync Wire Format

Stabilizing the wire format becomes important in production environments where devices cannot all upgrade simultaneously. A stable wire format improves backwards compatibility between devices on different versions of the sync crates.

### Compiled Policy Module Format (`aranya-policy-module`)

The module format needs to be updated to include information about the FFI modules required by the compiled module, enabling the VM to validate FFI module presence and ordering at load time rather than failing at runtime.

### Policy ID / Policy Store

Deferred to Phase 2.  We still need more discussion about stabilizing these.

---

## Other Concerns

### Public Dependency Exposure

Types from dependencies that appear in public API signatures create implicit stability commitments: upgrading that dependency becomes a breaking change.

**Known exposure**: `postcard` types are currently visible in sync APIs. Phase 1 addresses this by adding deserialization methods that hide `postcard` from users.

**Action needed**: Audit all Phase 1 crates for other dependency types that leak into public APIs. For each, decide whether to:

1. Wrap the type to hide the dependency.

2. Re-export and allow a dependency to appear in the public API.

3. Replace with an owned type.

### Documentation

Key user-facing APIs must have "rustdoc" documentation before being declared stable. This applies to:

- All public types, functions, and traits in the new user-facing crate.

- Primary entry points in `aranya-runtime` (sync, storage).

- `Engine` and `DefaultEngine` in `aranya-crypto`.

  

Full documentation of all public items is a non-goal for Phase 1; internal-but-public items may remain undocumented.

### User-Implemented Traits Audit
  
**Action needed**: Audit all Phase 1 crates to identify public traits that users are expected to implement. Each such trait is a strong stability commitment (adding required methods is a breaking change). For each trait found, decide whether to:

1. Include it in the stability commitment.

2. Seal it (prevent external implementation).

Refer to [minimal-core](https://github.com/aranya-project/minimal-core/tree/main).

### CI Enforcement

Investigate adding [`cargo-semver-checks`](https://github.com/obi1kenobi/cargo-semver-checks) or equivalent tooling to CI after Phase 1 stabilizes, to catch accidental breaking changes in stable crates.

---
## Open Questions Summary

| Question                                                                                                                                         | Owner                  | Status      |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- | ----------- |
| Should `aranya-id`'s `ID` type be stabilized?                                                                                                    | Jonathan D.            | Answered    |
| Will future sync optimizations affect sync APIs?                                                                                                 | Ben                    | Answered    |
| What does FFI module stabilization mean concretely?                                                                                              | Jonathan M.            | Open        |
| Does we need custom FFIs for this initial stabilization effort?                                                                                  | Declan                 | Open        |
| New user-facing crate name?                                                                                                                      | Team                   | Open        |
| Which crates go to 1.0 vs. stay 0.x?                                                                                                             | Team (per-crate audit) | Open        |
| Migration strategy (release notes)?                                                                                                              | Team                   | Open        |
| What other types from `aranya-crypto` leak into runtime APIs?                                                                                    | Jonathan D. / Steve    | Needs audit |
| Which public traits do users implement across Phase 1 crates? Refer to [minimal-core](https://github.com/aranya-project/minimal-core/tree/main). | Steve                  | Needs audit |
| Which dependency types leak into public APIs?                                                                                                    | Steve                  | Needs audit |

[^1]: The policy language interface consists of: actions, effects, and exported global values.
[^2]: Actually there's a sixth one, aranya-afc-util. That's omitted as we're excluding AFC from this initial stabilization effort