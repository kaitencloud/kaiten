package gate

import (
	"context"
	"errors"
	"reflect"
	"slices"
	"sync/atomic"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/pkg/dogfooding"
)

// Selection is the effective subscription purchase, not a caller-supplied
// permission. Anonymous completion names its checkout until it creates an
// instance; ordinary subscription names the instance from the start.
type Selection struct {
	InstanceSlug      string
	CheckoutSessionID uuid.UUID
	BasePriceID       uuid.UUID
	VoucherCode       *string
	AddOns            []SelectionAddon
}

type SelectionAddon struct {
	Slug     string
	Quantity int32
}

// selectionLifetime bounds a decision to one completion attempt. A redirect
// returns no decision: the following request asks the authority again.
const selectionLifetime = time.Minute

type selectionKey struct{}

type selectionDecision struct {
	request        context.Context
	organizationID uuid.UUID
	actorID        uuid.UUID
	authority      services.ConnectorEntitlements
	expiresAt      time.Time
	closed         atomic.Bool
	instance       atomic.Pointer[string]
}

// SelectionScope is an internal, request-local licensing decision. Its private
// context key cannot be set by HTTP input. Independent gates may use it only
// for the same authority, organization, actor and exact effective purchase.
// Business validation and consistency locks remain the callers' responsibility.
type SelectionScope struct {
	ctx       context.Context
	decision  *selectionDecision
	selection Selection
	owner     bool
}

func (s *SelectionScope) Context() context.Context { return s.ctx }

func (s *SelectionScope) Close() {
	if s.owner {
		s.decision.closed.Store(true)
	}
}

func (s *SelectionScope) valid(ctx context.Context) bool {
	return !s.decision.closed.Load() && s.decision.request.Err() == nil &&
		ctx.Err() == nil && time.Now().Before(s.decision.expiresAt)
}

func unavailableSelection() error {
	return apierrors.Unavailable(CodeEntitlementCheckUnavailable,
		"the licensing decision no longer matches this completion attempt; nothing was changed, retry")
}

// Validate is pure: call it before committing a potentially long completion.
func (s *SelectionScope) Validate(ctx context.Context) error {
	if !s.valid(ctx) {
		return unavailableSelection()
	}
	return nil
}

// BindInstance binds anonymous completion to its newly created instance, once.
// It derives from ctx so an enclosing transaction is preserved. No authority
// is contacted while the checkout/instance locks are held.
func (s *SelectionScope) BindInstance(ctx context.Context, instanceSlug string) (context.Context, error) {
	if !s.owner || s.selection.CheckoutSessionID == uuid.Nil || instanceSlug == "" || !s.valid(ctx) {
		return nil, unavailableSelection()
	}
	if !s.decision.instance.CompareAndSwap(nil, &instanceSlug) {
		return nil, unavailableSelection()
	}
	bound := &SelectionScope{decision: s.decision, selection: s.selection}
	bound.selection.InstanceSlug, bound.selection.CheckoutSessionID = instanceSlug, uuid.Nil
	bound.ctx = context.WithValue(ctx, selectionKey{}, bound)
	return bound.ctx, nil
}

// BeginSelection must run before opening a transaction, or join an existing
// decision. It deliberately reads fresh grants without the gate's process
// cache/outage fallback. This is one decision per bounded attempt, not a
// commit-time revocation guarantee and not permission for another purchase.
func (g Gate) BeginSelection(ctx context.Context, organizationID, actorID uuid.UUID, selection Selection) (*SelectionScope, error) {
	if !g.enabled {
		return nil, g.Require(ctx, organizationID)
	}
	selection = copySelection(selection)
	if existing, ok := ctx.Value(selectionKey{}).(*SelectionScope); ok {
		if !g.matches(ctx, existing, organizationID) || existing.decision.actorID != actorID || !sameSelection(existing.selection, selection) {
			return nil, unavailableSelection()
		}
		return &SelectionScope{ctx: ctx, decision: existing.decision, selection: selection}, nil
	}
	if uow.InTransaction(ctx) {
		return nil, unavailableSelection() // never start a licensing read under an enclosing lock
	}
	fresh := g
	fresh.answers = nil
	checkCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := fresh.RequireSelection(checkCtx, organizationID, selection.VoucherCode != nil, len(selection.AddOns) > 0); err != nil {
		return nil, err
	}
	if checkCtx.Err() != nil || organizationID == uuid.Nil || actorID == uuid.Nil || selection.BasePriceID == uuid.Nil ||
		(selection.InstanceSlug == "") == (selection.CheckoutSessionID == uuid.Nil) {
		return nil, unavailableSelection()
	}
	// An authority must have stable identity across the independent gates wired
	// to it (normally a pointer, or AlwaysEntitled for self-hosted deployments).
	if !reflect.TypeOf(g.entitlements).Comparable() {
		return nil, unavailableSelection()
	}
	decision := &selectionDecision{
		request: ctx, organizationID: organizationID, actorID: actorID,
		authority: g.entitlements, expiresAt: time.Now().Add(selectionLifetime),
	}
	scope := &SelectionScope{decision: decision, selection: selection, owner: true}
	scope.ctx = context.WithValue(ctx, selectionKey{}, scope)
	if err := scope.Validate(ctx); err != nil {
		return nil, err
	}
	return scope, nil
}

func (g Gate) matches(ctx context.Context, scope *SelectionScope, organizationID uuid.UUID) bool {
	return g.entitlements != nil && scope.valid(ctx) && scope.decision.organizationID == organizationID &&
		reflect.TypeOf(g.entitlements) == reflect.TypeOf(scope.decision.authority) &&
		reflect.TypeOf(g.entitlements).Comparable() && g.entitlements == scope.decision.authority
}

// selectionAnswer distinguishes no decision (ordinary standalone gating) from
// an invalid decision (fail closed, never perform network I/O under locks).
func (g Gate) selectionAnswer(ctx context.Context, organizationID uuid.UUID, slug string) (bool, bool, error) {
	scope, ok := ctx.Value(selectionKey{}).(*SelectionScope)
	if !ok {
		if uow.InTransaction(ctx) {
			return false, true, errors.New("missing completion licensing decision inside a transaction")
		}
		return false, false, nil
	}
	if !g.matches(ctx, scope, organizationID) {
		return false, true, errors.New("invalid completion licensing decision")
	}
	selected := slug == dogfooding.BillingEntitlementSlug ||
		(slug == dogfooding.VouchersEntitlementSlug && scope.selection.VoucherCode != nil) ||
		(slug == dogfooding.AddonsEntitlementSlug && len(scope.selection.AddOns) > 0)
	if !selected {
		return false, true, errors.New("capability not authorized for this completion")
	}
	return true, true, nil
}

// RequireSelectedAddon/RequireSelectedVoucher bind nested writes to the actor,
// instance and selected item. Standalone calls still use their ordinary gate.
func (g Gate) RequireSelectedAddon(ctx context.Context, organizationID, actorID uuid.UUID, instanceSlug, addonSlug string, quantity int32) error {
	scope, ok := ctx.Value(selectionKey{}).(*SelectionScope)
	if !ok {
		return nil
	}
	if quantity == 0 {
		quantity = 1
	}
	if !g.matches(ctx, scope, organizationID) || scope.decision.actorID != actorID || scope.selection.InstanceSlug != instanceSlug ||
		!slices.Contains(scope.selection.AddOns, SelectionAddon{Slug: addonSlug, Quantity: quantity}) {
		return unavailableSelection()
	}
	return nil
}

func (g Gate) RequireSelectedVoucher(ctx context.Context, organizationID, actorID uuid.UUID, instanceSlug, code string) error {
	scope, ok := ctx.Value(selectionKey{}).(*SelectionScope)
	if !ok {
		return nil
	}
	if !g.matches(ctx, scope, organizationID) || scope.decision.actorID != actorID || scope.selection.InstanceSlug != instanceSlug ||
		scope.selection.VoucherCode == nil || *scope.selection.VoucherCode != code {
		return unavailableSelection()
	}
	return nil
}

func copySelection(selection Selection) Selection {
	if selection.VoucherCode != nil {
		code := *selection.VoucherCode
		selection.VoucherCode = &code
	}
	selection.AddOns = slices.Clone(selection.AddOns)
	for i := range selection.AddOns {
		if selection.AddOns[i].Quantity == 0 {
			selection.AddOns[i].Quantity = 1
		}
	}
	return selection
}

func sameSelection(a, b Selection) bool {
	return a.InstanceSlug == b.InstanceSlug && a.CheckoutSessionID == b.CheckoutSessionID && a.BasePriceID == b.BasePriceID &&
		((a.VoucherCode == nil && b.VoucherCode == nil) ||
			(a.VoucherCode != nil && b.VoucherCode != nil && *a.VoucherCode == *b.VoucherCode)) && slices.Equal(a.AddOns, b.AddOns)
}
