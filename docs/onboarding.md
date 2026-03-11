
# ONBOARDING


Goal: admin prepares join material beforehand and provides it to the onboarding server. The admin also provides the new device with a secret it can use to retrieve the information from the onboarding server asynchronously and use that information to join the team.

actors:
1. onboarding server
2. admin
3. new member

### Sequence

1. prepare onboarding info
	1. create one time join key (asymmetric)
	2. create signed device certificate
	3. create onboarding bundle
		1. create 11 word phrase
		2. derive mailbox ID (128bits)
		3. derive symmetric encryption key for onboarding bundle
		4. derive authenticator that the new user will use to authenticate to the onboarding server
		5. encrypt certificate + private key
		6. encrypt one time join keypair
		7. encrypt pairing/syncing info
		8. encrypt team ID
	4. post one-time onboarding public key to graph (AllowSelfJoinTeam)
	5. send onboarding bundle to onboarding server, with mailbox ID, encrypted payload, and HMAC of authenticator against mailbox ID
	6. send 11words to new user
2. new user receives 11 words
	1. derive mailbox ID
	2. derive symmetric encryption key for onboarding bundle
	3. fetch encrypted onboarding bundle using mailbox ID and authenticator (sends authenticator and mailbox ID, server computes HMAC(auth, mailbox ID))
	4. decrypt certificate + private key
	5. decrypt one time join keypair
	6. decrypt pairing/syncing info
	7. decrypt team ID
3. new user publishes SelfJoinTeam command

Policy Changes:

- command for adding pub one time key to graph
- command for joining team via one time key

notes: if a AllowSelfJoinTeam key is used by two different accounts, both should be invalid. 

```mermaid
sequenceDiagram
    participant Admin
    participant Graph as Team Graph
    participant OBS as Onboarding Server
    participant NewUser as New Member

    Note over Admin: 1. Prepare onboarding info
    Note over Admin: 1.1 Create one-time join keypair (asymmetric)
    Note over Admin: 1.2 Create signed device certificate
    Note over Admin: 1.3 Create onboarding bundle
    Note over Admin: Generate 11 word phrase
    Note over Admin: Derive mailbox ID from 11 words
    Note over Admin: Derive symmetric encryption key from 11 words
    Note over Admin: Derive authenticator from 11 words
    Note over Admin: Encrypt: certificate + private key,<br/>one-time join keypair,<br/>pairing/syncing info,<br/>team ID

    Admin->>Graph: 1.4 Post one-time onboarding public key (AllowSelfJoinTeam)
    Admin->>OBS: 1.5 Send onboarding bundle (mailbox ID, encrypted payload, HMAC of authenticator)
    Admin-->>NewUser: 1.6 Share 11 word phrase (out-of-band)

    Note over NewUser: 2. Receive 11 words
    Note over NewUser: 2.1 Derive mailbox ID
    Note over NewUser: 2.2 Derive symmetric encryption key
    Note over NewUser: 2.3 Derive authenticator
    NewUser->>OBS: 2.3 Fetch onboarding bundle (mailbox ID + authenticator)
    OBS-->>NewUser: Return encrypted onboarding bundle
    Note over NewUser: 2.4 Decrypt certificate + private key
    Note over NewUser: 2.5 Decrypt one-time join keypair
    Note over NewUser: 2.6 Decrypt pairing/syncing info
    Note over NewUser: 2.7 Decrypt team ID

    NewUser->>Graph: 3. Publish SelfJoinTeam command (using one-time key)
```

Open questions:
- how do we auth the admin to be able to create credentials? 
	- ANSWER: use PKI. admin needs a signed certificate to talk to the onboarding server and leave a drop. the PKI is only needed for creating a drop. consuming a drop can be based on the secret code.
	- OR: onboarding server is aranya node/role and directly talks to the graph. 

- how does the new device actually publish the self join command? 
	- ANSWER: the drop includes a sync peering point. with a valid certificate + sync peering point + team ID, the new device can sync the graph but cannot participate until they post their SelfJoinTeam command. 

- how do the existing devices receive the SelfJoinTeam command?
	- no idea. they have no way of knowing the address of the new device. does the new member post their sync address in the SelfJoinTeam command?
	- keeping this out of scope ofr the current version



CHANGES:

need to derive from the 11words:
	1. mailbox ID (128bits)
	2. symmetric encryption key for onboarding bundle
	3. authenticator (used to validate the sender actually had the 11words, and didnt just steal the key?)
