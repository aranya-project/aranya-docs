
## Appendix C: Notes and Post-MVP information

Embedded devices that implement a subset of Aranya library should still be able to sync with
clients that have the full product integrated. AFC should also be compatible between subset 
implementations and the full implementation. This compatibility is planned for Post-MVP.

## TODO: Post-MVP (unordered)

Ideally, embedded devices that implement a subset of Aranya library should still be able to sync with
clients that have the full product integrated. AFC should also be compatible between subset implementations
and the full implementation. This compatibility is Post-MVP.

### Peer Config

Include static peer config (e.g., using JSON) so that fewer API calls will 
be needed to set up new devices. https://github.com/aranya-project/aranya-docs/pull/24/files#r1915620683

### Onboarding

We will provide an additional optional onboarding API:

- `CreateInvite(server address, team_id) -> Invite code` - create an invite code that will be sent 
to a device to onboard.
- `PollInvite(server address, Invite Code) -> Option<Device key>` - check the status of an invite  
code, returns the device ID of the device that joined using that code.
- `Join(server address, Invite Code, Device Key) -> Result<team_id>` - join a team using an invite  
code, returns the team_id of the team that was joined.

The goal of this onboarding API is to simplify the process of onboarding a user/device by providing 
an invite code instead of passing a KeyBundle.

### API

- `IsPresent(command_id, max_cut) -> bool` - looks for command ID in the graph.
- `AwaitCommand(command_id)` - waits until command ID is present in the graph. (Post-MVP)
- `Finalization(team_id)` - create a truncation checkpoint of the graph. Any command received after 
a Finalization must be its descendant, otherwise, it will be dropped. Post-MVP. https://github.com/aranya-project/aranya-docs/pull/24/files#r1927632474
  - TODO: include details on minimal implementation?
  - TODO: add ability to propose command to be added to graph after `n`th finalization. Not needed to support base
      functionality of finalization. https://github.com/aranya-project/aranya-docs/pull/24/files#r1927636245 
- Revisit `SetNetworkName` and `UnserNetworkName`.

For the initial implementation in the beta, AFC control messages should be handled
transparently by the client library. In the future, control messages can be passed
to the device to be manually forwarded to the daemon using a different API.


TODO (post-mvp): pass policy through Init command config object.

TODO: (post-mvp?) improving AFC polling in rust API. "Different mechanism for Quic channels will be used. Improving the API for AFC specifically is not part of MVP but if improvements are needed for Quic channel then they might happen for MVP - see Quic channels spec." - YC

TODO (post-mvp): add support for other languages.


- Local Client API: syncing, local device management
  - Access control plane (IDAM control plane): IDAM lifecycle
    - Quic Channels
      - Quic Channels control plane
      - Quic Channels data plane
    - AFC (experimental flag required)
      - AFC control plane
      - AFC data plane
    - Message Broker (later...)
      - Broker control plane
      - Broker data plane
    - On graph messaging (later...)
      - graph messaging control plane (or implicit)
      - data plane (on graph messages)
    - ... additional planes in future versions