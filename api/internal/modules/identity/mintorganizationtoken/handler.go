// Package mintorganizationtoken issues an organization-scoped credential for the
// platform identity inside one named tenant.
//
// This is the operation the whole Platform API exists to make possible: a
// platform credential proves who is calling and never where, so when it must act
// inside a tenant it does not become org-scoped -- it mints a separate, ordinary,
// membership-derived, scope-bounded credential and uses that. The platform
// credential can revoke what it minted (see revokeorganizationtoken, and the
// cascade in §I) but can never exceed it.
package mintorganizationtoken

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"slices"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/pgnotify"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/deletetokenonserviceaccount"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/tokencache"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	"github.com/kaitencloud/kaiten/api/internal/platform/targetorg"
	"github.com/kaitencloud/kaiten/api/internal/shared/random"
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
	"github.com/kaitencloud/kaiten/api/internal/shared/token"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
)

// slugBase is what every minted slug is generated from. It is a constant rather
// than the caller-supplied name because the slug is an identifier this API hands
// back for revocation, not a label: keeping it server-generated means a caller
// cannot choose one, and cannot probe for one a tenant already owns.
// `kaiten-admin-tools service-token mint` generates the dogfooding token's slug
// from this same base, so a credential minted before the API is listening and
// one minted through this endpoint are indistinguishable afterwards.
const slugBase = "system-kaiten"

// tokenSlugConstraint and tokenNameConstraint are the two UNIQUE constraints an
// insert here can violate. Discriminating between them matters: a slug conflict
// is ours to retry with a freshly generated one, while a name conflict is the
// caller's to resolve, and retrying it would never help.
const (
	tokenSlugConstraint = "token_slug"
	tokenNameConstraint = "token_name"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
type Deps struct {
	Uof *uow.UnitOfWork
}

type UseCase struct {
	deps       Deps
	outbox     *outbox.ScopedRepository
	tokenCache *tokencache.Cache
}

// NewUseCase takes the validation cache as a second argument rather than a Deps
// field, matching revokeplatformtoken: it is not a dependency of minting, which
// writes a credential no cache has yet heard of. It is a dependency of the one path
// that retires one -- Command.Replace -- and passing it separately keeps that
// visible at the construction site.
func NewUseCase(deps Deps, tokenCache *tokencache.Cache) *UseCase {
	return &UseCase{
		deps:       deps,
		outbox:     outbox.NewScopedRepository(deps.Uof),
		tokenCache: tokenCache,
	}
}

// q resolves the sqlc queries bound to whatever DBTX is active for ctx -- the
// transaction Transact opened, or the pool when there is none. Same idiom as
// createserviceaccount's repository, and the reason the insert and the outbox
// write below are one unit rather than two.
func (h *UseCase) q(ctx context.Context) *db.Queries {
	return db.New(h.deps.Uof.DBTX(ctx))
}

// Execute mints the credential.
func (h *UseCase) Execute(ctx context.Context, cmd *Command) (*schema.PlainToken, error) {
	caller, ok := principal.FromContext(ctx)
	if !ok || !caller.IsPlatform() {
		// Unreachable through the facade -- kaiten.Platform takes a
		// caller.PlatformCaller, so the class is settled by the type before this
		// runs -- but stated here so a future wiring mistake fails closed instead
		// of minting from a principal whose scopes were never meant to bound
		// anything.
		return nil, apierrors.Forbidden(
			"MintOrganizationToken.WrongCredentialKind",
			"this operation requires a platform credential",
		)
	}

	organizationID, ok := targetorg.FromContext(ctx)
	if !ok {
		// Also unreachable: kaiten.Platform.bindTarget is what fills this slot, and
		// it is the only way to reach this method. Refusing beats falling back to
		// any other source for the tenant -- there is no correct fallback.
		return nil, apierrors.Internal(
			"MintOrganizationToken.MissingTargetOrganization",
			"the target organization was not resolved for this request",
		)
	}

	scopes, err := resolveScopes(caller.Scopes, cmd.Scopes)
	if err != nil {
		return nil, err
	}

	expiresAt, err := resolveExpiry(cmd.TTL)
	if err != nil {
		return nil, err
	}

	// An ordinary organization credential: same prefix, same hashing, same
	// validation path as any service-account token. Nothing about the way it was
	// issued is visible in the credential itself.
	plainToken, err := random.GeneratePrefixed(token.PrefixOrganization, 32)
	if err != nil {
		return nil, fmt.Errorf("failed to generate token: %w", err)
	}

	hashedToken, err := token.Hash(plainToken)
	if err != nil {
		return nil, fmt.Errorf("failed to hash token: %w", err)
	}

	platformTokenID := caller.PlatformTokenID

	// A parent, or no parent. uuid.Nil is what caller.LocalPlatform carries -- an
	// operator running kaiten-admin-tools holds the database connection string, not a
	// platform credential -- and issued_by_platform_token_id has an FK to token, so
	// writing the zero uuid would fail on it. NULL is the truthful value and it is
	// also the load-bearing one: a row with no parent is outside every platform-token
	// cascade, which is what keeps a bootstrap credential alive across the rotation of
	// whatever credential happened to exist when it was minted. It matches what
	// admin-tools wrote when it minted with its own SQL.
	var issuedBy *uuid.UUID
	if platformTokenID != uuid.Nil {
		issuedBy = &platformTokenID
	}

	// One transaction per attempt, opened inside the retry rather than around it.
	// A slug collision aborts the transaction it happened in, so a retry that
	// reused it would fail on "current transaction is aborted" instead of on the
	// fresh slug -- and the retry would be pointless. This is also why the caller
	// must not already hold a transaction: Transact joins an existing one, and a
	// failed attempt would then poison the caller's. Nothing composes this handler
	// into an outer unit of work: kaiten.Platform.MintOrganizationToken opens no
	// transaction of its own, and says so.
	attempt := func(resolvedSlug string) (*schema.PlainToken, error) {
		var minted *schema.PlainToken

		err := h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
			if cmd.Replace {
				if err := h.revokeReplaced(ctx, organizationID, cmd.Name); err != nil {
					return err
				}
			}

			row, err := h.q(ctx).CreateSystemOrganizationToken(ctx, db.CreateSystemOrganizationTokenParams{
				OrganizationID:          organizationID,
				Hash:                    hashedToken,
				LookupHash:              token.LookupHash(plainToken),
				ExpiresAt:               pgtime.TimePtrToPgTimestamp(expiresAt),
				Scopes:                  scopes,
				Name:                    cmd.Name,
				Slug:                    resolvedSlug,
				IssuedByPlatformTokenID: issuedBy,
			})
			if err != nil {
				return translateInsertError(ctx, err, organizationID, cmd.Name, resolvedSlug)
			}

			expiry := pgtime.PgTimeStampToTimePtr(row.ExpiresAt)

			// organization_id is the TARGET, which is the only organization this
			// event could belong to: outbox_events.organization_id is NOT NULL with
			// an FK to organization, and the actor has no organization at all. The
			// tenant whose authority just grew is also the only party with a reason
			// to receive it.
			//
			// The payload deliberately excludes plainToken. schema.SystemTokenIssuance
			// has no field that could carry it.
			//
			// PlatformTokenID is uuid.Nil for an in-process mint, and stays a uuid
			// rather than becoming a pointer: SystemTokenIssuance is published as a
			// webhook contract on the core document (see RegisterWebhook), so making the
			// field nullable would move it. The zero uuid says the same thing the NULL
			// in issued_by_platform_token_id says -- no parent credential authorized
			// this -- and a subscriber that cares reads it the same way either way.
			if err := h.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(
				organizationID,
				events.SystemOrganizationTokenIssued.Name,
				events.SystemOrganizationTokenIssued.Type,
				schema.SystemTokenIssuance{
					CredentialKind:  string(principal.KindPlatform),
					PlatformTokenID: platformTokenID,
					IssuedTokenID:   row.ID,
					Name:            row.Name,
					Slug:            row.Slug,
					Scopes:          row.Scopes,
					ExpiresAt:       expiry,
					IssuedAt:        row.CreatedAt.Time,
				},
				nil,
			)); err != nil {
				return fmt.Errorf("failed to record the credential issuance: %w", err)
			}

			// CreatedBy is system:kaiten's membership row in this organization, the
			// same value the INSERT wrote into created_by. RevokedAt/RevokedBy stay
			// nil: the credential is live, and this is the moment it was born.
			minted = &schema.PlainToken{
				Token: schema.Token{
					ID:               row.ID,
					Name:             row.Name,
					Slug:             row.Slug,
					Scopes:           row.Scopes,
					ServiceAccountID: row.ServiceAccountID,
					ExpiresAt:        expiry,
					CreatedAt:        row.CreatedAt.Time,
					CreatedBy: shared.User{
						ID:   row.CreatedBy,
						Name: row.CreatedByName,
					},
				},
				Value: plainToken,
			}
			return nil
		})
		if err != nil {
			return nil, err
		}

		return minted, nil
	}

	// GenerateUnique's random suffix makes a collision on the slug astronomically
	// unlikely but, per its own doc comment, not impossible -- and a caller has no
	// way to fix one, since it did not choose the slug. Retry with a fresh one.
	return slugutil.Retry(
		slugutil.DefaultMaxAttempts,
		func() (string, error) { return slugutil.GenerateUnique(slugBase) },
		attempt,
	)
}

// revokeReplaced retires the platform identity's active credential named name in
// this organization, and reports nothing when there was none.
func (h *UseCase) revokeReplaced(ctx context.Context, organizationID uuid.UUID, name string) error {
	replaced, err := h.q(ctx).RevokeSystemOrganizationTokenByName(ctx,
		db.RevokeSystemOrganizationTokenByNameParams{
			Name:           name,
			OrganizationID: organizationID,
		})
	if err != nil {
		return fmt.Errorf("failed to revoke the credential named %q being replaced: %w", name, err)
	}

	for _, row := range replaced {
		h.evict(ctx, row.LookupHash)
	}

	return nil
}

// evict drops a revoked credential from this process's validation cache and asks
// every other instance to do the same. Same contract, same ordering and same
// best-effort failure handling as revokeplatformtoken.evict, which documents the
// reasoning: the local delete precedes the commit because a cache miss revalidates
// against the database, and the NOTIFY goes through the transaction's own handle so
// Postgres discards it if the attempt rolls back -- which is precisely what happens
// on a slug collision here.
func (h *UseCase) evict(ctx context.Context, lookupHash string) {
	h.tokenCache.Delete(lookupHash)

	if err := pgnotify.Publish(ctx, h.deps.Uof.DBTX(ctx),
		deletetokenonserviceaccount.TokenCacheInvalidationChannel, lookupHash); err != nil {
		slog.WarnContext(ctx, "failed to publish token cache invalidation; "+
			"the replaced credential is revoked, but a running API may serve it from cache until the entry expires",
			"error", err)
	}
}

// resolveScopes implements narrow-never-widen. Omitted means inherit, which is
// what a bootstrap wants; anything requested must already be held by the
// credential doing the minting, so a platform token can delegate a subset of its
// authority and never manufacture more.
//
// Stricter than createtokenonserviceaccount, which validates well-formedness
// only (F2). That gap is a separate fix; this surface does not inherit it.
func resolveScopes(callerScopes, requested []string) ([]string, error) {
	if len(requested) == 0 {
		// Cloned rather than aliased: these scopes become a query parameter, and
		// the principal's slice must not be reachable from it.
		return slices.Clone(callerScopes), nil
	}

	if err := scope.ValidateScopes(requested); err != nil {
		return nil, apierrors.ValidationWithDetails(
			"MintOrganizationToken.InvalidScopes",
			"invalid scopes",
			map[string]any{"scopes": err.Error()},
		)
	}

	if !scope.HasAllScopes(callerScopes, requested) {
		return nil, apierrors.Forbidden(
			"MintOrganizationToken.ScopesExceedCredential",
			"the requested scopes are not all held by the calling platform credential",
		)
	}

	return slices.Clone(requested), nil
}

// resolveExpiry turns the optional TTL into an absolute instant. Omitted means
// non-expiring, which is what the dogfooding credential already is today: there
// is no server-side ceiling, because the bound on such a credential is
// revocation, including the cascade from its parent.
func resolveExpiry(ttl string) (*time.Time, error) {
	if ttl == "" {
		return nil, nil
	}

	duration, err := time.ParseDuration(ttl)
	if err != nil {
		return nil, apierrors.Validation(
			"MintOrganizationToken.InvalidTTL",
			"ttl must be a duration such as \"15m\" or \"24h\"",
		)
	}
	if duration <= 0 {
		return nil, apierrors.Validation(
			"MintOrganizationToken.InvalidTTL",
			"ttl must be positive; omit it to mint a non-expiring credential",
		)
	}

	expiresAt := time.Now().UTC().Add(duration)
	return &expiresAt, nil
}

// translateInsertError maps what the insert can fail with. No branch here ever
// echoes the plaintext -- not in a message, not in a log field, not in a wrapped
// error.
func translateInsertError(ctx context.Context, err error, organizationID uuid.UUID, name, slug string) error {
	if errors.Is(err, pgx.ErrNoRows) {
		// The membership is resolved inside the INSERT, so zero rows means
		// system:kaiten has no live membership in a tenant that demonstrably
		// exists -- bindTarget just verified that. The organization
		// trigger should have created it and the protect trigger should have kept
		// it, so this is a platform invariant breach, not a client mistake, and it
		// is logged as one. Nothing here creates the missing membership.
		//
		// 409 rather than 404 for the same reason: the target is real, the state
		// is wrong.
		slog.ErrorContext(ctx, "system:kaiten has no membership in an existing organization; cannot mint an organization credential",
			"organization_id", organizationID)
		return apierrors.Conflict(
			"MintOrganizationToken.SystemMembershipMissing",
			"the platform identity has no membership in this organization",
		)
	}

	if apierrors.IsUniqueViolationOnConstraint(err, tokenSlugConstraint) {
		// Wrapped in slugutil.ErrConflict so Retry regenerates. If every attempt
		// collides, this is what the caller finally sees.
		return apierrors.Wrapf(
			slugutil.ErrConflict, apierrors.KindConflict,
			"MintOrganizationToken.SlugConflict",
			"a credential with slug %q already exists in this organization", slug,
		)
	}

	if apierrors.IsUniqueViolationOnConstraint(err, tokenNameConstraint) {
		return apierrors.Conflict(
			"MintOrganizationToken.NameConflict",
			fmt.Sprintf("the platform identity already holds an active credential named %q in this organization", name),
		)
	}

	return fmt.Errorf("failed to mint an organization credential: %w", err)
}
