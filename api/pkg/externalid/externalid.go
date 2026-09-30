// Package externalid deterministically derives kaiten's internal
// organization/user UUIDs from external identity-provider ids (a
// self-hosted deployment's own IdP, local dev auth). JIT provisioning uses
// this so a new organization or user's internal id is computable, not
// randomly assigned — any caller who already knows the external id (e.g.
// off a JWT claim) can derive the same id locally, no lookup required.
package externalid

import "github.com/google/uuid"

// rootNamespace is the fixed root namespace every deterministic,
// externally-derivable UUID in kaiten descends from. Generated once, fixed
// forever — changing it would silently reassign every already-provisioned
// organization and user a new internal id.
var rootNamespace = uuid.MustParse("eb025416-6f74-4684-97e9-83e99784aaa5")

// DeriveNamespace returns a stable sub-namespace for a given entity domain
// (e.g. "organization", "user"), so the identical external id string used
// across two different entity kinds never produces colliding UUIDs.
func DeriveNamespace(domain string) uuid.UUID {
	return uuid.NewSHA1(rootNamespace, []byte(domain))
}

var (
	OrganizationNamespace = DeriveNamespace("organization")
	UserNamespace         = DeriveNamespace("user")
)

// DeriveOrganizationID deterministically derives kaiten's internal
// organization UUID from an external org id.
func DeriveOrganizationID(externalOrgID string) uuid.UUID {
	return uuid.NewSHA1(OrganizationNamespace, []byte(externalOrgID))
}

// DeriveUserID deterministically derives kaiten's internal user UUID from an
// external user id.
func DeriveUserID(externalUserID string) uuid.UUID {
	return uuid.NewSHA1(UserNamespace, []byte(externalUserID))
}
