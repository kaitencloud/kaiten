// Package aihistory presents organization-scoped AI operation history. Reads
// never lock counters or write outbox events, and never need a current grant:
// the record of a pool outlives its removal from the licence.
package aihistory

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/shopspring/decimal"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const (
	pairOperation         = "ListAiInferences"
	organizationOperation = "ListOrganizationAiInferences"

	DefaultLimit = 50
	MaxLimit     = 500
	// DefaultRange is how far back a read without from goes.
	DefaultRange = 30 * 24 * time.Hour
)

// Filter narrows a listing. Zero From and To take their defaults (to: now;
// from: 30 days before to); nil pointers do not filter.
type Filter struct {
	From          time.Time
	To            time.Time
	Status        *db.AiInferenceStatus
	TransactionID *string
	// Authorized is the commit's verdict; a RESERVED operation has none and
	// matches neither value.
	Authorized *bool
	// ModelSlug is the catalogue model the operation resolved to.
	ModelSlug *string
	// Model is the model as sent, matched exactly: the only handle on a model
	// the catalogue does not know.
	Model       *string
	RequestType *db.AiRequestType
	Cursor      *string
	Limit       int32
}

// OrganizationFilter narrows the organization-wide listing. A slug that names
// nothing in the organization matches no operation.
type OrganizationFilter struct {
	Filter
	InstanceSlug    *string
	EntitlementSlug *string
}

type Reader struct {
	AIPolicy aiusage.Policy
	User     currentuser.Provider
	Queries  *db.Queries
}

// organization resolves the caller's organization and passes Tom's AI gate,
// like every AI use case, before any read.
func (r Reader) organization(ctx context.Context) (context.Context, uuid.UUID, error) {
	user, err := r.User.GetUser(ctx)
	if err != nil {
		return ctx, uuid.Nil, err
	}
	ctx = r.AIPolicy.Resolve(ctx, user.OrganizationID)
	if err := r.AIPolicy.RequireEnabled(ctx); err != nil {
		return ctx, uuid.Nil, err
	}
	return ctx, user.OrganizationID, nil
}

func (r Reader) pair(ctx context.Context, instance, pool string) (context.Context, db.ResolveAIReadPairRow, uuid.UUID, error) {
	ctx, org, err := r.organization(ctx)
	if err != nil {
		return ctx, db.ResolveAIReadPairRow{}, uuid.Nil, err
	}
	pair, err := r.Queries.ResolveAIReadPair(ctx, db.ResolveAIReadPairParams{OrganizationID: org, InstanceSlug: instance, EntitlementSlug: pool})
	if errors.Is(err, pgx.ErrNoRows) {
		err = apierrors.NotFound("ListAiInferences.ContextNotFound", "instance or AI credit pool not found")
	}
	return ctx, pair, org, err
}

// page is the validated window, limit and keyset position of one read.
type page struct {
	from, to pgtype.Timestamp
	limit    int32
	cursorAt pgtype.Timestamp
	cursorID *uuid.UUID
}

func resolvePage(operation string, filter Filter, now time.Time) (page, error) {
	if filter.To.IsZero() {
		filter.To = now
	}
	if filter.From.IsZero() {
		filter.From = filter.To.Add(-DefaultRange)
	}
	if !filter.From.Before(filter.To) {
		return page{}, apierrors.UnprocessableEntity(operation+".InvalidRange", "from must precede to")
	}
	limit := filter.Limit
	if limit <= 0 {
		limit = DefaultLimit
	}
	if limit > MaxLimit {
		limit = MaxLimit
	}
	p := page{from: stamp(filter.From), to: stamp(filter.To), limit: limit}
	if filter.Cursor != nil {
		cursor, err := pagination.Decode[pagination.CreatedAtCursor](*filter.Cursor)
		if err != nil {
			return page{}, apierrors.UnprocessableEntity(operation+".InvalidCursor", "invalid cursor")
		}
		p.cursorAt = stamp(cursor.CreatedAt)
		p.cursorID = &cursor.ID
	}
	return p, nil
}

// trim cuts the look-ahead row and returns the cursor of the last kept row.
func trim[T any](rows []T, limit int32, key func(T) db.AiInference) ([]T, *string, error) {
	if len(rows) <= int(limit) {
		return rows, nil, nil
	}
	rows = rows[:limit]
	last := key(rows[len(rows)-1])
	cursor, err := pagination.Encode(pagination.CreatedAtCursor{CreatedAt: last.ReportedAt.Time, ID: last.ID})
	if err != nil {
		return nil, nil, err
	}
	return rows, &cursor, nil
}

func (r Reader) Inferences(ctx context.Context, instance, pool string, filter Filter) (schema.AiInferencePage, error) {
	ctx, pair, org, err := r.pair(ctx, instance, pool)
	if err != nil {
		return schema.AiInferencePage{}, err
	}
	p, err := resolvePage(pairOperation, filter, time.Now().UTC())
	if err != nil {
		return schema.AiInferencePage{}, err
	}
	rows, err := r.Queries.ListAIInferences(ctx, db.ListAIInferencesParams{OrganizationID: org, InstanceID: pair.InstanceID, EntitlementID: pair.EntitlementID, FromAt: p.from, ToAt: p.to, Status: filter.Status, TransactionID: filter.TransactionID, Authorized: filter.Authorized, ModelSlug: filter.ModelSlug, ModelRef: filter.Model, RequestType: filter.RequestType, CursorAt: p.cursorAt, CursorID: p.cursorID, LimitPlusOne: p.limit + 1})
	if err != nil {
		return schema.AiInferencePage{}, err
	}
	rows, next, err := trim(rows, p.limit, func(row db.ListAIInferencesRow) db.AiInference { return row.AiInference })
	if err != nil {
		return schema.AiInferencePage{}, err
	}
	result := schema.AiInferencePage{Items: make([]schema.AiInference, 0, len(rows)), NextCursor: next, HasMore: next != nil}
	for _, row := range rows {
		item, err := present(row.AiInference, row.ModelSlug, row.LicenseSlug)
		if err != nil {
			return schema.AiInferencePage{}, err
		}
		result.Items = append(result.Items, item)
	}
	return result, nil
}

func (r Reader) Reservations(ctx context.Context, instance, pool string) (schema.AiReservations, error) {
	ctx, pair, org, err := r.pair(ctx, instance, pool)
	if err != nil {
		return schema.AiReservations{}, err
	}
	rows, err := r.Queries.ListAIReservations(ctx, db.ListAIReservationsParams{OrganizationID: org, InstanceID: pair.InstanceID, EntitlementID: pair.EntitlementID})
	if err != nil {
		return schema.AiReservations{}, err
	}
	result := schema.AiReservations{Items: make([]schema.AiInference, 0, len(rows))}
	for _, row := range rows {
		item, err := present(row.AiInference, row.ModelSlug, row.LicenseSlug)
		if err != nil {
			return schema.AiReservations{}, err
		}
		result.Items = append(result.Items, item)
	}
	return result, nil
}

// OrganizationInferences reads one page of the organization's operations
// across instances and pools, newest first.
func (r Reader) OrganizationInferences(ctx context.Context, filter OrganizationFilter) (schema.OrganizationAiInferencePage, error) {
	ctx, org, err := r.organization(ctx)
	if err != nil {
		return schema.OrganizationAiInferencePage{}, err
	}
	p, err := resolvePage(organizationOperation, filter.Filter, time.Now().UTC())
	if err != nil {
		return schema.OrganizationAiInferencePage{}, err
	}
	rows, err := r.Queries.ListOrganizationAIInferences(ctx, db.ListOrganizationAIInferencesParams{OrganizationID: org, FromAt: p.from, ToAt: p.to, InstanceSlug: filter.InstanceSlug, EntitlementSlug: filter.EntitlementSlug, Status: filter.Status, TransactionID: filter.TransactionID, Authorized: filter.Authorized, ModelSlug: filter.ModelSlug, ModelRef: filter.Model, RequestType: filter.RequestType, CursorAt: p.cursorAt, CursorID: p.cursorID, LimitPlusOne: p.limit + 1})
	if err != nil {
		return schema.OrganizationAiInferencePage{}, err
	}
	rows, next, err := trim(rows, p.limit, func(row db.ListOrganizationAIInferencesRow) db.AiInference { return row.AiInference })
	if err != nil {
		return schema.OrganizationAiInferencePage{}, err
	}
	result := schema.OrganizationAiInferencePage{Items: make([]schema.OrganizationAiInference, 0, len(rows)), NextCursor: next, HasMore: next != nil}
	for _, row := range rows {
		item, err := present(row.AiInference, row.ModelSlug, row.LicenseSlug)
		if err != nil {
			return schema.OrganizationAiInferencePage{}, err
		}
		result.Items = append(result.Items, schema.OrganizationAiInference{AiInference: item, InstanceSlug: row.InstanceSlug, EntitlementSlug: row.EntitlementSlug})
	}
	return result, nil
}

func stamp(t time.Time) pgtype.Timestamp { return pgtype.Timestamp{Time: t, Valid: true} }
func instant(t pgtype.Timestamp) *time.Time {
	if !t.Valid {
		return nil
	}
	return &t.Time
}

func money(n pgtype.Numeric) *string {
	if !n.Valid {
		return nil
	}
	s := decimal.NewFromBigInt(n.Int, n.Exp).String()
	return &s
}

// present maps a whole row, so a column added to ai_inference reaches the
// wire by being named here once, for every read.
func present(row db.AiInference, modelSlug, licenseSlug *string) (schema.AiInference, error) {
	result := schema.AiInference{TransactionID: row.TransactionID, Status: string(row.Status), ReportedAt: row.ReportedAt.Time, CommittedAt: instant(row.CommittedAt), ExpiresAt: instant(row.ExpiresAt), Model: row.ModelRef, ModelSlug: modelSlug, RequestType: string(row.RequestType), Authorized: row.Authorized, DenialReason: row.DenialReason, Credits: schema.AiCredits{Reserved: money(row.CreditsReserved), Computed: money(row.CreditsComputed), Charged: money(row.CreditsCharged)}, ValueBefore: row.ValueBefore, ValueAfter: row.ValueAfter, WindowStart: instant(row.WindowStart), Usage: schema.AiUsage{InputTokens: row.InputTokens, CacheReadInputTokens: row.CacheReadInputTokens, CacheWriteInputTokens: row.CacheWriteInputTokens, OutputTokens: row.OutputTokens, DurationMS: row.DurationMs, Units: money(row.Units), UnitType: row.UnitType}}
	if row.RequestStatus != nil {
		s := string(*row.RequestStatus)
		result.RequestStatus = &s
	}
	if row.CreditConversionRuleID != nil {
		s := row.CreditConversionRuleID.String()
		result.ConversionRuleID = &s
	}
	if len(row.Pricing) > 0 {
		var pricing schema.AiInferencePricing
		if err := json.Unmarshal(row.Pricing, &pricing); err != nil {
			return schema.AiInference{}, fmt.Errorf("ai_inference %s: pricing snapshot: %w", row.ID, err)
		}
		result.Pricing = &pricing
	}
	if row.LicenseID != nil {
		s := row.LicenseID.String()
		result.LicenseID = &s
		result.LicenseSlug = licenseSlug
	}
	result.Warnings = row.Warnings
	if result.Warnings == nil {
		result.Warnings = []string{}
	}
	result.ReportSeq = row.ReportSeq
	if row.VendorCostReported.Valid || row.VendorCostComputed.Valid {
		result.VendorCost = &schema.AiVendorCost{Reported: money(row.VendorCostReported), Computed: money(row.VendorCostComputed), Currency: schema.AiVendorCostCurrency}
	}
	return result, nil
}
