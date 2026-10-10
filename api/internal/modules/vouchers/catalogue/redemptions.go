package catalogue

import (
	"context"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenevents "github.com/kaitencloud/kaiten/api/internal/infrastructure/events"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/shared/nullable"
)

// Redemption is a voucher an instance redeemed.
type Redemption struct {
	ID                 uuid.UUID  `json:"id" readOnly:"true"`
	VoucherID          uuid.UUID  `json:"voucherId"`
	VoucherName        string     `json:"voucherName"`
	VoucherType        string     `json:"voucherType" enum:"PRICE,ENTITLEMENT_BOOST"`
	CodeHint           string     `json:"codeHint"`
	InstanceSlug       string     `json:"instanceSlug"`
	RedeemedAt         time.Time  `json:"redeemedAt"`
	EffectiveStartsAt  time.Time  `json:"effectiveStartsAt"`
	EffectiveExpiresAt *time.Time `json:"effectiveExpiresAt" doc:"When a boost stops applying; null for a PRICE voucher, counted in invoices, and for FOREVER"`
	ApplicationsCount  int32      `json:"applicationsCount" doc:"Invoices a PRICE voucher discounted"`
	ApplicationsMax    *int32     `json:"applicationsMax" doc:"1 for ONE_TIME, durationInPeriods for REPEATING; null for FOREVER"`
	Status             string     `json:"status" enum:"ACTIVE,EXPIRED,REVOKED"`
	ExpiredAt          *time.Time `json:"expiredAt"`
	RevokedAt          *time.Time `json:"revokedAt"`
	RevokedReason      *string    `json:"revokedReason"`
}

// TransformSchema publishes Redemption's absent members as null (§13.15).
func (Redemption) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	return nullable.Pointers(s, Redemption{})
}

// ApplicationsMax is how many invoices a PRICE voucher of this duration
// discounts; nil for FOREVER.
func ApplicationsMax(duration db.VoucherDuration, periods *int32) *int32 {
	switch duration {
	case db.VoucherDurationONETIME:
		one := int32(1)
		return &one
	case db.VoucherDurationREPEATING:
		return periods
	default:
		return nil
	}
}

// Redemptions reads redemptions, newest first.
func Redemptions(ctx context.Context, q *db.Queries, params db.ListRedemptionsParams) ([]Redemption, error) {
	rows, err := q.ListRedemptions(ctx, params)
	if err != nil {
		return nil, err
	}
	out := make([]Redemption, len(rows))
	for i, row := range rows {
		normalized := ""
		if row.CodeNormalized != nil {
			normalized = *row.CodeNormalized
		}
		r := Redemption{
			ID: row.ID, VoucherID: row.VoucherID, VoucherName: row.VoucherName, VoucherType: string(row.VoucherType),
			CodeHint: Hint(normalized), InstanceSlug: row.InstanceSlug, RedeemedAt: row.RedeemedAt.Time.UTC(),
			EffectiveStartsAt: row.EffectiveStartsAt.Time.UTC(), EffectiveExpiresAt: timePtr(row.EffectiveExpiresAt),
			ApplicationsCount: row.ApplicationsCount, ApplicationsMax: nil, Status: string(row.Status),
			ExpiredAt: timePtr(row.ExpiredAt), RevokedAt: timePtr(row.RevokedAt), RevokedReason: row.RevokedReason,
		}
		if row.VoucherType == db.VoucherTypePRICE {
			r.ApplicationsMax = ApplicationsMax(row.Duration, row.DurationInPeriods)
		}
		out[i] = r
	}
	return out, nil
}

// ExhaustedEvent is the payload of VOUCHER_EXHAUSTED.
type ExhaustedEvent struct {
	ID             uuid.UUID `json:"id"`
	Name           string    `json:"name"`
	MaxRedemptions *int32    `json:"maxRedemptions,omitempty"`
}

// ExpiredEvent is the payload of VOUCHER_EXPIRED.
type ExpiredEvent struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	ExpiresAt time.Time `json:"expiresAt"`
}

// Announce records a voucher event; the payload never carries the code.
func Announce(ctx context.Context, box *outbox.ScopedRepository, organizationID uuid.UUID, event kaitenevents.Metadata, voucher Voucher) error {
	voucher.Code = nil
	return box.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(organizationID, event.Name, event.Type, voucher, nil))
}

// RegisterWebhooks declares the voucher events' webhook contracts.
func RegisterWebhooks(api huma.API) {
	declare := func(event kaitenevents.Metadata, data any, id, summary, description, tag string) webhook.Declaration {
		return webhook.Declaration{
			Event: event, Data: data, OperationID: id, Summary: summary + " Webhook", Description: description,
			Tags: []string{"webhooks", tag},
		}
	}
	webhook.Declare(api,
		declare(events.VoucherCreated, (*Voucher)(nil), "onVoucherCreated", "Voucher Created", "Triggered when a voucher is created. The code is never in the payload.", "vouchers"),
		declare(events.VoucherUpdated, (*Voucher)(nil), "onVoucherUpdated", "Voucher Updated", "Triggered when a voucher changes.", "vouchers"),
		declare(events.VoucherPublished, (*Voucher)(nil), "onVoucherPublished", "Voucher Published", "Triggered when a draft voucher becomes redeemable.", "vouchers"),
		declare(events.VoucherArchived, (*Voucher)(nil), "onVoucherArchived", "Voucher Archived", "Triggered when a voucher is archived.", "vouchers"),
		declare(events.VoucherExhausted, (*ExhaustedEvent)(nil), "onVoucherExhausted", "Voucher Exhausted", "Triggered by the redemption that reaches maxRedemptions.", "vouchers"),
		declare(events.VoucherExpired, (*ExpiredEvent)(nil), "onVoucherExpired", "Voucher Expired", "Triggered when an active voucher reaches its expiresAt and can no longer be redeemed.", "vouchers"),
		declare(events.InstanceVoucherRedeemed, (*Redemption)(nil), "onInstanceVoucherRedeemed", "Instance Voucher Redeemed", "Triggered when an instance redeems a voucher.", "vouchers"),
		declare(events.InstanceVoucherRevoked, (*Redemption)(nil), "onInstanceVoucherRevoked", "Instance Voucher Revoked", "Triggered when a redemption is revoked.", "vouchers"),
		declare(events.InstanceVoucherExpired, (*Redemption)(nil), "onInstanceVoucherExpired", "Instance Voucher Expired", "Triggered when a PRICE redemption has discounted its last invoice, or a boost's window ends.", "vouchers"),
	)
}
