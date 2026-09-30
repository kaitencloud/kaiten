package seedkit

import (
	"context"
	"strings"

	"github.com/google/uuid"

	organizationdb "github.com/kaitencloud/kaiten/api/internal/modules/organization/infrastructure/db"
	organizationschema "github.com/kaitencloud/kaiten/api/internal/modules/organization/schema"
	usersdb "github.com/kaitencloud/kaiten/api/internal/modules/users/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/seeder"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
)

// Membership names one (user, organization) pair a profile wants to exist.
//
// Its own type rather than organizationdb.CreateUserOnOrganizationParams, which it
// used to be: a profile describes what should be true, and the insert params are one
// way of making it so. That distinction is what lets cmd/seeder read a membership
// list -- it does, to decide which dev tokens to write -- without importing a
// module's generated sqlc package.
type Membership struct {
	UserID         uuid.UUID
	OrganizationID uuid.UUID
}

// TokenTarget names one organization and the users who should hold a dev
// token for it. `cmd/seeder`'s tokens command reads these from whichever
// context-specific profile(s) ran (see demo.TokenTargets, saas.TokenTargets)
// instead of hardcoding a single cross-product of users×orgs -- each profile
// is the only thing that actually knows which users it put on which org.
type TokenTarget struct {
	Org   organizationschema.Organization
	Users []UserIdentity
}

// SeedOrgsOptions tunes membership seeding.
type SeedOrgsOptions struct {
	// StaffEmailDomain: every user whose email ends with this suffix is added to
	// every organization. Empty disables it.
	StaffEmailDomain string
	// ExtraMemberships are applied after the staff rule (e.g. explicit non-staff
	// memberships). Duplicates are ignored.
	ExtraMemberships []Membership
}

// SeedOrgsUsersMemberships ensures all organizations and users idempotently,
// then applies the staff-join-all-orgs rule and any explicit memberships.
// Returns externalID->actualID maps for organizations and users.
func SeedOrgsUsersMemberships(
	ctx context.Context,
	sc *seeder.SeederContext,
	orgs []organizationschema.Organization,
	users []UserIdentity,
	opts SeedOrgsOptions,
) (map[string]uuid.UUID, map[string]uuid.UUID, error) {
	orgIDs := make(map[string]uuid.UUID, len(orgs))
	orgIDsByRequestedID := make(map[uuid.UUID]uuid.UUID, len(orgs))
	for _, org := range orgs {
		actualID, err := sc.EnsureOrganization(ctx, organizationdb.CreateOrganizationParams{
			ID:         org.ID,
			ExternalID: org.ExternalID,
			Name:       org.Name,
		})
		if err != nil {
			return nil, nil, err
		}
		orgIDs[org.ExternalID] = actualID
		orgIDsByRequestedID[org.ID] = actualID
	}

	userIDs := make(map[string]uuid.UUID, len(users))
	userIDsByRequestedID := make(map[uuid.UUID]uuid.UUID, len(users))
	for _, user := range users {
		var email *string
		if user.Email != "" {
			email = ptr.To(user.Email)
		}
		actualID, err := sc.EnsureUser(ctx, usersdb.CreateUserParams{
			ID:         user.ID,
			ExternalID: user.ExternalID,
			Email:      email,
			Name:       user.Name,
		})
		if err != nil {
			return nil, nil, err
		}
		userIDs[user.ExternalID] = actualID
		userIDsByRequestedID[user.ID] = actualID
	}

	// Staff (matching domain) join every organization.
	if opts.StaffEmailDomain != "" {
		for _, user := range users {
			if user.Email == "" || !strings.HasSuffix(user.Email, opts.StaffEmailDomain) {
				continue
			}
			for _, org := range orgs {
				if err := sc.EnsureUserOnOrganization(ctx, organizationdb.CreateUserOnOrganizationParams{
					OrganizationID: orgIDs[org.ExternalID],
					UserID:         userIDs[user.ExternalID],
				}); err != nil {
					return nil, nil, err
				}
			}
		}
	}

	for _, membership := range opts.ExtraMemberships {
		membership = resolveMembershipIDs(membership, orgIDsByRequestedID, userIDsByRequestedID)
		if err := sc.EnsureUserOnOrganization(ctx, organizationdb.CreateUserOnOrganizationParams{
			OrganizationID: membership.OrganizationID,
			UserID:         membership.UserID,
		}); err != nil {
			return nil, nil, err
		}
	}

	return orgIDs, userIDs, nil
}

func resolveMembershipIDs(
	membership Membership,
	organizationIDs map[uuid.UUID]uuid.UUID,
	userIDs map[uuid.UUID]uuid.UUID,
) Membership {
	if actualID, ok := organizationIDs[membership.OrganizationID]; ok {
		membership.OrganizationID = actualID
	}
	if actualID, ok := userIDs[membership.UserID]; ok {
		membership.UserID = actualID
	}
	return membership
}
