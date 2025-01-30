---
layout: page
title: Aranya Client C API
permalink: "/"
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

# Doxygen Docs

The C API docs are generated with Doxygen and hosted on GitHub pages.

<!-- TODO: generate directory tree automatically -->
C API Docs:
{% assign capi_url = https://aranya-project.github.io/aranya/capi %}
<ul>
    <li><a href="{{ capi_url }}/v0.4.0">latest</a></li>
    <li><a href="{{ capi_url }}/v0.4.0">v0.4.0</a></li>
    <li><a href="{{ capi_url }}/v0.3.0">v0.3.0</a></li>
    <li><a href="{{ capi_url }}/v0.2.0">v0.2.0</a></li>
</ul>

Doxygen docs are uploaded to each Aranya release here:
[Aranya releases](https://github.com/aranya-project/aranya/releases)

Doxgygen docs can be manually generated from source by running this `cargo make` task in the [aranya](https://github.com/aranya-project/aranya) repo:
`cargo make build-capi-docs`

# Example Application Using The Aranya C API

An example application for interacting with Aranya via the C API is provided here:
[Aranya C Example](https://github.com/aranya-project/aranya/tree/main/examples/c)

To run the example C application, execute this `cargo make` task in the [aranya](https://github.com/aranya-project/aranya) repo:
`cargo make run-capi-example`

# Integrating The C API Into A C Application

In order to integrate the C library into an application, include the [aranya-client.h](https://github.com/aranya-project/aranya/blob/main/crates/aranya-client-capi/output/aranya-client.h) header file and compile the application with the Aranya client library.

Pre-built versions of the library are uploaded (along with the C header) to Aranya releases here:
[Aranya releases](https://github.com/aranya-project/aranya/releases)

The library can be built from source by running the following `cargo make` command in the [aranya](https://github.com/aranya-project/aranya) repo:
`cargo make build-capi`

A [CMakeLists.txt](https://github.com/aranya-project/aranya/blob/main/examples/c/CMakeLists.txt) is provided to make it easier to build the C library into an application using `cmake`.

It is recommended to start with the [Aranya C Example](https://github.com/aranya-project/aranya/tree/main/examples/c) and modify it into another application rather than attempting to build an application from scratch using the C API documentation. 
