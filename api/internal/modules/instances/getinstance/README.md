# Instance details and assigned license term

`GET /api/instances/{instanceSlug}` retrieves an existing instance and requires
`read:instances`. Organization comes from the authenticated caller. Missing or
foreign instances return `404` with `GetInstance.NotFound`; authentication and
scope failures remain `401` and `403` before lookup. Use the verified Core gateway,
never the unverified internal listener.

The existing flat Instance representation keeps `licenseId`, `licenseSlug`,
`startLicenseDate`, `endLicenseDate` and operational `status`. Detail GET also
returns the read-only member:

```json
{
  "licenseTerm": {
    "status": "ACTIVE",
    "evaluatedAt": "2026-11-01T12:00:00Z"
  }
}
```

This is an excerpt, not a separate resource. All three term states accompany a
successfully retrieved instance (`200`): `NOT_STARTED` before the start, `ACTIVE`
at or after the start and strictly before the end, `EXPIRED` at or after the end.
Term expiry does not erase the instance or deny its retrieval. The UTC database
clock shared with entitlement windows supplies evaluatedAt, never caller input
or the application clock. Success includes `Cache-Control: no-store`.

The member is always present on successful detail GET, omitted on list, create,
event and GraphQL representations, and cannot be set through writes. Existing
UTC-normalizing create/update behavior preserves RFC3339-offset instants; this
does not repair historical records written with an incorrect offset. Catalog
DRAFT/ARCHIVED assignments, operational status and commercial lifecycle stage
do not change the term state of an existing assignment.

Lookup, clock, incomplete stored-term, missing assigned-license slug or resource
hydration failures do not return a partial resource: existing private Huma errors
retain non2XX status and correlated internal diagnostics. This point-in-time read
is not a durable authorization token. HTTP no-store does not invalidate an
application cache; consumers needing current term data must retrieve it afresh.
No billing, protected-operation expiry policy, OFREP or usage behavior is changed.
