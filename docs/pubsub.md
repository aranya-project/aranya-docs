# Arana Pubsub

**experimental release spec**: this spec is for the experimental release of pubsub. 
experimental releases are subject to breaking change or removal at any time. by default
no promises are made about the continued support of experimental releases.

Aranya pubsub provides the capability for devices to broadcast messages on the graph with 
a given topic. Other devices can receive these messages and can choose to use them to take 
action, change state, or ignore. All pubsub activity will take place on a single graph. The 
initial version will also not implement features like confidential channels; all pubsub messages 
are put in plaintext on the graph.


effect dedupe: store max cut, dont pass along duplicated effects. persist across restarts


# Requirements

- Each device's messages are well ordered with respect to their own messages
- Devices that do not publish well ordered messages are considered incoherent ( mark as incoherent as instead )
- Effects are issued one time, even if commands are reordered or daemon is restarted
- Write controls based on labels

# API

- broadcast_message(message string, label id)

# Development

- need is_ancestor(child, target) FFI
  - returns true if target is an ancestor of child
- need deduplication for message effects in case they get reemitted.
  - This will require persistent storage of the max_cut of the commands


# Coherence

- Initial version has simple coherence monitoring
- Initial version has no coherence recovery

The initial version will have a simple coherence monitoring appraoch with no mechanism for 
recovery. A device becomes incoherent when:

- It publishes a message on a different branch (merges can reorder commands)
- It publishes a message that does not have the previous message as an ancestor


# Open Questions

- Do we reuse the labels from AQC?
- Maximum message size (graph message size max)
- How/where do we mark devices as incoherent? 
  - In messages?
  - New fact?

```policy

use perspective 

fact Incoherent[device id]=>{msg1 id, msg2 id} // address (head + max cut)
fact PrevMessage[device id]=>{message id} // address (head + max cut)

command BroadcastMessage {
  fields {
    message string,
    label_id id,
  }

  policy {
    check team_exists()

    let author = get_valid_device(envelope::author_id(envelope))

    check is_member(author.role)

    // The label must exist.
    let label = check_unwrap query Label[label_id: this.label_id]

    // check permissions
    check exists AssignedLabel[label_id: label.label_id, device_id: author.device_id]

    // get the previous message
    // TODO: this scheme doesnt work, we need the action to provide the prev message id
    let prev_message_id = check_unwrap query PrevMessage[author.id]
  
    finish {
      // is this right? we need to know that the most recent message from this device is 
      if !perspective::is_ancestor(prev_message_id) {
        // device is incoherent
      } else {
        // device is coherent
        // update lastmessage
        emit BroadcastedMessage {
          message: this.message,
          label_id: this.label_id,
        }
      }
    }
  }
}

effect BroadcastedMessage {
    sender id,
    message string,
    label_id id,
    incoherent bool,
}

effect DeviceIncoherent {
  device_id id,
}

command QueryDeviceCoherence {
  ...
}


```
