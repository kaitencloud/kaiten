# Assigned license term validation

`GET /api/instances/{instanceSlug}/license-validation` requires `read:instances`.
The organization is derived from the authenticated caller; a missing or foreign
instance returns `404` with code `GetLicenseValidation.NotFound`. Authentication
failures return `401`, and callers without instance-read authority receive `403`
before any instance lookup. Use the trusted Core gateway, never an unverified
internal listener.

```json
{
  "valid": true,
  "status": "ACTIVE",
  "evaluatedAt": "2026-10-30T12:00:00Z",
  "instanceSlug": "restaurant-prod",
  "licenseId": "123e4567-e89b-12d3-a456-426614174004",
  "licenseSlug": "standard-v2",
  "startLicenseDate": "2026-10-01T00:00:00Z",
  "endLicenseDate": "2027-10-01T00:00:00Z"
}
```

## Decision and enforcement

The server uses the database clock shared with entitlement-window decisions and
returns all instants in UTC. Instance create/update normalize RFC3339-offset
inputs to UTC before storing timestamp-without-time-zone fields, preserving the
absolute instant. This does not migrate historical records that were written with
an incorrect offset; such records must be corrected explicitly from their source.
The term interval is **start-inclusive, end-exclusive**:

- `NOT_STARTED`: the evaluation instant precedes the start.
- `ACTIVE`: the instant is at or after the start and strictly before the end.
- `EXPIRED`: the instant is at or after the end.

`valid` is true only for `ACTIVE`. No evaluation instant can be supplied by the
caller. This is a point-in-time read, not a durable authorization token: consumers
must revalidate before protected actions and handle Core unavailability explicitly.
No decision is returned when the lookup or database clock fails.

This endpoint evaluates the term of an **already assigned** license. Catalog
`ARCHIVED` versions remain valid for existing assignments within their term;
`DRAFT` assignments remain supported for testing. Catalog publication, instance
operational status (including `MAINTENANCE`), and free-form commercial lifecycle
stage (including `CHURNED`) are not suspension mechanisms.

Existing OFREP evaluation, entitlement reads and usage reporting intentionally
retain their behavior. Applications enforce this additional authoritative term
decision on their backend alongside real flag and entitlement checks; do not
assume an expired term automatically changes those older endpoint responses.
