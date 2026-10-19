// Package aihistory presents organization-scoped AI operation history. Reads
// never lock counters or write outbox events.
package aihistory

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/shopspring/decimal"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type Filter struct {
	From          time.Time
	To            time.Time
	Status        *db.AiInferenceStatus
	TransactionID *string
	Cursor        *string
	Limit         int32
}

type Reader struct {
	User    currentuser.Provider
	Queries *db.Queries
}

func (r Reader) pair(ctx context.Context, instance, pool string) (db.ResolveAIReadPairRow, uuid.UUID, error) {
	user, err := r.User.GetUser(ctx)
	if err != nil {
		return db.ResolveAIReadPairRow{}, uuid.Nil, err
	}
	pair, err := r.Queries.ResolveAIReadPair(ctx, db.ResolveAIReadPairParams{OrganizationID: user.OrganizationID, InstanceSlug: instance, EntitlementSlug: pool})
	if errors.Is(err, pgx.ErrNoRows) {
		err = apierrors.NotFound("ListAiInferences.ContextNotFound", "AI credit pool is not granted to this instance")
	}
	return pair, user.OrganizationID, err
}

func (r Reader) Inferences(ctx context.Context, instance, pool string, filter Filter) (schema.AiInferencePage, error) {
	pair, org, err := r.pair(ctx, instance, pool)
	if err != nil {
		return schema.AiInferencePage{}, err
	}
	if filter.To.IsZero() {
		filter.To = time.Now().UTC()
	}
	if filter.From.IsZero() {
		filter.From = filter.To.AddDate(0, 0, -30)
	}
	if !filter.From.Before(filter.To) {
		return schema.AiInferencePage{}, apierrors.UnprocessableEntity("ListAiInferences.InvalidRange", "from must precede to")
	}
	limit := filter.Limit
	if limit <= 0 {
		limit = 50
	}
	if limit > 500 {
		limit = 500
	}
	params := db.ListAIInferencesParams{OrganizationID: org, InstanceID: pair.InstanceID, EntitlementID: pair.EntitlementID, FromAt: stamp(filter.From), ToAt: stamp(filter.To), Status: filter.Status, TransactionID: filter.TransactionID, LimitPlusOne: limit + 1, CursorAt: pgtype.Timestamp{}, CursorID: nil}
	if filter.Cursor != nil {
		cursor, err := pagination.Decode[pagination.CreatedAtCursor](*filter.Cursor)
		if err != nil {
			return schema.AiInferencePage{}, apierrors.UnprocessableEntity("ListAiInferences.InvalidCursor", "invalid cursor")
		}
		params.CursorAt = stamp(cursor.CreatedAt)
		params.CursorID = &cursor.ID
	}
	rows, err := r.Queries.ListAIInferences(ctx, params)
	if err != nil {
		return schema.AiInferencePage{}, err
	}
	page := schema.AiInferencePage{Items: []schema.AiInference{}}
	if len(rows) > int(limit) {
		page.HasMore = true
		rows = rows[:limit]
	}
	for _, row := range rows {
		page.Items = append(page.Items, present(db.AiInference{ID: row.ID, TransactionID: row.TransactionID, Status: row.Status, ReportedAt: row.ReportedAt, CommittedAt: row.CommittedAt, ExpiresAt: row.ExpiresAt, ModelRef: row.ModelRef, RequestType: row.RequestType, RequestStatus: row.RequestStatus, InputTokens: row.InputTokens, CacheReadInputTokens: row.CacheReadInputTokens, CacheWriteInputTokens: row.CacheWriteInputTokens, OutputTokens: row.OutputTokens, Units: row.Units, UnitType: row.UnitType, DurationMs: row.DurationMs, CreditConversionRuleID: row.CreditConversionRuleID, Authorized: row.Authorized, DenialReason: row.DenialReason, CreditsReserved: row.CreditsReserved, CreditsComputed: row.CreditsComputed, CreditsCharged: row.CreditsCharged, ValueBefore: row.ValueBefore, ValueAfter: row.ValueAfter, WindowStart: row.WindowStart}, row.ModelSlug))
	}
	if page.HasMore {
		last := rows[len(rows)-1]
		cursor, err := pagination.Encode(pagination.CreatedAtCursor{CreatedAt: last.ReportedAt.Time, ID: last.ID})
		if err != nil {
			return schema.AiInferencePage{}, err
		}
		page.NextCursor = &cursor
	}
	return page, nil
}

func (r Reader) Reservations(ctx context.Context, instance, pool string) (schema.AiReservations, error) {
	pair, org, err := r.pair(ctx, instance, pool)
	if err != nil {
		return schema.AiReservations{}, err
	}
	rows, err := r.Queries.ListAIReservations(ctx, db.ListAIReservationsParams{OrganizationID: org, InstanceID: pair.InstanceID, EntitlementID: pair.EntitlementID})
	if err != nil {
		return schema.AiReservations{}, err
	}
	result := schema.AiReservations{Items: []schema.AiInference{}}
	for _, row := range rows {
		result.Items = append(result.Items, present(db.AiInference{TransactionID: row.TransactionID, Status: row.Status, ReportedAt: row.ReportedAt, ExpiresAt: row.ExpiresAt, ModelRef: row.ModelRef, RequestType: row.RequestType, CreditsReserved: row.CreditsReserved, InputTokens: row.InputTokens, CacheReadInputTokens: row.CacheReadInputTokens, CacheWriteInputTokens: row.CacheWriteInputTokens, OutputTokens: row.OutputTokens, Units: row.Units, UnitType: row.UnitType, DurationMs: row.DurationMs}, row.ModelSlug))
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

func present(row db.AiInference, slug *string) schema.AiInference {
	result := schema.AiInference{TransactionID: row.TransactionID, Status: string(row.Status), ReportedAt: row.ReportedAt.Time, CommittedAt: instant(row.CommittedAt), ExpiresAt: instant(row.ExpiresAt), Model: row.ModelRef, ModelSlug: slug, RequestType: string(row.RequestType), Authorized: row.Authorized, DenialReason: row.DenialReason, Credits: schema.AiCredits{Reserved: money(row.CreditsReserved), Computed: money(row.CreditsComputed), Charged: money(row.CreditsCharged)}, ValueBefore: row.ValueBefore, ValueAfter: row.ValueAfter, WindowStart: instant(row.WindowStart), Usage: schema.AiUsage{InputTokens: row.InputTokens, CacheReadInputTokens: row.CacheReadInputTokens, CacheWriteInputTokens: row.CacheWriteInputTokens, OutputTokens: row.OutputTokens, DurationMS: row.DurationMs, Units: money(row.Units), UnitType: row.UnitType}}
	if row.RequestStatus != nil {
		s := string(*row.RequestStatus)
		result.RequestStatus = &s
	}
	if row.CreditConversionRuleID != nil {
		s := row.CreditConversionRuleID.String()
		result.ConversionRuleID = &s
	}
	return result
}
