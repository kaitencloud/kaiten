package schema

import (
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usage/aicredit"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
)

// AiVendorCostCurrency is the currency of the model catalogue's costs.
const AiVendorCostCurrency = "USD"

// AiInferenceRates are the rule's rates as exact decimal strings, under the
// names a conversion rule gives them (the licences schema imports this
// package, so its ConversionRates cannot be reused here). Absent is unpriced,
// not zero.
type AiInferenceRates struct {
	PerRequest          *string `json:"perRequest,omitempty"`
	PerInputToken       *string `json:"perInputToken,omitempty"`
	PerCachedInputToken *string `json:"perCachedInputToken,omitempty"`
	PerCacheWriteToken  *string `json:"perCacheWriteToken,omitempty"`
	PerOutputToken      *string `json:"perOutputToken,omitempty"`
	PerUnit             *string `json:"perUnit,omitempty"`
	PerSecond           *string `json:"perSecond,omitempty"`
}

// AiInferencePricing is the conversion rule as it was when it priced the
// operation: the record keeps explaining the charge after the rule is edited
// or archived. It is also the document stored in ai_inference.pricing.
type AiInferencePricing struct {
	RuleID                   uuid.UUID              `json:"ruleId" format:"uuid"`
	Specificity              aicredit.Specificity   `json:"specificity" enum:"EXACT_TYPED,EXACT_ALL,ANY_TYPED,ANY_ALL" doc:"How the rule matched: its own model and request type, its own model for every request type, any model for its request type, or any model and request type."`
	Rates                    AiInferenceRates       `json:"rates"`
	MinimumCreditsPerRequest string                 `json:"minimumCreditsPerRequest" pattern:"^[0-9]{1,12}(\\.[0-9]{1,6})?$" example:"0.001"`
	MaximumCreditsPerRequest *string                `json:"maximumCreditsPerRequest" pattern:"^[0-9]{1,12}(\\.[0-9]{1,6})?$" example:"0.001"`
	ChargeOnError            aicredit.ChargeOnError `json:"chargeOnError" enum:"NEVER,ALWAYS,PROVIDER_ERROR_ONLY"`
}

// AiVendorCost is what the provider request cost, never what was charged.
type AiVendorCost struct {
	Reported *string `json:"reported,omitempty" doc:"As sent by the caller on the commit."`
	Computed *string `json:"computed,omitempty" doc:"From the model's catalogue costs and the reported usage. Absent when the model is not in the catalogue or the request was never sent."`
	Currency string  `json:"currency" enum:"USD"`
}

type AiInference struct {
	TransactionID    string     `json:"transactionId"`
	Status           string     `json:"status" enum:"RESERVED,COMMITTED,RELEASED,EXPIRED"`
	ReportedAt       time.Time  `json:"reportedAt"`
	CommittedAt      *time.Time `json:"committedAt,omitempty"`
	ExpiresAt        *time.Time `json:"expiresAt,omitempty"`
	Model            string     `json:"model"`
	ModelSlug        *string    `json:"modelSlug,omitempty"`
	RequestType      string     `json:"requestType" enum:"COMPLETION,EMBEDDING,IMAGE_GENERATION,AUDIO,VIDEO"`
	RequestStatus    *string    `json:"requestStatus,omitempty"`
	Usage            AiUsage    `json:"usage"`
	Authorized       *bool      `json:"authorized,omitempty"`
	DenialReason     *string    `json:"denialReason,omitempty"`
	ConversionRuleID *string    `json:"conversionRuleId,omitempty"`
	Credits          AiCredits  `json:"credits"`
	ValueBefore      *float64   `json:"valueBefore,omitempty"`
	ValueAfter       *float64   `json:"valueAfter,omitempty"`
	WindowStart      *time.Time `json:"windowStart,omitempty"`

	// Optional objects are omitempty pointers: Huma cannot mark a $ref nullable.
	Pricing     *AiInferencePricing `json:"pricing,omitempty" doc:"The rule snapshot that priced the operation. Absent when no rule applied, and on operations recorded before snapshots existed."`
	LicenseID   *string             `json:"licenseId,omitempty" format:"uuid" doc:"The licence whose conversion rules were considered."`
	LicenseSlug *string             `json:"licenseSlug,omitempty" doc:"Absent once the licence is deleted."`
	Warnings    []string            `json:"warnings" nullable:"false" doc:"The warnings of the phase that last wrote the operation."`
	ReportSeq   *int64              `json:"reportSeq,omitempty" doc:"The pool's report counter when the operation was counted: the link to the usage journal."`
	VendorCost  *AiVendorCost       `json:"vendorCost,omitempty"`
	Refunds     []AiInferenceRefund `json:"refunds" nullable:"false" doc:"The refunds of the operation's charge, oldest first. Their sum is credits.refunded."`
}

// AiInferenceRefund is credits given back on one inference's charge. The
// counter movement is an ordinary negative report, the usage journal's row
// reportSeq; this is the link from that movement to the inference it corrects.
type AiInferenceRefund struct {
	ID        uuid.UUID   `json:"id" format:"uuid"`
	Credits   string      `json:"credits" pattern:"^[0-9]{1,32}(\\.[0-9]{1,6})?$" example:"3.4" doc:"Credits given back, a positive decimal."`
	Reason    *string     `json:"reason,omitempty" maxLength:"500" doc:"Why, as the caller wrote it."`
	ReportSeq int64       `json:"reportSeq" doc:"The pool's report counter of the negative report that moved the counter: the link to the usage journal."`
	CreatedAt time.Time   `json:"createdAt" doc:"The instant the refund's report was dated by."`
	CreatedBy shared.User `json:"createdBy" doc:"Who refunded; a service account is a user."`
}

// OrganizationAiInference is an inference in the organization-wide listing,
// where the instance and the pool are not given by the path.
type OrganizationAiInference struct {
	AiInference
	InstanceSlug    *string `json:"instanceSlug,omitempty" doc:"Absent once the instance is deleted."`
	EntitlementSlug *string `json:"entitlementSlug,omitempty" doc:"Absent once the entitlement is deleted."`
}

type OrganizationAiInferencePage struct {
	Items      []OrganizationAiInference `json:"items"`
	NextCursor *string                   `json:"nextCursor,omitempty"`
	HasMore    bool                      `json:"hasMore"`
}

type AiInferencePage struct {
	Items      []AiInference `json:"items"`
	NextCursor *string       `json:"nextCursor,omitempty"`
	HasMore    bool          `json:"hasMore"`
}

type AiReservations struct {
	Items []AiInference `json:"items"`
}
