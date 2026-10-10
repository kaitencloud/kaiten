// Package catalogue is what the voucher use cases share: the resource shapes,
// the caller and the billing gate, the rules a voucher must satisfy, and
// reading vouchers and redemptions.
//
// A voucher is a code an instance redeems. A PRICE voucher discounts the
// invoices its subscription receives; an ENTITLEMENT_BOOST voucher changes
// what the instance is entitled to for a while. The code is a secret: it is
// returned only to read:vouchers callers, and never travels in a URL or an
// event, which carry codeHint (its last four characters) instead.
package catalogue

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/gate"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/money"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Deps is what every voucher use case needs.
type Deps struct {
	UserProvider currentuser.Provider
	Uof          *uow.UnitOfWork
	// Gate keeps vouchers behind the billing switch.
	Gate gate.Gate
}

// Caller is the user a request acts for, past the billing gate.
func (d Deps) Caller(ctx context.Context) (*currentuser.User, error) {
	user, err := d.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}
	if err := d.Gate.Require(ctx, user.OrganizationID); err != nil {
		return nil, err
	}
	return user, nil
}

// Queries binds to the transaction ctx carries, or the pool.
func (d Deps) Queries(ctx context.Context) *db.Queries {
	return db.New(d.Uof.DBTX(ctx))
}

// Now is the database's clock, in UTC, to the millisecond.
func Now(ctx context.Context, q *db.Queries) (time.Time, error) {
	clock, err := q.VoucherClock(ctx)
	if err != nil {
		return time.Time{}, err
	}
	return clock.Time.UTC(), nil
}

// Types, statuses, durations and scopes, as the API spells them.
const (
	TypePrice = "PRICE"
	TypeBoost = "ENTITLEMENT_BOOST"

	StatusDraft     = "DRAFT"
	StatusActive    = "ACTIVE"
	StatusExpired   = "EXPIRED"
	StatusExhausted = "EXHAUSTED"
	StatusArchived  = "ARCHIVED"

	DurationOnce      = "ONE_TIME"
	DurationRepeating = "REPEATING"
	DurationForever   = "FOREVER"

	DiscountPercentage = "PERCENTAGE"
	DiscountFixed      = "FIXED_AMOUNT"

	AppliesSelected = "SELECTED_PRICES"
)

// Voucher is a voucher as the API returns it.
type Voucher struct {
	ID                        uuid.UUID       `json:"id" readOnly:"true"`
	Code                      *string         `json:"code,omitempty" doc:"The code to redeem. Returned to read:vouchers callers only; never in an event." example:"SUMMER-2026-LAUNCH"`
	CodeHint                  string          `json:"codeHint" doc:"The last four characters of the normalized code" example:"UNCH"`
	Name                      string          `json:"name" example:"Summer launch"`
	Description               *string         `json:"description,omitempty"`
	VoucherType               string          `json:"voucherType" enum:"PRICE,ENTITLEMENT_BOOST"`
	Status                    string          `json:"status" enum:"DRAFT,ACTIVE,EXPIRED,EXHAUSTED,ARCHIVED"`
	Duration                  string          `json:"duration" enum:"ONE_TIME,REPEATING,FOREVER" doc:"PRICE: how many invoices it discounts (one, durationInPeriods, or every one). BOOST: how long a redemption lasts, in the subscription's billing periods."`
	DurationInPeriods         *int32          `json:"durationInPeriods,omitempty"`
	MaxRedemptions            *int32          `json:"maxRedemptions,omitempty"`
	RedemptionsCount          int32           `json:"redemptionsCount"`
	StartsAt                  *time.Time      `json:"startsAt,omitempty"`
	ExpiresAt                 *time.Time      `json:"expiresAt,omitempty"`
	PriceDiscountType         *string         `json:"priceDiscountType,omitempty" enum:"PERCENTAGE,FIXED_AMOUNT"`
	PriceDiscountValue        *string         `json:"priceDiscountValue,omitempty" doc:"A percentage in (0, 100], or an integer amount in minor units of currency" example:"30"`
	Currency                  *string         `json:"currency,omitempty" doc:"The currency of a FIXED_AMOUNT discount" example:"EUR"`
	PriceAppliesTo            *string         `json:"priceAppliesTo,omitempty" enum:"LICENSE_BASE,ADDONS,BOTH,SELECTED_PRICES"`
	ApplicableLicensePriceIDs []uuid.UUID     `json:"applicableLicensePriceIds" nullable:"false"`
	ApplicableAddonPriceIDs   []uuid.UUID     `json:"applicableAddonPriceIds" nullable:"false"`
	Grants                    []Grant         `json:"grants" nullable:"false" doc:"What an ENTITLEMENT_BOOST changes"`
	ApplicableLicenseIDs      []uuid.UUID     `json:"applicableLicenseIds" nullable:"false" doc:"Only instances on these licence versions can redeem it; any when empty"`
	ApplicableAddonIDs        []uuid.UUID     `json:"applicableAddonIds" nullable:"false" doc:"Only instances holding one of these add-on versions can redeem it; any when empty"`
	RestrictedCustomerSlug    *string         `json:"restrictedCustomerSlug,omitempty" doc:"Only this customer's instances can redeem it"`
	RedemptionRules           RedemptionRules `json:"redemptionRules"`
	CreatedAt                 time.Time       `json:"createdAt" readOnly:"true"`
	UpdatedAt                 time.Time       `json:"updatedAt" readOnly:"true"`
}

// Grant is one entitlement change of an ENTITLEMENT_BOOST.
type Grant struct {
	EntitlementSlug string  `json:"entitlementSlug" example:"tokens"`
	ModifierType    string  `json:"modifierType" enum:"SET,ADD,MULTIPLY,UNLIMITED" doc:"SET replaces the value, ADD adds to it, MULTIPLY multiplies it, UNLIMITED lifts the limit"`
	ModifierValue   *string `json:"modifierValue,omitempty" doc:"A decimal: >= 0 for SET, > 0 for ADD and MULTIPLY, absent for UNLIMITED" example:"2"`
}

// RedemptionRules are the eligibility rules a redeeming instance must meet.
type RedemptionRules struct {
	FirstTimeOnly             bool           `json:"firstTimeOnly,omitempty" doc:"Only for a customer none of whose instances has paid an invoice"`
	AnnualOnly                bool           `json:"annualOnly,omitempty" doc:"Only for an instance with a live ANNUAL subscription"`
	MinimumSubscriptionAmount *MinimumAmount `json:"minimumSubscriptionAmount,omitempty" doc:"Only for a live subscription whose base price is at least this"`
}

// MinimumAmount is a base price floor.
type MinimumAmount struct {
	Currency          string `json:"currency" example:"EUR"`
	UnitAmountDecimal string `json:"unitAmountDecimal" doc:"In minor units" example:"2900"`
}

// Hint is the last four characters of a normalized code.
func Hint(normalized string) string {
	if len(normalized) <= 4 {
		return normalized
	}
	return normalized[len(normalized)-4:]
}

// ToVoucher maps a voucher row with its grants. withCode keeps the code.
func ToVoucher(row db.ListVouchersRow, grants []Grant, withCode bool) Voucher {
	normalized := ""
	if row.CodeNormalized != nil {
		normalized = *row.CodeNormalized
	}
	v := Voucher{
		ID: row.ID, Code: nil, CodeHint: Hint(normalized), Name: row.Name, Description: row.Description,
		VoucherType: string(row.VoucherType), Status: string(row.Status), Duration: string(row.Duration),
		DurationInPeriods: row.DurationInPeriods, MaxRedemptions: row.MaxRedemptions,
		RedemptionsCount: row.RedemptionsCount, StartsAt: timePtr(row.StartsAt), ExpiresAt: timePtr(row.ExpiresAt),
		PriceDiscountType: nil, PriceDiscountValue: nil, Currency: nil, PriceAppliesTo: nil,
		ApplicableLicensePriceIDs: nonNil(row.ApplicableLicensePriceIds), ApplicableAddonPriceIDs: nonNil(row.ApplicableAddonPriceIds),
		Grants: grants, ApplicableLicenseIDs: nonNil(row.ApplicableLicenseIds), ApplicableAddonIDs: nonNil(row.ApplicableAddonIds),
		RestrictedCustomerSlug: row.RestrictedCustomerSlug, RedemptionRules: RedemptionRules{},
		CreatedAt: row.CreatedAt.Time.UTC(), UpdatedAt: row.UpdatedAt.Time.UTC(),
	}
	if withCode {
		code := row.Code
		v.Code = &code
	}
	if row.PriceDiscountType != nil {
		t := string(*row.PriceDiscountType)
		v.PriceDiscountType = &t
	}
	if row.PriceDiscountValue != "" {
		value := formatDecimal(row.PriceDiscountValue)
		v.PriceDiscountValue = &value
	}
	if row.Currency != "" {
		currency := row.Currency
		v.Currency = &currency
	}
	if row.PriceAppliesTo != nil {
		applies := string(*row.PriceAppliesTo)
		v.PriceAppliesTo = &applies
	}
	_ = json.Unmarshal(row.RedemptionRules, &v.RedemptionRules)
	if v.Grants == nil {
		v.Grants = []Grant{}
	}
	return v
}

// List reads vouchers with their grants.
func List(ctx context.Context, q *db.Queries, params db.ListVouchersParams, withCode bool) ([]Voucher, error) {
	rows, err := q.ListVouchers(ctx, params)
	if err != nil {
		return nil, err
	}
	ids := make([]uuid.UUID, len(rows))
	for i, row := range rows {
		ids[i] = row.ID
	}
	grants := map[uuid.UUID][]Grant{}
	if len(ids) > 0 {
		grantRows, err := q.ListVoucherGrants(ctx, db.ListVoucherGrantsParams{OrganizationID: params.OrganizationID, VoucherIds: ids})
		if err != nil {
			return nil, err
		}
		for _, g := range grantRows {
			grant := Grant{EntitlementSlug: g.EntitlementSlug, ModifierType: string(g.ModifierType), ModifierValue: nil}
			if g.ModifierValue != "" {
				value := formatDecimal(g.ModifierValue)
				grant.ModifierValue = &value
			}
			grants[g.VoucherID] = append(grants[g.VoucherID], grant)
		}
	}
	out := make([]Voucher, len(rows))
	for i, row := range rows {
		out[i] = ToVoucher(row, grants[row.ID], withCode)
	}
	return out, nil
}

// One reads one voucher by id (or by code, when code is set); notFound when
// the organization has none.
func One(ctx context.Context, q *db.Queries, organizationID uuid.UUID, id *uuid.UUID, code *string, withCode bool, notFound error) (Voucher, error) {
	list, err := List(ctx, q, db.ListVouchersParams{
		OrganizationID: organizationID, ID: id, Code: code, Status: nil, VoucherType: nil, CustomerSlug: nil,
		CursorAt: pgtype.Timestamp{}, CursorID: nil, RowLimit: nil,
	}, withCode)
	if err != nil {
		return Voucher{}, err
	}
	if len(list) == 0 {
		return Voucher{}, notFound
	}
	return list[0], nil
}

// Lock locks a voucher for a write; <operation>.NotFound when the
// organization has none.
func Lock(ctx context.Context, q *db.Queries, organizationID, id uuid.UUID, operation string) (db.LockVoucherRow, error) {
	row, err := q.LockVoucher(ctx, db.LockVoucherParams{OrganizationID: organizationID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return row, kaitenerrors.NotFoundf(operation+".NotFound", "voucher %s not found", id)
	}
	return row, err
}

var codePattern = regexp.MustCompile(`^[A-Za-z0-9_-]{8,64}$`)

// crockford is Crockford's base32 alphabet: no I, L, O or U to misread.
const crockford = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

// GenerateCode returns 16 Crockford base32 characters: 80 random bits.
func GenerateCode() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	var b strings.Builder
	for _, c := range buf {
		b.WriteByte(crockford[int(c)%len(crockford)])
	}
	return b.String(), nil
}

// ValidCode reports whether a code has the accepted shape.
func ValidCode(code string) bool { return codePattern.MatchString(code) }

// NormalizeCode is a code as the voucher_code_normalized column stores it,
// and as redemption, validation, lookup and the entropy floor read it
// (§11.2 rules 1 and 3): upper case, everything outside [A-Za-z0-9] removed.
func NormalizeCode(code string) string {
	return strings.ToUpper(strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			return r
		}
		return -1
	}, code))
}

func timePtr(ts pgtype.Timestamp) *time.Time {
	if !ts.Valid {
		return nil
	}
	t := ts.Time.UTC()
	return &t
}

// Timestamp converts an optional instant for a write.
func Timestamp(t *time.Time) pgtype.Timestamp {
	if t == nil {
		return pgtype.Timestamp{}
	}
	return pgtype.Timestamp{Time: t.UTC(), Valid: true, InfinityModifier: pgtype.Finite}
}

func nonNil(ids []uuid.UUID) []uuid.UUID {
	if ids == nil {
		return []uuid.UUID{}
	}
	return ids
}

func formatDecimal(s string) string {
	d, err := money.ParseUnitAmount(s)
	if err != nil {
		return s
	}
	return money.FormatDecimal(d)
}
