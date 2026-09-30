// Package listorganizationtokens names the credentials a platform credential
// currently holds inside one organization.
//
// # Why this exists
//
// Revocation is addressed by slug, and a slug is server-generated with a random
// suffix (slugutil.GenerateUnique) so it cannot be guessed from the name a
// caller chose. Without this read, a client that minted a credential and kept
// only the name cannot retire it: the name is not an address, and re-minting
// under the same name is refused by the token_name constraint. Find the slug by
// name, revoke it, mint the successor.
//
// # Why it is safe to publish
//
// Narrowed exactly like revokeorganizationtoken: the target organization, tokens
// THIS platform credential issued, still active. One platform credential cannot
// enumerate another's children, and no tenant credential reaches this at all. The
// row carries no hash and no lookup hash, so nothing here can be used to
// authenticate as one of the credentials it names -- only to identify one for
// revocation, which the caller could already do if it had kept the slug.
//
// It is deliberately a list rather than a lookup-by-name. A name that resolves to
// nothing and a name that belongs to somebody else must not be distinguishable,
// and returning the caller's own set answers the question without ever having to
// say "no such name".
package listorganizationtokens

import (
	"context"
	"fmt"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	"github.com/kaitencloud/kaiten/api/internal/platform/targetorg"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container. No Pool: nothing here writes, so there is no cache to
// invalidate and no NOTIFY to publish.
type Deps struct {
	Queries *db.Queries
}

type UseCase struct {
	deps Deps
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{deps: deps}
}

// Execute lists the calling platform credential's active credentials in the
// target organization.
//
// Like the mint and the revoke, the tenant comes from targetorg and the parent
// link from the signed JWT by way of the principal -- neither is client-nameable,
// which is what keeps the result the caller's own set rather than a query.
func (h *UseCase) Execute(ctx context.Context) ([]schema.Token, error) {
	caller, ok := principal.FromContext(ctx)
	if !ok || !caller.IsPlatform() {
		// Unreachable through the facade, which settles the credential class in
		// the type of its caller argument; stated so a wiring mistake fails
		// closed rather than listing with a zero PlatformTokenID.
		return nil, apierrors.Forbidden(
			"ListOrganizationTokens.WrongCredentialKind",
			"this operation requires a platform credential",
		)
	}

	organizationID, ok := targetorg.FromContext(ctx)
	if !ok {
		return nil, apierrors.Internal(
			"ListOrganizationTokens.MissingTargetOrganization",
			"the target organization was not resolved for this request",
		)
	}

	rows, err := h.deps.Queries.ListSystemOrganizationTokensByPlatformToken(ctx,
		db.ListSystemOrganizationTokensByPlatformTokenParams{
			OrganizationID:  organizationID,
			PlatformTokenID: caller.PlatformTokenID,
		})
	if err != nil {
		return nil, fmt.Errorf("failed to list the minted organization credentials: %w", err)
	}

	// Non-nil even when empty: this answers "what do I hold here", and holding
	// nothing is an answer. A null body would read as an error to a client that
	// checks for one.
	tokens := make([]schema.Token, 0, len(rows))
	for _, row := range rows {
		tokens = append(tokens, schema.Token{
			ID:        row.ID,
			Name:      row.Name,
			Slug:      row.Slug,
			Scopes:    row.Scopes,
			ExpiresAt: pgtime.PgTimeStampToTimePtr(row.ExpiresAt),
			CreatedAt: row.CreatedAt.Time,
		})
	}

	return tokens, nil
}
