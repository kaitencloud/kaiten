package conversionrules

import (
	"context"
	"errors"
	"regexp"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/shopspring/decimal"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usage/aicredit"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

var (
	ratePattern  = regexp.MustCompile(`^[0-9]{1,8}(\.[0-9]{1,10})?$`)
	boundPattern = regexp.MustCompile(`^[0-9]{1,12}(\.[0-9]{1,6})?$`)
)

// Prepare also validates facade callers: HTTP schema validation is not the domain.
func Prepare(p Pricing, operation string) (db.CreateConversionRuleParams, error) {
	var params db.CreateConversionRuleParams
	if p.MinimumCreditsPerRequest == "" {
		p.MinimumCreditsPerRequest = "0"
	}
	if p.ChargeOnError == "" {
		p.ChargeOnError = aicredit.Never
	}
	values := []*string{p.Rates.PerRequest, p.Rates.PerInputToken, p.Rates.PerCachedInputToken, p.Rates.PerCacheWriteToken, p.Rates.PerOutputToken, p.Rates.PerUnit, p.Rates.PerSecond}
	decimals := make([]*decimal.Decimal, 7)
	numbers := []*pgtype.Numeric{&params.RatePerRequest, &params.RatePerInputToken, &params.RatePerCachedInputToken, &params.RatePerCacheWriteToken, &params.RatePerOutputToken, &params.RatePerUnit, &params.RatePerSecond}
	present := false
	for i, v := range values {
		if v == nil {
			continue
		}
		present = true
		if !ratePattern.MatchString(*v) {
			return params, apierrors.UnprocessableEntity(operation+".InvalidRates", "rates must be nonnegative decimal strings with at most 8 integer and 10 fractional digits")
		}
		d, err := decimal.NewFromString(*v)
		if err != nil {
			return params, err
		}
		decimals[i] = &d
		if err := numbers[i].Scan(*v); err != nil {
			return params, err
		}
	}
	if !present {
		return params, apierrors.UnprocessableEntity(operation+".NoRate", "at least one rate is required")
	}
	if !boundPattern.MatchString(p.MinimumCreditsPerRequest) || (p.MaximumCreditsPerRequest != nil && !boundPattern.MatchString(*p.MaximumCreditsPerRequest)) {
		return params, apierrors.UnprocessableEntity(operation+".InvalidBounds", "credit bounds must be nonnegative decimal strings with at most 12 integer and 6 fractional digits")
	}
	minimum, err := decimal.NewFromString(p.MinimumCreditsPerRequest)
	if err != nil {
		return params, err
	}
	var maximum *decimal.Decimal
	if p.MaximumCreditsPerRequest != nil {
		d, err := decimal.NewFromString(*p.MaximumCreditsPerRequest)
		if err != nil {
			return params, err
		}
		maximum = &d
		if err := params.MaximumCreditsPerRequest.Scan(*p.MaximumCreditsPerRequest); err != nil {
			return params, err
		}
	}
	rule := aicredit.Rule{Rates: aicredit.Rates{Request: decimals[0], InputToken: decimals[1], CachedInputToken: decimals[2], CacheWriteToken: decimals[3], OutputToken: decimals[4], Unit: decimals[5], Second: decimals[6]}, Minimum: minimum, Maximum: maximum, ChargeOnError: p.ChargeOnError}
	if err := rule.Validate(); err != nil {
		return params, apierrors.UnprocessableEntity(operation+".InvalidPricing", err.Error())
	}
	params.ChargeOnError = db.ChargeOnErrorPolicy(p.ChargeOnError)
	if err := params.MinimumCreditsPerRequest.Scan(p.MinimumCreditsPerRequest); err != nil {
		return params, err
	}
	return params, nil
}

func ValidateRequestType(v *aicredit.RequestType, operation string) error {
	if v == nil {
		return nil
	}
	switch *v {
	case aicredit.Completion, aicredit.Embedding, aicredit.ImageGeneration, aicredit.Audio, aicredit.Video:
		return nil
	}
	return apierrors.UnprocessableEntity(operation+".InvalidRequestType", "invalid request type")
}

func CheckIdentity(cmd *UpdateConversionRule, before *schema.ConversionRule) error {
	if (cmd.EntitlementSet || cmd.EntitlementSlug != nil) && (cmd.EntitlementSlug == nil || *cmd.EntitlementSlug != before.EntitlementSlug) {
		return apierrors.UnprocessableEntity("UpdateConversionRule.ImmutableEntitlement", "entitlementSlug is immutable")
	}
	if (cmd.ModelSet || cmd.ModelSlug != nil) && !equal(cmd.ModelSlug, before.ModelSlug) {
		return apierrors.UnprocessableEntity("UpdateConversionRule.ImmutableModel", "modelSlug is immutable")
	}
	if (cmd.RequestTypeSet || cmd.RequestType != nil) && !equal(cmd.RequestType, before.RequestType) {
		return apierrors.UnprocessableEntity("UpdateConversionRule.ImmutableRequestType", "requestType is immutable")
	}
	return nil
}

func equal[T comparable](a, b *T) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

func LicenseID(ctx context.Context, q *db.Queries, org uuid.UUID, slug, operation string) (uuid.UUID, error) {
	row, err := q.GetOneLicense(ctx, db.GetOneLicenseParams{OrganizationID: org, Slug: slug})
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, apierrors.NotFound(operation+".LicenseNotFound", "license not found")
	}
	return row.ID, err
}

func Get(ctx context.Context, q *db.Queries, org, license, id uuid.UUID, operation string) (*schema.ConversionRule, error) {
	rows, err := q.ListConversionRules(ctx, db.ListConversionRulesParams{OrganizationID: org, LicenseIds: []uuid.UUID{license}, RuleID: &id, Status: nil, EntitlementSlug: nil, ModelSlug: nil})
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, apierrors.NotFound(operation+".NotFound", "conversion rule not found")
	}
	return Present(rows[0]), nil
}

func Present(r db.ListConversionRulesRow) *schema.ConversionRule {
	var request *aicredit.RequestType
	if r.RequestType != nil {
		v := aicredit.RequestType(*r.RequestType)
		request = &v
	}
	return &schema.ConversionRule{
		ID: r.ID, LicenseSlug: r.LicenseSlug, EntitlementSlug: r.EntitlementSlug, ModelSlug: r.ModelSlug, RequestType: request,
		Rates:                    schema.ConversionRates{PerRequest: number(r.RatePerRequest), PerInputToken: number(r.RatePerInputToken), PerCachedInputToken: number(r.RatePerCachedInputToken), PerCacheWriteToken: number(r.RatePerCacheWriteToken), PerOutputToken: number(r.RatePerOutputToken), PerUnit: number(r.RatePerUnit), PerSecond: number(r.RatePerSecond)},
		MinimumCreditsPerRequest: *number(r.MinimumCreditsPerRequest), MaximumCreditsPerRequest: number(r.MaximumCreditsPerRequest), ChargeOnError: aicredit.ChargeOnError(r.ChargeOnError), Status: schema.ConversionRuleStatus(r.Status), GrantedByLicense: r.GrantedByLicense, CreatedAt: r.CreatedAt.Time, UpdatedAt: r.UpdatedAt.Time,
	}
}

func number(n pgtype.Numeric) *string {
	if !n.Valid {
		return nil
	}
	v := decimal.NewFromBigInt(n.Int, n.Exp).String()
	return &v
}

func WriteError(err error, operation string) error {
	var pg *pgconn.PgError
	if errors.As(err, &pg) && pg.Code == "23505" {
		switch pg.ConstraintName {
		case "ccr_active_model_type_key", "ccr_active_model_key", "ccr_active_type_key", "ccr_active_any_key":
			return apierrors.Conflict("CreateConversionRule.Conflict", "an active rule already has this identity")
		}
	}
	if errors.As(err, &pg) && pg.Code == "23503" {
		switch pg.ConstraintName {
		case "ccr_license_id_fkey", "ccr_entitlement_id_fkey", "ccr_model_id_fkey":
			return apierrors.NotFound(operation+".ReferenceNotFound", "conversion rule reference no longer exists")
		}
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return apierrors.Forbidden("CurrentUser.NotInOrganization", "actor is not an active organization member")
	}
	return err
}

func RequireWrite(rows int64, err error, operation string) error {
	if err != nil {
		return WriteError(err, operation)
	}
	if rows != 1 {
		return apierrors.Forbidden("CurrentUser.NotInOrganization", "actor is not an active organization member")
	}
	return nil
}
