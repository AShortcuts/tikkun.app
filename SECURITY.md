# Security Policy

## Security maintainer

**Adam Niyazov ([AShortcuts](https://github.com/AShortcuts)) is the lead developer and security maintainer of [Tikkun Reader](https://github.com/AShortcuts/tikkun.app).** He is responsible for security maintenance of this project, including its web application, native iOS integrations, software-update mechanisms, and supporting services under his control.

Tikkun Reader builds on Akiva Gordon's tikkun.io. This policy covers the AShortcuts-maintained project; it does not designate responsibility for the upstream project or third-party dependencies.

## Responsibilities

The security maintainer is responsible for:

- Receiving and triaging vulnerability reports, assessing impact, and coordinating remediation and disclosure.
- Reviewing security-sensitive application code, dependencies, native interfaces, and service configuration.
- Maintaining update authenticity and integrity checks, native-build compatibility checks, and recovery procedures.
- Maintaining download-source restrictions, input validation, and privacy boundaries for diagnostics and analytics.
- Managing release signing, distribution configuration, and security-related release verification.

The repository contains implementations and tests for signed update verification, restricted native media downloads, bounded analytics payloads, and build-workflow permissions. These controls are maintained as part of the project; their presence is not a claim of independent certification or an absence of vulnerabilities.

## Supported scope

| Component | Security support |
| --- | --- |
| Current production website at tikkunreader.com | Reports accepted; fixes delivered through the website release process. |
| Latest publicly released Tikkun Reader iOS app | Reports accepted; fixes delivered through a compatible content update or a new app release, as appropriate. |
| Current source on the develop branch | Reports accepted, including issues in unreleased changes. |
| Older app versions, historical commits, and experimental tools | Reports welcome, but fixes may require upgrading; no commitment to backport fixes. |

Third-party services and upstream projects are outside this policy's ownership scope. Reports involving a dependency used by Tikkun Reader are welcome so its impact on this project can be assessed and coordinated with the relevant maintainer.

## Reporting a vulnerability

Email **[ashortcutst@gmail.com](mailto:ashortcutst@gmail.com)** with the subject **Tikkun Reader security report**.

Please include:

- The affected component, version or commit, and platform.
- A description of the vulnerability and its expected security impact.
- Minimal reproduction steps or a proof of concept using your own data or a local test environment.
- Relevant logs or screenshots with credentials, personal information, and other sensitive data removed.
- Your preferred contact details and whether you would like public credit after coordinated disclosure.

Do not post unpatched vulnerability details in public issues. Keep secrets, personal data, and sensitive exploit material out of the initial email; describe the material so an appropriate way to exchange it can be agreed.

## Handling and disclosure

Reports are reviewed by the security maintainer. When a finding is confirmed, remediation is prioritized according to impact and exposure. The maintainer will coordinate reproduction, affected versions, a fix or mitigation, and appropriate public disclosure with the reporter. This independently maintained project does not offer a guaranteed response time or a paid bug-bounty program.

Where appropriate, published advisories will identify affected and fixed versions and acknowledge the reporter with their consent. A CVE may be requested for a qualifying vulnerability; assignment is not guaranteed.

## Testing boundaries

Use local copies, your own devices, and data you control when reproducing findings. Contact the maintainer before testing production services. This policy is a reporting channel, not blanket authorization to test live infrastructure or third-party systems.

Do not access another person's data, disrupt service, perform denial-of-service testing, use social engineering, or retain sensitive material beyond what is necessary to explain a finding. If sensitive data is encountered unexpectedly, stop and report the circumstances privately.
