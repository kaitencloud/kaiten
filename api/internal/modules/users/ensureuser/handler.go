// Package ensureuser converges on the user an external identity provider
// describes, and on their membership in the organization they are authenticating
// into.
//
// It has no endpoint.go, and could not have one: its caller is the authentication
// path itself. JIT provisioning turns a trusted set of claims into a user row while
// resolving the token that carried them, which is strictly before any credential
// this deployment issued exists. Reachable only through kaiten.InProcess.
//
// Two writes, one transaction, in this order: the user, then the membership. The
// order is not incidental -- the membership references the user, and a refusal at
// either step rolls the other back, so a login that is refused leaves neither a
// user nor a membership behind. It emits no event, for the reason
// ensureorganization's package comment gives: this runs per login, and the
// overwhelmingly common case is that there is nothing new to announce.
//
// Nothing here resurrects. A soft-deleted user is refused, not undeleted, and the
// membership port this composes refuses a soft-deleted membership for the same
// reason: re-joining is an explicit operation, not a side effect of authenticating.
package ensureuser

import (
	"context"
	"strings"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/ensuremembership"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// provisionedEmailDomain is the domain a synthetic address is minted under when
// the identity provider claims no email, so a provider that sends only a subject
// still produces a valid row.
//
// The value is historical and is not a knob: rows already carry addresses under
// this domain, and changing it would give an existing user a second, different
// synthetic address the next time they logged in without an email claim.
const provisionedEmailDomain = "@jit.internal"

// Deps lists exactly what this handler needs, instead of the full
// services.Container. Membership is the organization module's own port (see
// ensuremembership) -- this module never imports organization's generated db
// package directly.
//
// Uof rather than a pool-bound *db.Queries: the user and the membership are one
// unit, so the queries are resolved per call from whichever DBTX is active.
type Deps struct {
	Uof        *uow.UnitOfWork
	Membership *ensuremembership.UseCase
}

type UseCase struct {
	deps Deps
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{deps: deps}
}

// Execute upserts the user and their membership, and returns the user's internal
// id.
//
// The id alone, not a user model: its caller needs exactly this -- an internal uuid
// to attach to the principal it is resolving -- and there is no published user
// shape for this module to return. Inventing one for a surface that has no wire
// would be a type with a single field's worth of purpose.
func (h *UseCase) Execute(ctx context.Context, cmd *Command) (uuid.UUID, error) {
	identity := newClaims(cmd)

	var userID uuid.UUID
	err := h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		repo := NewCommandRepository(db.New(h.deps.Uof.DBTX(ctx)))

		id, deletedAt, err := repo.EnsureUser(ctx, identity)
		if err != nil {
			return err
		}
		if deletedAt != nil {
			// Verbatim the code and message JIT provisioning has always answered a
			// deleted user with: it reaches an HTTP client on the first-login path,
			// and rewording it would change a response nothing asked to change.
			return kaitenerrors.Forbidden("Auth.UserDeleted", "User has been deleted")
		}

		// Joins this same transaction: see uow.UnitOfWork.Transact's doc comment on
		// composing another module's public Execute. The refusal it can return for a
		// removed membership therefore rolls back the user row this just wrote, which
		// is what keeps a refused login from provisioning anything.
		if err := h.deps.Membership.Execute(ctx, id, cmd.OrganizationID); err != nil {
			return err
		}

		userID = id
		return nil
	})
	if err != nil {
		return uuid.Nil, err
	}

	return userID, nil
}

// claims is the normalized identity the upsert writes.
//
// It carries each of email and name twice, and the duplication is the whole point:
// email and name are what the row should hold if it is being created, fallbacks
// already applied, while emailClaim and nameClaim are what the provider actually
// said. Empty means "the provider said nothing", which leaves a stored value alone
// -- so the fallbacks are one-time defaults on the insert path and can never
// overwrite what a human later set.
type claims struct {
	subject    string
	email      string
	name       string
	emailClaim string
	nameClaim  string
}

// newClaims trims what the provider sent and applies the insert-path defaults.
//
// Trimming happens here rather than in each driver: whitespace around a subject
// would make two spellings of one identity, and normalizing it where the row is
// written is what keeps that from depending on which driver called.
func newClaims(cmd *Command) claims {
	subject := strings.TrimSpace(cmd.Subject)
	emailClaim := strings.TrimSpace(cmd.Email)
	nameClaim := strings.TrimSpace(cmd.Name)

	email := emailClaim
	if email == "" {
		email = subject + provisionedEmailDomain
	}

	name := nameClaim
	if name == "" {
		name = subject
	}

	return claims{
		subject:    subject,
		email:      email,
		name:       name,
		emailClaim: emailClaim,
		nameClaim:  nameClaim,
	}
}
