// Package ensureorganization converges on the organization an external identity
// provider describes, creating it if it is not already there.
//
// It is reached three ways, because "ensure this organization" is asked from three
// positions. JIT provisioning ensures the organization a token's claims name while
// resolving that token, which is what turns a trusted claim into a tenant on first
// login; and kaiten-admin-tools ensures one so a stack can be prepared before the
// API is listening -- there is no request to JIT-provision from at that point, and
// minting a credential into an organization requires the organization to exist
// first. Neither of those two has a credential to authorize the call with, so both
// go through kaiten.InProcess, whose caller type carries none.
//
// The third is the Platform API's ensure-organization (endpoint.go), for the caller
// that does hold one: a bootstrapper outside the cluster, creating the organization
// it is about to mint into. That it exists does not weaken the case for the other
// two -- it is that case restated from the other side. An operation reachable only
// where no credential exists would leave a credentialed caller no way to ask, and
// the answer to that is not to hand it the database.
//
// It emits no event, unlike every other write in this module. Its first caller
// runs on the authentication path of every request, where the organization almost
// always already exists, so an event on the no-op upsert path would fan a webhook
// out per login and an event only on the insert path would be a rule this package
// cannot state from the row it gets back. Provisioning stays event-neutral, which
// is also what it is today.
package ensureorganization

import (
	"context"
	"strings"

	"github.com/kaitencloud/kaiten/api/internal/modules/organization/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/schema"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// ErrCodeMissingExternalID is returned for an external id that is empty, or is
// whitespace that trims to empty.
//
// The check is here rather than in each driver because the failure it prevents is a
// row: an empty string derives a perfectly valid uuid, so an unguarded call would
// create a nameless tenant that every later empty call then converges on. JIT and
// kaiten-admin-tools both reject an empty id before reaching this point and are
// unaffected; the endpoint's minLength stops the empty string but not " ".
const ErrCodeMissingExternalID = "Organization.MissingExternalID"

type UseCase struct {
	repository *CommandRepository
}

func NewUseCase(queries *db.Queries) *UseCase {
	return &UseCase{repository: NewCommandRepository(queries)}
}

// Execute upserts the organization and returns the resulting row.
//
// No transaction is opened: this is one statement, which is its own atomic unit.
// A caller that needs the organization written atomically with something else is a
// caller this package does not have -- JIT ensures the organization before it has
// a user to attach, and kaiten-admin-tools and the endpoint both ensure one and
// stop.
//
// The AFTER INSERT trigger on `organization` gives system:kaiten its membership,
// so an organization that returns from here is immediately mintable-into.
//
// Both inputs are trimmed here rather than by each driver. Whitespace around an
// external id would make two spellings of one tenant, and normalizing it in the
// one place that writes the row is what keeps that from depending on which driver
// called.
func (h *UseCase) Execute(ctx context.Context, cmd *Command) (*schema.Organization, error) {
	externalID := strings.TrimSpace(cmd.ExternalID)
	if externalID == "" {
		return nil, kaitenerrors.Validation(
			ErrCodeMissingExternalID,
			"the organization's external id is required",
		)
	}

	return h.repository.EnsureOrganization(ctx, externalID, strings.TrimSpace(cmd.Name))
}
