package ensureuser

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/pkg/externalid"
)

// userEmailConstraint is the UNIQUE constraint on "user".email. A violation of it
// means the claimed address already belongs to a different external identity, which
// is a conflict between two identity-provider subjects and not something this
// operation can resolve.
const userEmailConstraint = "user_email_key"

type CommandRepository struct {
	repository *db.Queries
}

func NewCommandRepository(repository *db.Queries) *CommandRepository {
	return &CommandRepository{repository: repository}
}

// EnsureUser derives the row's id from the subject and upserts it, returning the
// user's id and their deleted_at -- nil for a user who is live, whether just
// created or already there.
//
// Deriving rather than generating is what makes the operation idempotent without a
// read: the same subject always produces the same uuid, so a concurrent second
// caller collides on the primary key it was going to write anyway and takes the
// ON CONFLICT branch.
func (r *CommandRepository) EnsureUser(
	ctx context.Context, identity claims,
) (uuid.UUID, *time.Time, error) {
	result, err := r.repository.EnsureUser(ctx, db.EnsureUserParams{
		ID:         externalid.DeriveUserID(identity.subject),
		ExternalID: identity.subject,
		Email:      identity.email,
		Name:       identity.name,
		EmailClaim: identity.emailClaim,
		NameClaim:  identity.nameClaim,
	})
	if err != nil {
		if kaitenerrors.IsUniqueViolationOnConstraint(err, userEmailConstraint) {
			// Verbatim the code and message JIT provisioning has always answered this
			// with, including the quoted address: it reaches an HTTP client on the
			// first-login path.
			return uuid.Nil, nil, kaitenerrors.Conflict(
				"Auth.EmailAlreadyProvisioned",
				fmt.Sprintf("Email %q is already provisioned for a different identity", identity.email),
			)
		}
		return uuid.Nil, nil, fmt.Errorf("ensure user: %w", err)
	}

	return result.ID, pgtime.PgTimeStampToTimePtr(result.DeletedAt), nil
}
