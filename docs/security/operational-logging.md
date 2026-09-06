# Operational Logging & Security

## Required fields

Structured application logs should contain, where applicable:

- timestamp (UTC)
- log level
- service/module
- request ID / correlation ID
- sanitized event or error code
- HTTP method/path and status for API events
- duration/latency
- non-sensitive resource identifiers needed for investigation

## Never log

Do not log passwords, OTP values, access/refresh JWTs, API keys, provider secrets, session tokens, full payment credentials, or unnecessary sensitive personal data.

Provider requests/responses must be redacted before persistence or diagnostic logging. Error responses must not expose stack traces or secrets to clients.

## Audit and security events

Audit/security records should capture the minimum information needed to answer who/what/when/where questions, using stable internal identifiers rather than raw personal data where possible.

Financial and security actions should retain request/correlation IDs so operators can trace an event across API, worker, payout and webhook processing.

## Retention

Retention is environment- and legal-policy dependent. Production retention must be configured in the external logging/audit system. Repository files must contain policy and configuration examples only, never production credentials or exported personal data.

## Incident handling

When investigating an incident, share sanitized event IDs, timestamps and error codes. Do not paste raw provider payloads, authentication material, OTPs or personal data into tickets, chat or source control.
