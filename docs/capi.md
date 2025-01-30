---
layout: page
title: Aranya Client C API
permalink: "/capi/"
---

# Aranya Client C API

The Aranya Client provides a C API to allow an application to interact with it.

The API includes methods for the following types of operations:
- Create a new Aranya team with unique cryptographic identities
- Add/remove users on a team
- Assign roles to users based on a policy
- Configure peers to sync with so the Aranya DAG stays up-to-date
- Create encrypted AFC channels
- Send encrypted data via AFC channels

## Doxygen Docs

The [Aranya C API](https://github.com/aranya-project/aranya/tree/main/crates/aranya-client-capi) docs are generated with [Doxygen](https://github.com/aranya-project/aranya/blob/main/crates/aranya-client-capi/Doxyfile) and hosted on GitHub pages:
<!-- TODO: generate directory tree automatically -->
{% assign capi_url = 'https://aranya-project.github.io/aranya/capi' %}
<ul>
    <li><a href="{{ capi_url }}/v0.4.0">latest</a></li>
    <li><a href="{{ capi_url }}/v0.4.0">v0.4.0</a></li>
    <li><a href="{{ capi_url }}/v0.3.0">v0.3.0</a></li>
    <li><a href="{{ capi_url }}/v0.2.0">v0.2.0</a></li>
</ul>

The docs are uploaded to each Aranya [release](https://github.com/aranya-project/aranya/releases) and can be generated locally by running `cargo make build-capi-docs` in the [aranya](https://github.com/aranya-project/aranya) repo.

## Example Application

There is an [example application](https://github.com/aranya-project/aranya/tree/main/examples/c) which includes the [header file](https://github.com/aranya-project/aranya/blob/main/crates/aranya-client-capi/output/aranya-client.h) and builds the library into the application with `cmake`. A [CMakeLists.txt](https://github.com/aranya-project/aranya/blob/main/examples/c/CMakeLists.txt) is provided to make it easier to build the library into an application.

Pre-built versions of the library are uploaded (along with the [header file](https://github.com/aranya-project/aranya/blob/main/crates/aranya-client-capi/output/aranya-client.h)) to each Aranya [release](https://github.com/aranya-project/aranya/releases).

After running the example, the locally built library can be found in the `target/release` folder of the [aranya](https://github.com/aranya-project/aranya) repo.
