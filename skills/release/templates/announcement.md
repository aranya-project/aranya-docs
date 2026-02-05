# Release Announcement Templates

## Release Start Announcement

Use this template to announce the start of the release process:

```
Starting Aranya release v[VERSION]

The release process for v[VERSION] is now underway. Expected completion: [DATE/TIME].

Key features in this release:
- [Feature 1]
- [Feature 2]
- [Feature 3]

Please hold off on merging non-essential PRs until the release is complete.

Contact [RELEASE_LEAD] with any questions or concerns.
```

## Release Completion Announcement

Use this template to announce a completed release:

```
Aranya v[VERSION] Released

We're pleased to announce the release of Aranya v[VERSION].

## Summary

[1-2 sentence summary of what this release includes]

## New Features

- [Feature 1]: [Brief description]
- [Feature 2]: [Brief description]
- [Feature 3]: [Brief description]

## Bug Fixes

- [Fix 1]
- [Fix 2]

## Breaking Changes

- [Breaking change 1, if any]

## Release Notes

Full release notes: [LINK_TO_GITHUB_RELEASE]

## Documentation

- API documentation: https://docs.rs/aranya-client/latest/aranya_client/
- C API documentation: https://aranya-project.github.io/aranya-docs/capi/

## Feedback

Please report any issues at: https://github.com/aranya-project/aranya/issues
```

## Patch Release Announcement

Use this template for security patch releases:

```
Aranya v[VERSION] Security Patch Released

A security patch has been released for Aranya.

## Summary

This patch addresses [VULNERABILITY_ID] in [AFFECTED_COMPONENT].

## Vulnerability Details

- Advisory: [LINK_TO_ADVISORY]
- Severity: [LOW/MEDIUM/HIGH/CRITICAL]
- Affected versions: [VERSIONS]

## Impact

[Description of the vulnerability and its potential impact. Note if Aranya's code directly uses the vulnerable code path or if this is a defensive measure.]

## Recommended Action

Update to v[VERSION] as soon as possible:
- crates.io: https://crates.io/crates/aranya-client
- GitHub release: [LINK_TO_GITHUB_RELEASE]

## Release Notes

Full release notes: [LINK_TO_GITHUB_RELEASE]
```
