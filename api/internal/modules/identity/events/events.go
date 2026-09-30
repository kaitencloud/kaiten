// Package events declares the identity module's outbox events.
//
// The module emitted none before the Platform API: creating a service account or
// a tenant-issued token changes only who can call the API, and the tenant
// performing it already knows it happened. A platform-issued credential is
// different -- it is authority the platform granted itself inside somebody else's
// organization -- so the tenant is told, through the same outbox the rest of the
// product publishes from.
package events

import "github.com/kaitencloud/kaiten/api/internal/infrastructure/events"

// SystemOrganizationTokenIssued is emitted when a platform credential mints an
// organization-scoped credential for system:kaiten inside one tenant, carrying
// organization_id = that tenant.
//
// Expect volume. With the SDK's auto-refreshing token source at a 15-minute TTL
// this is roughly 120 events per day per process per organization (see plan §I's
// row arithmetic); at a one-hour TTL, 24. A burst of these is the normal shape of
// a long-lived integration refreshing its credential, not an incident.
var SystemOrganizationTokenIssued = events.New(
	"SYSTEM_ORGANIZATION_TOKEN_ISSUED",
	"com.kaiten.identity.v1.system_token_issued",
)
