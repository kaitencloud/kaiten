// Package createplatformtoken issues a platform credential -- the orgless `ksm_`
// token that authenticates the Platform API.
//
// It has no endpoint.go, and could not have one: a platform credential is what the
// Platform API authenticates *with*, so an operation that mints the first one
// cannot require one. That is not a gap in the API's coverage, it is the bootstrap
// problem, and the only honest answer to it is an operation that runs in the
// process that owns the database rather than in front of it. Reachable only through
// kaiten.InProcess.
//
// Nothing here consults a caller's scopes, because there is no caller to consult:
// unlike mintorganizationtoken, which can only delegate a subset of the authority
// its parent holds, this operation *creates* authority from nothing. The bound on
// it is the one bound that applies before any credential exists -- possession of
// the database connection string.
//
// Scopes are taken as given and not re-validated. The scopes a caller passes have
// already been through scope.ValidateScopes by whoever parsed them (today, the
// CLI's --scopes flag, which must parse the CSV anyway and so is the only place
// that can report *which* entry was wrong), and a second check here would be a
// duplicate policy that never fires and drifts the day the first one changes.
package createplatformtoken

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/revokeplatformtoken"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/random"
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
	"github.com/kaitencloud/kaiten/api/internal/shared/token"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// slugBase is what every platform credential's slug is generated from. A constant
// rather than something derived from the name, for the reason mintorganizationtoken
// gives: the slug is a server-generated identifier, not a label, so nothing a
// caller supplies may influence it.
const slugBase = "platform"

// credentialBodyLength is the number of random bytes behind the `ksm_` prefix. The
// same length every other Kaiten credential uses -- a platform credential is not a
// stronger secret, it is a differently scoped one.
const credentialBodyLength = 32

// The two UNIQUE indexes an insert here can violate. Discriminating between them
// matters for the same reason it does in mintorganizationtoken: a slug conflict is
// ours to retry with a freshly generated one, while a name conflict is the caller's
// to resolve and retrying it would never help.
const (
	tokenNameIndex = "uq_token_platform_name_active"
	tokenSlugIndex = "uq_token_platform_slug"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
//
// Revoke is this module's own revocation use case rather than a repeat of its SQL,
// so --replace retires a credential the same way `platform-token revoke` does --
// including the cascade onto everything that credential issued, which a local
// UPDATE here would silently skip and leave orphaned.
//
// Uof rather than a pool-bound *db.Queries: with --replace the retirement and the
// insert are one unit, and a rotation that committed half of itself would leave
// either two live credentials of one name or none at all.
type Deps struct {
	Uof    *uow.UnitOfWork
	Revoke *revokeplatformtoken.UseCase
}

type UseCase struct {
	deps Deps
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{deps: deps}
}

// q resolves the sqlc queries bound to whatever DBTX is active for ctx -- the
// transaction Transact opened, or the pool when there is none.
func (h *UseCase) q(ctx context.Context) *db.Queries {
	return db.New(h.deps.Uof.DBTX(ctx))
}

// Execute mints the credential and returns it, plaintext included.
//
// A schema.PlainPlatformToken, and the plaintext is on it because this is the only
// moment it exists: only the hash is stored, so a credential the caller fails to
// capture here is unrecoverable and must be replaced. Nothing in this package logs
// it, wraps it in an error, or puts it in an event payload.
func (h *UseCase) Execute(ctx context.Context, cmd *Command) (*schema.PlainPlatformToken, error) {
	plaintext, err := random.GeneratePrefixed(token.PrefixPlatform, credentialBodyLength)
	if err != nil {
		return nil, fmt.Errorf("failed to generate a platform credential: %w", err)
	}

	hashed, err := token.Hash(plaintext)
	if err != nil {
		// Deliberately wraps nothing derived from the plaintext.
		return nil, fmt.Errorf("failed to hash the platform credential: %w", err)
	}

	lookupHash := token.LookupHash(plaintext)

	// One transaction per attempt, opened inside the retry rather than around it: a
	// slug collision aborts the transaction it happened in, so a retry reusing it
	// would fail on "current transaction is aborted" instead of on the fresh slug.
	// Same reasoning, at more length, in mintorganizationtoken.Execute -- and the
	// same consequence: nothing may compose this handler into an outer unit of work.
	attempt := func(resolvedSlug string) (*schema.PlainPlatformToken, error) {
		var minted *schema.PlainPlatformToken

		err := h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
			if cmd.Replace {
				// Joins this transaction, so the predecessor's retirement and its
				// successor's insert commit together. Retiring first is what makes the
				// name free for the insert below -- the UNIQUE index is on active rows
				// only.
				revoked, err := h.deps.Revoke.RevokeIfActive(ctx, cmd.Name)
				if err != nil {
					return err
				}
				if revoked > 0 {
					slog.InfoContext(ctx, "replacing an active platform credential",
						"name", cmd.Name, "revoked_credentials", revoked)
				}
			}

			row, err := h.q(ctx).CreatePlatformToken(ctx, db.CreatePlatformTokenParams{
				Hash:       hashed,
				LookupHash: lookupHash,
				ExpiresAt:  pgtime.TimePtrToPgTimestamp(cmd.ExpiresAt),
				Scopes:     cmd.Scopes,
				Name:       cmd.Name,
				Slug:       resolvedSlug,
			})
			if err != nil {
				return translateInsertError(err, cmd.Name, resolvedSlug)
			}

			// No outbox event. There is no organization this could belong to --
			// outbox_events.organization_id is NOT NULL with an FK to organization, and
			// a platform credential deliberately has no organization -- and no tenant
			// has a reason to be told that the operator of the deployment issued
			// themselves a credential. A first-class orgless audit sink is the open
			// follow-up for exactly this.
			//
			// RevokedAt stays nil: the credential is live, and this is the moment it
			// was born.
			minted = &schema.PlainPlatformToken{
				PlatformToken: schema.PlatformToken{
					ID:        row.ID,
					Name:      row.Name,
					Slug:      row.Slug,
					Scopes:    row.Scopes,
					CreatedAt: row.CreatedAt.Time,
					ExpiresAt: pgtime.PgTimeStampToTimePtr(row.ExpiresAt),
				},
				Value: plaintext,
			}
			return nil
		})
		if err != nil {
			return nil, err
		}

		return minted, nil
	}

	// GenerateUnique's random suffix makes a slug collision astronomically unlikely
	// but, per its own doc comment, not impossible -- and a caller has no way to fix
	// one, since it did not choose the slug. Retry with a fresh one.
	return slugutil.Retry(
		slugutil.DefaultMaxAttempts,
		func() (string, error) { return slugutil.GenerateUnique(slugBase) },
		attempt,
	)
}

// translateInsertError maps what the insert can fail with. No branch echoes the
// plaintext -- not in a message, not in a log field, not in a wrapped error.
func translateInsertError(err error, name, slug string) error {
	if errors.Is(err, pgx.ErrNoRows) {
		// The owner is resolved inside the INSERT by external id, so zero rows means
		// system:kaiten is not in the database: the migration that creates it has not
		// been applied, or something renamed it. A driver that can offer remediation
		// advice -- "run the migrations" -- should add it when it wraps this; naming
		// a binary from inside a module would be advice this package cannot know is
		// true.
		return apierrors.Conflict(
			"CreatePlatformToken.PlatformIdentityMissing",
			"the system:kaiten platform identity does not exist",
		)
	}

	if apierrors.IsUniqueViolationOnConstraint(err, tokenSlugIndex) {
		// Wrapped in slugutil.ErrConflict so Retry regenerates. If every attempt
		// collides, this is what the caller finally sees.
		return apierrors.Wrapf(
			slugutil.ErrConflict, apierrors.KindConflict,
			"CreatePlatformToken.SlugConflict",
			"a platform credential with slug %q already exists", slug,
		)
	}

	if apierrors.IsUniqueViolationOnConstraint(err, tokenNameIndex) {
		return apierrors.Conflict(
			"CreatePlatformToken.NameConflict",
			fmt.Sprintf("platform token %q already exists and is active; "+
				"revoke it, choose another name, or replace it", name),
		)
	}

	return fmt.Errorf("failed to create the platform credential %q: %w", name, err)
}
