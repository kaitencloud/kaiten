// Package aicredit resolves a credit pool's price vector and prices provider
// usage. It is pure: no clock, database, counter or entitlement gate lives here.
package aicredit

import (
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

type ModelStatus string

const (
	Active     ModelStatus = "ACTIVE"
	Deprecated ModelStatus = "DEPRECATED"
	Archived   ModelStatus = "ARCHIVED"
)

type RequestType string

const (
	Completion      RequestType = "COMPLETION"
	Embedding       RequestType = "EMBEDDING"
	ImageGeneration RequestType = "IMAGE_GENERATION"
	Audio           RequestType = "AUDIO"
	Video           RequestType = "VIDEO"
)

type RequestStatus string

const (
	Success       RequestStatus = "SUCCESS"
	ProviderError RequestStatus = "PROVIDER_ERROR"
	CustomerError RequestStatus = "CUSTOMER_ERROR"
	NotSent       RequestStatus = "NOT_SENT"
)

type ChargeOnError string

const (
	Never             ChargeOnError = "NEVER"
	Always            ChargeOnError = "ALWAYS"
	ProviderErrorOnly ChargeOnError = "PROVIDER_ERROR_ONLY"
)

type Model struct {
	ID     uuid.UUID
	Status ModelStatus
}

// Nil rates are absent, not zero-priced. Cache rates fall back to InputToken.
type Rates struct {
	Request          *decimal.Decimal
	InputToken       *decimal.Decimal
	CachedInputToken *decimal.Decimal
	CacheWriteToken  *decimal.Decimal
	OutputToken      *decimal.Decimal
	Unit             *decimal.Decimal
	Second           *decimal.Decimal
}

type Rule struct {
	ID            uuid.UUID
	ModelID       *uuid.UUID
	RequestType   *RequestType
	Active        bool
	Rates         Rates
	Minimum       decimal.Decimal
	Maximum       *decimal.Decimal
	ChargeOnError ChargeOnError
}

type Specificity string

const (
	ExactTyped Specificity = "EXACT_TYPED"
	ExactAll   Specificity = "EXACT_ALL"
	AnyTyped   Specificity = "ANY_TYPED"
	AnyAll     Specificity = "ANY_ALL"
)

// Resolve considers only the caller's licence/pool rules. Unknown and archived
// models are never priced, even by a wildcard; deprecated models remain valid.
func Resolve(rules []Rule, model *Model, requestType RequestType) (*Rule, Specificity) {
	if model == nil || model.Status == Archived {
		return nil, ""
	}
	var best *Rule
	bestRank := 5
	var specificity Specificity
	for i := range rules {
		rule := &rules[i]
		if !rule.Active || (rule.ModelID != nil && *rule.ModelID != model.ID) || (rule.RequestType != nil && *rule.RequestType != requestType) {
			continue
		}
		rank, kind := 4, AnyAll
		if rule.ModelID != nil && rule.RequestType != nil {
			rank, kind = 1, ExactTyped
		} else if rule.ModelID != nil {
			rank, kind = 2, ExactAll
		} else if rule.RequestType != nil {
			rank, kind = 3, AnyTyped
		}
		if rank < bestRank {
			best, bestRank, specificity = rule, rank, kind
		}
	}
	return best, specificity
}

// Pointers distinguish absent usage from an explicitly reported zero.
type Usage struct {
	InputTokens           *int64
	CacheReadInputTokens  *int64
	CacheWriteInputTokens *int64
	OutputTokens          *int64
	Units                 *decimal.Decimal
	DurationMS            *int64
}

type Charge struct {
	Computed     decimal.Decimal
	Charged      decimal.Decimal
	MissingInput bool
}

var ErrInvalidUsage = errors.New("AI usage quantities must be nonnegative")

func (u Usage) Validate() error {
	for _, quantity := range []*int64{u.InputTokens, u.CacheReadInputTokens, u.CacheWriteInputTokens, u.OutputTokens, u.DurationMS} {
		if quantity != nil && *quantity < 0 {
			return ErrInvalidUsage
		}
	}
	if u.Units != nil && u.Units.IsNegative() {
		return ErrInvalidUsage
	}
	return nil
}

// Validate refuses a malformed price vector before it can become a live rule.
func (r Rule) Validate() error {
	present := false
	for _, rate := range []*decimal.Decimal{r.Rates.Request, r.Rates.InputToken, r.Rates.CachedInputToken, r.Rates.CacheWriteToken, r.Rates.OutputToken, r.Rates.Unit, r.Rates.Second} {
		if rate != nil {
			present = true
			if rate.IsNegative() || !rate.Equal(rate.Round(10)) {
				return errors.New("rates must be nonnegative with at most 10 decimal places")
			}
		}
	}
	if !present {
		return errors.New("at least one rate is required")
	}
	if r.Minimum.IsNegative() || !r.Minimum.Equal(r.Minimum.Round(6)) {
		return errors.New("minimum must be nonnegative with at most 6 decimal places")
	}
	if r.Maximum != nil && (r.Maximum.LessThan(r.Minimum) || !r.Maximum.Equal(r.Maximum.Round(6))) {
		return errors.New("maximum must be at least the minimum with at most 6 decimal places")
	}
	switch r.ChargeOnError {
	case Never, Always, ProviderErrorOnly:
		return nil
	default:
		return errors.New("invalid charge-on-error policy")
	}
}

// Price applies the vector, policy, clamp, then half-up quantization. NOT_SENT
// never charges, even under ALWAYS. A present zero is not missing input.
func Price(rule Rule, usage Usage, status RequestStatus) (Charge, error) {
	if err := rule.Validate(); err != nil {
		return Charge{}, err
	}
	if err := usage.Validate(); err != nil {
		return Charge{}, err
	}
	allowed := false
	switch status {
	case Success:
		allowed = true
	case ProviderError:
		allowed = rule.ChargeOnError == Always || rule.ChargeOnError == ProviderErrorOnly
	case CustomerError:
		allowed = rule.ChargeOnError == Always
	case NotSent:
	default:
		return Charge{}, fmt.Errorf("invalid request status %q", status)
	}
	computed := decimal.Zero
	present := false
	add := func(rate, quantity *decimal.Decimal) {
		if rate != nil && quantity != nil {
			present = true
			computed = computed.Add(rate.Mul(*quantity))
		}
	}
	integer := func(value *int64) *decimal.Decimal {
		if value == nil {
			return nil
		}
		quantity := decimal.NewFromInt(*value)
		return &quantity
	}
	one := decimal.NewFromInt(1)
	add(rule.Rates.Request, &one)
	add(rule.Rates.InputToken, integer(usage.InputTokens))
	cacheRead, cacheWrite := rule.Rates.CachedInputToken, rule.Rates.CacheWriteToken
	if cacheRead == nil {
		cacheRead = rule.Rates.InputToken
	}
	if cacheWrite == nil {
		cacheWrite = rule.Rates.InputToken
	}
	add(cacheRead, integer(usage.CacheReadInputTokens))
	add(cacheWrite, integer(usage.CacheWriteInputTokens))
	add(rule.Rates.OutputToken, integer(usage.OutputTokens))
	add(rule.Rates.Unit, usage.Units)
	if duration := integer(usage.DurationMS); duration != nil {
		seconds := duration.Shift(-3)
		add(rule.Rates.Second, &seconds)
	}
	if !present {
		computed = rule.Minimum
	}
	charged := decimal.Zero
	if allowed {
		charged = decimal.Max(computed, rule.Minimum)
		if rule.Maximum != nil {
			charged = decimal.Min(charged, *rule.Maximum)
		}
	}
	return Charge{Computed: computed.Round(6), Charged: charged.Round(6), MissingInput: !present}, nil
}
