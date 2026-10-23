package confirmcheckoutsession

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/checkout"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Confirmer is the one facade method this operation calls.
type Confirmer interface {
	ConfirmCheckoutSession(ctx context.Context, cl caller.CheckoutSessionCaller) (*checkout.CheckoutConfirmation, error)
}

type Request struct {
	SessionID uuid.UUID `path:"sessionId" doc:"The session the ksc_ was minted for; another one answers 401"`
}

type Response struct {
	CacheControl string `header:"Cache-Control"`
	Vary         string `header:"Vary"`
	Body         *checkout.CheckoutConfirmation
}

func RegisterEndpoint(api huma.API, app Confirmer) {
	kaitenhuma.RegisterCheckoutSession(api, huma.Operation{
		OperationID: "confirmCheckoutSession",
		Method:      http.MethodPost,
		Path:        kaitenhuma.CheckoutSessionsPath + "/{sessionId}/confirm",
		Summary:     "Confirm an anonymous checkout",
		Description: "Completes the session when nothing has to be captured -- a FREE plan, a trial on a plan that needs no payment method, nothing due -- " +
			"creating the customer, the instance and the subscription in one transaction: status=completed. " +
			"Otherwise answers status=requires_payment_method with a hosted setup page, keeps the ksc_ across its redirect, and completes on the next confirm: " +
			"awaiting_payment while the first invoice is charged, completed once paid. No body. " +
			"403 .AnonymousCheckoutDisabled; 409 .SessionClosed (errors[0].value.status), .DueTodayChanged, .EntitlementLimitReached; " +
			"422 .PriceNotPublic, .AddonNotPublic, .FallbackRequired, .ProviderCannotCapturePayment, .VoucherInvalid; " +
			"429 .RateLimited (Retry-After): 30 confirms per 10 minutes per visitor address, 1,000 an hour per key; " +
			"503 .ProviderUnavailable (Retry-After), Entitlement.VerificationUnavailable.",
		Tags:   []string{"public"},
		Errors: []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusTooManyRequests, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, func(ctx context.Context, _ *Request) (*Response, error) {
		cl, err := caller.CheckoutSession(ctx)
		if err != nil {
			return nil, err
		}
		confirmation, err := app.ConfirmCheckoutSession(ctx, cl)
		if err != nil {
			return nil, err
		}
		return &Response{CacheControl: "no-store", Vary: "Origin, Authorization", Body: confirmation}, nil
	})
}
