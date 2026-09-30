package ensureuser

import "github.com/google/uuid"

// Command is the user to converge on, as an identity provider describes them,
// together with the organization they are authenticating into.
//
// Carrying no struct tags is deliberate: nothing serializes this type, and this
// operation has no wire contract it could describe.
type Command struct {
	// Subject is the identity provider's id for the user, and the only thing that
	// identifies them here. The row's primary key is derived from it
	// (externalid.DeriveUserID), so a re-login converges on the same user rather
	// than creating a second one.
	Subject string

	// Email is the address the provider claims. Empty means it claimed none, which
	// leaves a stored address alone and, on the insert path, mints a synthetic one
	// from the subject -- see provisionedEmailDomain.
	Email string

	// Name is the display name the provider claims. Empty means it claimed none,
	// which leaves a stored name alone and, on the insert path, falls back to the
	// subject.
	Name string

	// OrganizationID is the organization the user is authenticating into, already
	// resolved to an internal id -- ensureorganization is what resolves it, and
	// running before this is what makes the membership below insertable.
	//
	// An internal uuid rather than the provider's external id, because the caller
	// has just been handed one and re-resolving it here would be a second lookup
	// that could disagree with the first.
	OrganizationID uuid.UUID
}
