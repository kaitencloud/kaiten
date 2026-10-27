// Package aiusage carries one operation's trusted platform feature-flag decision.
// It grants neither scopes nor entitlements and does not gate financial evidence.
package aiusage

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const FlagKey = "ai-credits"

// FlagReader is structurally compatible with services.PlatformFlags without
// making this shared package depend on infrastructure. The reader owns source
// trust, readiness and type checking; unknown decisions must fail closed.
type FlagReader interface {
	BooleanValue(context.Context, uuid.UUID, string) (bool, error)
}

// Policy holds no rollout value or positive cache. Its zero value is closed,
// including when handed a context resolved by another, configured policy.
type Policy struct {
	Flags FlagReader
}

type (
	decisionKey struct{}
	decision    struct {
		organizationID uuid.UUID
		enabled        bool
	}
)

// Resolve starts a NEW operation. Never reuse an inherited decision here: an
// exact replay, a second facade call or a new GraphQL operation must re-evaluate
// the live flag. Owning use cases call this after identity and before their
// transaction; helpers only consume the resulting private snapshot.
func (p Policy) Resolve(ctx context.Context, organizationID uuid.UUID) context.Context {
	snapshot := decision{organizationID: organizationID}
	if p.Flags != nil && organizationID != uuid.Nil && ctx.Err() == nil {
		enabled, err := p.Flags.BooleanValue(ctx, organizationID, FlagKey)
		snapshot.enabled = err == nil && enabled && ctx.Err() == nil
	}
	return context.WithValue(ctx, decisionKey{}, snapshot)
}

// ForOrganization consumes a snapshot for an explicit helper target. It can
// only restrict access, never resolve or enable it. This prevents a transaction
// helper from borrowing organization A's admission for organization B.
func (p Policy) ForOrganization(ctx context.Context, organizationID uuid.UUID) context.Context {
	snapshot, ok := ctx.Value(decisionKey{}).(decision)
	if !ok || organizationID == uuid.Nil || snapshot.organizationID != organizationID {
		return context.WithValue(ctx, decisionKey{}, decision{})
	}
	return ctx
}

// Enabled reads only the operation-local snapshot; it never calls a provider.
// A context rebound to another authenticated organization cannot carry a grant
// from the old organization. Non-HTTP drivers resolve their explicit UUID.
func (p Policy) Enabled(ctx context.Context) bool {
	if p.Flags == nil || ctx.Err() != nil {
		return false
	}
	snapshot, ok := ctx.Value(decisionKey{}).(decision)
	if !ok || snapshot.organizationID == uuid.Nil || !snapshot.enabled {
		return false
	}
	if identity, present := principal.FromContext(ctx); present && identity.OrganizationID != uuid.Nil && identity.OrganizationID != snapshot.organizationID {
		return false
	}
	return true
}

// RequireEnabled must precede operational replay, planning and mutation. A
// refusal is never a pricing result or permission for unmetered usage.
func (p Policy) RequireEnabled(ctx context.Context) error {
	if !p.Enabled(ctx) {
		return apierrors.Forbidden("AIUsage.Disabled", "AI usage is disabled for this organization")
	}
	return nil
}

// RequireType checks the ORIGINAL catalogue type, not its numeric projection.
func (p Policy) RequireType(ctx context.Context, kind string) error {
	if kind == "NUMBER_AI_CREDIT" {
		return p.RequireEnabled(ctx)
	}
	return nil
}
