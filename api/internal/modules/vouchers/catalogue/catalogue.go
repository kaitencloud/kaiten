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
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/gate"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/money"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
	"github.com/kaitencloud/kaiten/api/internal/shared/nullable"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Deps is what every voucher use case needs.
type Deps struct {
	AIPolicy     aiusage.Policy
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
	TypePrice     = "PRICE"
	TypeBoost     = "ENTITLEMENT_BOOST"
	TypeFlagGrant = "FLAG_GRANT"
	TypeComposite = "COMPOSITE"

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
	Description               *string         `json:"description"`
	VoucherType               string          `json:"voucherType" enum:"PRICE,ENTITLEMENT_BOOST,FLAG_GRANT,COMPOSITE"`
	Status                    string          `json:"status" enum:"DRAFT,ACTIVE,EXPIRED,EXHAUSTED,ARCHIVED"`
	Duration                  string          `json:"duration" enum:"ONE_TIME,REPEATING,FOREVER" doc:"PRICE: how many invoices it discounts (one, durationInPeriods, or every one). BOOST and FLAG_GRANT: how long a redemption lasts, in the subscription's billing periods. COMPOSITE: both, each for its part."`
	DurationInPeriods         *int32          `json:"durationInPeriods"`
	MaxRedemptions            *int32          `json:"maxRedemptions"`
	RedemptionsCount          int32           `json:"redemptionsCount"`
	StartsAt                  *time.Time      `json:"startsAt"`
	ExpiresAt                 *time.Time      `json:"expiresAt"`
	PriceDiscountType         *string         `json:"priceDiscountType" enum:"PERCENTAGE,FIXED_AMOUNT"`
	PriceDiscountValue        *string         `json:"priceDiscountValue" doc:"A percentage in (0, 100], or an integer amount in minor units of currency" example:"30"`
	Currency                  *string         `json:"currency" doc:"The currency of a FIXED_AMOUNT discount" example:"EUR"`
	PriceAppliesTo            *string         `json:"priceAppliesTo" enum:"LICENSE_BASE,ADDONS,BOTH,SELECTED_PRICES"`
	ApplicableLicensePriceIDs []uuid.UUID     `json:"applicableLicensePriceIds" nullable:"false"`
	ApplicableAddonPriceIDs   []uuid.UUID     `json:"applicableAddonPriceIds" nullable:"false"`
	Grants                    []Grant         `json:"grants" nullable:"false" doc:"What an ENTITLEMENT_BOOST changes"`
	FlagGrants                []FlagGrant     `json:"flagGrants" nullable:"false" doc:"The flag variants a FLAG_GRANT grants"`
	ApplicableLicenseIDs      []uuid.UUID     `json:"applicableLicenseIds" nullable:"false" doc:"Only instances on these licence versions can redeem it; any when empty"`
	ApplicableAddonIDs        []uuid.UUID     `json:"applicableAddonIds" nullable:"false" doc:"Only instances holding one of these add-on versions can redeem it; any when empty"`
	RestrictedCustomerSlug    *string         `json:"restrictedCustomerSlug" doc:"Only this customer's instances can redeem it"`
	RedemptionRules           RedemptionRules `json:"redemptionRules"`
	CreatedAt                 time.Time       `json:"createdAt" readOnly:"true"`
	UpdatedAt                 time.Time       `json:"updatedAt" readOnly:"true"`
}

// TransformSchema publishes Voucher's absent members as null (§13.15); code
// stays absent outside read:vouchers.
func (Voucher) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	return nullable.Pointers(s, Voucher{})
}

// Grant is one entitlement change of an ENTITLEMENT_BOOST. A NUMBER grant
// carries modifierValue; a BOOLEAN or CONFIG one is a SET carrying value
// (V32-03 b).
type Grant struct {
	// Catalogue classification is retained privately; values remain canonical.
	EntitlementType string     `json:"-"`
	EntitlementSlug string     `json:"entitlementSlug" example:"tokens"`
	ModifierType    string     `json:"modifierType" enum:"SET,ADD,MULTIPLY,UNLIMITED" doc:"SET replaces the value, ADD adds to it, MULTIPLY multiplies it, UNLIMITED lifts the limit. A BOOLEAN or CONFIG entitlement takes SET only"`
	ModifierValue   *string    `json:"modifierValue" required:"false" doc:"A NUMBER grant's decimal: >= 0 for SET, > 0 for ADD and MULTIPLY, null for UNLIMITED; null on a BOOLEAN or CONFIG grant. Optional on write." example:"2"`
	Value           GrantValue `json:"value" required:"false" doc:"What a BOOLEAN or CONFIG SET grant sets: true or false, or the CONFIG document as an object; null on a NUMBER grant. Optional on write."`
}

// FlagGrant is the variant a FLAG_GRANT voucher grants of one flag (V32-03
// c): for its window, the flag answers this variant on the redeeming
// instance, whatever its targeting rules say; a disabled flag still wins.
type FlagGrant struct {
	FlagSlug string `json:"flagSlug" example:"new-dashboard"`
	Variant  string `json:"variant" minLength:"1" maxLength:"255" doc:"The name of one of the flag's variants" example:"on"`
}

// GrantValue is a BOOLEAN or CONFIG grant's value, raw JSON as sent: empty
// when absent.
type GrantValue json.RawMessage

// UnmarshalJSON keeps the raw value; null is no value.
func (v *GrantValue) UnmarshalJSON(raw []byte) error {
	if string(bytes.TrimSpace(raw)) == "null" {
		*v = nil
		return nil
	}
	*v = append((*v)[:0], raw...)
	return nil
}

// MarshalJSON writes the raw value, null when there is none.
func (v GrantValue) MarshalJSON() ([]byte, error) {
	if len(v) == 0 {
		return []byte("null"), nil
	}
	return v, nil
}

// Schema is a boolean or an object. anyOf with any JSON accepted: the use
// case matches the JSON type to the entitlement's (422 .InvalidGrant).
func (GrantValue) Schema(huma.Registry) *huma.Schema {
	return &huma.Schema{
		Description: "true or false for a BOOLEAN entitlement, the document as an object for a CONFIG one",
		AnyOf:       []*huma.Schema{{Type: huma.TypeBoolean}, {Type: huma.TypeObject, AdditionalProperties: true}, {Type: "null"}},
	}
}

// grantOf is a stored grant as the API returns it.
func grantOf(g db.ListVoucherGrantsRow) Grant {
	grant := Grant{EntitlementType: string(g.EntitlementType), EntitlementSlug: g.EntitlementSlug, ModifierType: string(g.ModifierType), ModifierValue: nil, Value: GrantValue(g.Value)}
	if g.ModifierValue != "" {
		value := formatDecimal(g.ModifierValue)
		grant.ModifierValue = &value
	}
	return grant
}

// RedemptionRules are the eligibility rules a redeeming instance must meet.
type RedemptionRules struct {
	FirstTimeOnly             bool           `json:"firstTimeOnly,omitempty" doc:"Only for a customer none of whose instances has paid an invoice"`
	AnnualOnly                bool           `json:"annualOnly,omitempty" doc:"Only for an instance with a live ANNUAL subscription"`
	MinimumSubscriptionAmount *MinimumAmount `json:"minimumSubscriptionAmount,omitempty" doc:"Only for a live subscription whose base price is at least this. Strictly positive; omit it for no minimum (0 is refused with .InvalidRedemptionRules)."`
}

// MinimumAmount is a base price floor.
type MinimumAmount struct {
	Currency          string `json:"currency" example:"EUR"`
	UnitAmountDecimal string `json:"unitAmountDecimal" doc:"In minor units, above 0" example:"2900"`
}

// Hint is the last four characters of a normalized code.
func Hint(normalized string) string {
	if len(normalized) <= 4 {
		return normalized
	}
	return normalized[len(normalized)-4:]
}

// ToVoucher maps a voucher row with its grants. withCode keeps the code.
func ToVoucher(row db.ListVouchersRow, grants []Grant, flagGrants []FlagGrant, withCode bool) Voucher {
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
		Grants: grants, FlagGrants: flagGrants, ApplicableLicenseIDs: nonNil(row.ApplicableLicenseIds), ApplicableAddonIDs: nonNil(row.ApplicableAddonIds),
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
	if v.FlagGrants == nil {
		v.FlagGrants = []FlagGrant{}
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
	flagGrants := map[uuid.UUID][]FlagGrant{}
	if len(ids) > 0 {
		grantRows, err := q.ListVoucherGrants(ctx, db.ListVoucherGrantsParams{OrganizationID: params.OrganizationID, VoucherIds: ids})
		if err != nil {
			return nil, err
		}
		for _, g := range grantRows {
			grants[g.VoucherID] = append(grants[g.VoucherID], grantOf(g))
		}
		flagRows, err := q.ListVoucherFlagGrants(ctx, db.ListVoucherFlagGrantsParams{OrganizationID: params.OrganizationID, VoucherIds: ids})
		if err != nil {
			return nil, err
		}
		for _, g := range flagRows {
			flagGrants[g.VoucherID] = append(flagGrants[g.VoucherID], FlagGrant{FlagSlug: g.FlagSlug, Variant: g.Variant})
		}
	}
	out := make([]Voucher, len(rows))
	for i, row := range rows {
		out[i] = ToVoucher(row, grants[row.ID], flagGrants[row.ID], withCode)
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
