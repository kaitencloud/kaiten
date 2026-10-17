package caller

import (
	"context"
	"slices"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Organization derives an [OrganizationCaller] from an authenticated request.
//
// This is where the Core API's credential class is decided, and it is the whole of
// that decision: nothing upstream of a handler refuses a class, so two refusals live
// here, with a principal that was never assigned a kind refused along with a platform
// one. The comparison is equality against a named kind, so the absence of a class is
// not silently read as "the Core API, please".
func Organization(ctx context.Context) (OrganizationCaller, error) {
	i, err := principalOfKind(ctx, principal.KindOrganization)
	if err != nil {
		return OrganizationCaller{}, err
	}

	return OrganizationCaller{
		userID:         i.UserID,
		organizationID: i.OrganizationID,
		scopes:         i.Scopes,
	}, nil
}

// Platform derives a [PlatformCaller] from an authenticated request. It refuses
// an organization credential and an unassigned kind identically — see
// [Organization], and principal.ErrCodeWrongCredentialKind for why both surfaces
// answer with one code.
func Platform(ctx context.Context) (PlatformCaller, error) {
	i, err := principalOfKind(ctx, principal.KindPlatform)
	if err != nil {
		return PlatformCaller{}, err
	}

	return PlatformCaller{
		platformTokenID: i.PlatformTokenID,
		scopes:          i.Scopes,
	}, nil
}

// PublishableKey derives a [PublishableKeyCaller] from an authenticated
// request. Every other credential class is refused with the shared
// wrong-credential answer -- see [Organization].
func PublishableKey(ctx context.Context) (PublishableKeyCaller, error) {
	i, err := principalOfKind(ctx, principal.KindPublishableKey)
	if err != nil {
		return PublishableKeyCaller{}, err
	}

	return PublishableKeyCaller{
		organizationID: i.OrganizationID,
		keyID:          i.PublishableKeyID,
	}, nil
}

// CustomerSession derives a [CustomerSessionCaller] from an authenticated
// request. Every other credential class is refused with the shared
// wrong-credential answer -- see [Organization].
func CustomerSession(ctx context.Context) (CustomerSessionCaller, error) {
	i, err := principalOfKind(ctx, principal.KindCustomerSession)
	if err != nil {
		return CustomerSessionCaller{}, err
	}
	if i.CustomerSession == nil {
		// Unreachable from the authenticator, which always sets it; stated so a
		// principal built without it fails closed instead of reading as a
		// session bound to no customer.
		return CustomerSessionCaller{}, kaitenerrors.Forbidden(principal.ErrCodeWrongCredentialKind,
			principal.ErrMsgWrongCredentialKind)
	}

	return CustomerSessionCaller{
		organizationID: i.OrganizationID,
		sessionID:      i.CustomerSession.ID,
		actorID:        i.UserID,
		customerID:     i.CustomerSession.CustomerID,
		customerSlug:   i.CustomerSession.CustomerSlug,
		instanceID:     i.CustomerSession.InstanceID,
		instanceSlug:   i.CustomerSession.InstanceSlug,
		allowedOrigins: slices.Clone(i.CustomerSession.AllowedOrigins),
	}, nil
}

// Static is an [OrganizationCaller] for a driver that knows the identity at
// construction time instead of reading it off a request — the seeder, which
// seeds as a specific user inside a specific organization.
//
// It is the caller-shaped equivalent of currentuser.StaticUserProvider, which it
// replaces: the same two UUIDs, plus the scopes that provider had no way to
// express, so seeding now goes through the same scope check every other driver
// does rather than around it.
func Static(userID, organizationID uuid.UUID, scopes []string) OrganizationCaller {
	return OrganizationCaller{
		userID:         userID,
		organizationID: organizationID,
		scopes:         scopes,
	}
}

// LocalPlatform is a [PlatformCaller] for a process acting as system:kaiten
// without having presented a platform token — admin-tools, run by an operator
// against the database directly.
//
// This constructor grants no authority. A process holding
// KAITEN_DATABASE_CONNECTION_STRING can already do everything the operations
// behind it do, and does exactly that today by issuing the same SQL from cmd/.
// What it changes is the route: the same authority now arrives through the use
// cases, so the invariants they enforce and the outbox events they emit are no
// longer skipped by the second door. Callers pass scope.AllScopes(); a narrower
// set would be a fiction, since nothing checked anything before.
//
// PlatformTokenID is uuid.Nil for the resulting caller — see
// [PlatformCaller.PlatformTokenID].
func LocalPlatform(scopes []string) PlatformCaller {
	return PlatformCaller{
		scopes: scopes,
	}
}

func principalOfKind(ctx context.Context, required principal.Kind) (*principal.Principal, error) {
	i, ok := principal.FromContext(ctx)
	if !ok {
		return nil, errNoIdentity()
	}
	if i.Kind != required {
		return nil, kaitenerrors.Forbidden(principal.ErrCodeWrongCredentialKind,
			principal.ErrMsgWrongCredentialKind)
	}
	return i, nil
}
