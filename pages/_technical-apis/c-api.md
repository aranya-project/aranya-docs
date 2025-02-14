---
layout: page
title: Aranya Client C API
---

{% assign gh_aranya_url = 'https://github.com/aranya-project/aranya' %}
{% assign capi_url = 'https://aranya-project.github.io/aranya/capi' %}

# Aranya Client C API

The Aranya Client provides a C API to allow an application to interact with it.

The API includes methods for the following types of operations:
- Create a new Aranya team with unique cryptographic identities
- Add/remove devices on a team
- Assign roles to devices based on a policy
- Configure peers to sync with so the Aranya DAG stays up-to-date
- Create encrypted AFC channels
- Send encrypted data via AFC channels

## Doxygen Docs

The <a href="{{ gh_aranya_url }}/tree/main/crates/aranya-client-capi" target="_blank">Aranya C API</a> docs are generated with <a href="{{ gh_aranya_url }}/blob/main/crates/aranya-client-capi/Doxyfile" target="_blank">Doxygen</a> and hosted on GitHub pages:
- <a href="{{ capi_url }}/v0.4.0" target="_blank">latest</a>
- <a href="{{ capi_url }}/v0.4.0" target="_blank">v0.4.0</a>
- <a href="{{ capi_url }}/v0.3.0" target="_blank">v0.3.0</a>
- <a href="{{ capi_url }}/v0.2.0" target="_blank">v0.2.0</a>


The docs are uploaded to each Aranya <a href="{{ gh_aranya_url }}/releases" target="_blank">release</a> and can be generated locally by running `cargo make build-capi-docs` in a local clone of the <a href="{{ gh_aranya_url }}" target="_blank">aranya</a> repo.

## Example Application

There is an <a href="{{ gh_aranya_url }}/tree/main/examples/c" target="_blank">example application</a> which includes the <a href="{{ gh_aranya_url }}/blob/main/crates/aranya-client-capi/output/aranya-client.h" target="_blank">header file</a> and builds the library into the application with `cmake`. A <a href="{{ gh_aranya_url }}/blob/main/examples/c/CMakeLists.txt" target="_blank">CMakeLists.txt</a> is provided to make it easier to build the library into an application.

Pre-built versions of the library are uploaded (along with the <a href="{{ gh_aranya_url }}/blob/main/crates/aranya-client-capi/output/aranya-client.h" target="_blank">header file</a>) to each Aranya <a href="{{ gh_aranya_url }}/releases" target="_blank">release</a>.

After running the example, the locally built library can be found in the `target/release` folder of the locally cloned <a href="{{ gh_aranya_url }}" target="_blank">aranya</a> repo.
