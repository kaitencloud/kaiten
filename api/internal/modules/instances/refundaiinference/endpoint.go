package refundaiinference

import (
	"context"
	"net/http"
	"strings"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Port is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Port interface {
	RefundAIInference(ctx context.Context, cl caller.OrganizationCaller, instanceSlug, entitlementSlug, transactionID string, command Command) (*Result, error)
}

// idempotencyKeyLocation is where a refusal of the key points (errors[].location).
const idempotencyKeyLocation = "header.Idempotency-Key"

type Request struct {
	InstanceSlug    string `path:"instanceSlug" doc:"Instance slug" example:"instance-slug"`
	EntitlementSlug string `path:"entitlementSlug" doc:"Slug of the AI credit pool" example:"ai-credits"`
	TransactionID   string `path:"transactionId" maxLength:"128" doc:"The transactionId the inference was reported under" example:"req-42"`
	// The key's presence and format are checked by the use case, so that both
	// refusals carry this operation's codes instead of Huma's generic 422.
	IdempotencyKey string `header:"Idempotency-Key" doc:"Required. The refund's idempotency key, in the format of a numeric report's: 1 to 128 characters of [A-Za-z0-9._:-], matched exactly and case-sensitively, scoped to the instance and the pool. The same key with the same inference, credits and reason answers 200 with the original refund and Idempotent-Replayed: true, and moves nothing, for as long as the refund is kept. The same key with another body, or a key a numeric report of the pool already used, answers 409 RefundAiInference.IdempotencyKeyReused. It is the transactionId of the refund's row in the usage journal." example:"refund-req-42-1"`
	Body           NewAiInferenceRefund
}

// Resolve trims the key the way a header value is read: a key sent as spaces
// is no key.
func (r *Request) Resolve(huma.Context) []error {
	r.IdempotencyKey = strings.TrimSpace(r.IdempotencyKey)
	return nil
}

// NewAiInferenceRefund is what a caller sends. Both members are optional: an
// empty object refunds everything the inference still has to give back.
type NewAiInferenceRefund struct {
	Credits *string `json:"credits,omitempty" pattern:"^[0-9]{1,12}(\\.[0-9]{1,6})?$" example:"3.4" doc:"Credits to give back, a positive decimal string. At most what the inference was charged minus what it was already refunded. Omit it to refund everything left."`
	Reason  *string `json:"reason,omitempty" minLength:"1" maxLength:"500" doc:"Why, kept with the refund and shown with it. Anyone who can read the organization's instances can read it."`
}

type Response struct {
	IdempotentReplayed string `header:"Idempotent-Replayed" doc:"true when the answer is the replay of an earlier refund sent under the same Idempotency-Key; nothing was refunded again"`
	Body               schema.AiInferenceRefund
}

func RegisterEndpoint(api huma.API, app Port) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "refundAiInference",
		Method:      http.MethodPost,
		Path:        "/instances/{instanceSlug}/entitlements/{entitlementSlug}/usage/inferences/{transactionId}/refund",
		Summary:     "Refund an AI inference",
		Description: "Gives back credits charged for one COMMITTED AI inference, in full or in part, any number of times until its charge is refunded. The counter moves through an ordinary negative usage report, written in the same transaction under the Idempotency-Key: it lands in the usage window open now, which is not the charge's once that window has closed, it is journalled with a reportSeq, and it emits the report's own events (ENTITLEMENT_USAGE_REPORT_ACCEPTED). Like any negative report it is never refused by the pool's limit, and the counter is not floored at zero. The refund is then listed on the inference (refunds, credits.refunded). The pool must still be granted to the instance, as for any report. Decimals are strings.",
		Tags:        []string{"instances"},
		Errors: []int{
			http.StatusBadRequest,
			http.StatusUnauthorized,
			http.StatusForbidden,
			http.StatusNotFound,
			http.StatusConflict,
			http.StatusUnprocessableEntity,
			http.StatusInternalServerError,
			http.StatusServiceUnavailable,
		},
	}, RequiredScope, func(ctx context.Context, req *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.RefundAIInference(ctx, cl, req.InstanceSlug, req.EntitlementSlug, req.TransactionID,
			Command{Key: req.IdempotencyKey, Credits: req.Body.Credits, Reason: req.Body.Reason})
		if err != nil {
			return nil, err
		}
		response := &Response{IdempotentReplayed: "", Body: result.Refund}
		if result.Replayed {
			response.IdempotentReplayed = "true"
		}
		return response, nil
	})
}
