// Package suggestusers lists live users whose external id starts with a prefix, so
// kaiten-admin-tools can complete the external-id flags its destructive commands
// take.
//
// It has no endpoint.go and could not acquire one. A prefix search over a global
// user table, keyed on an identity provider's subject, is a directory: it answers
// "who holds an account on this deployment" to whoever can reach it, across every
// tenant, which is the enumeration the Platform API's invisibility rules exist to
// prevent. No scope would make that safe, because the objection is not to the
// caller's authority but to the question — and unlike resolveuser there is not even
// a derivable client-side substitute, since a prefix names no one in particular.
//
// What makes it legitimate here is the position of its caller: an operator at a
// shell on this deployment's own database, about to name a user to a command that
// cannot be undone, who can already read the table. Reachable only through
// kaiten.InProcess.
package suggestusers

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/users/infrastructure/db"
)

// maxSuggestions is the ceiling on how many candidates one call returns.
//
// It lives here rather than with the caller because the query demands a LIMIT and
// ListLiveUsersByExternalIDPrefix's own comment says why: a completer runs on a
// keystroke against a table whose size is the deployment's user count, and a shell
// menu has a length past which every further entry is noise. The prefix the operator
// has already typed is what narrows the set; this only bounds what happens before
// they type one.
const maxSuggestions = int32(200)

// Candidate is one suggestion: the value an operator would type, plus what they need
// in order to tell two opaque provider ids apart.
//
// A type local to this package rather than a users/schema one, and deliberately not
// the first entry in a users/schema that does not exist: the module publishes no user
// model on purpose (see the package comment on users), and this is not one. It is
// three columns chosen to render a menu line.
type Candidate struct {
	ExternalID string
	Name       string

	// Email is nil for a user whose provider supplied none. Nil and empty mean the
	// same thing to the caller, which is that there is no address to show.
	Email *string
}

type UseCase struct {
	repository *QueryRepository
}

func NewUseCase(queries *db.Queries) *UseCase {
	return &UseCase{repository: NewQueryRepository(queries)}
}

// Execute returns at most maxSuggestions live users whose external id starts with
// externalIDPrefix, ordered by external id.
//
// Live users only, which is the one place this differs from resolveuser and differs
// for the same reason it resolves them: the commands these suggestions feed operate
// on a user who is still there, so offering a deleted one would walk the operator
// into an error the completion invited.
func (h *UseCase) Execute(ctx context.Context, externalIDPrefix string) ([]Candidate, error) {
	return h.repository.SuggestUsers(ctx, externalIDPrefix, maxSuggestions)
}
