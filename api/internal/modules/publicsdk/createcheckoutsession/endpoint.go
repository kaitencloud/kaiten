package createcheckoutsession

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/checkout"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Starter is the one facade method this operation calls.
type Starter interface {
	CreateCheckoutSession(ctx context.Context, cl caller.PublishableKeyCaller, draft checkout.CheckoutSessionDraft) (*checkout.CheckoutSessionStart, error)
}

type Request struct {
	Body checkout.CheckoutSessionDraft
}

type Response struct {
	Status int
	// It holds an e-mail and a token: never cached, varied on its credential.
	CacheControl string `header:"Cache-Control"`
	Vary         string `header:"Vary"`
	Body         *checkout.CheckoutSessionStart
}

func RegisterEndpoint(api huma.API, app Starter) {
	kaitenhuma.RegisterPublishable(api, huma.Operation{
		OperationID: "createCheckoutSession",
		Method:      http.MethodPost,
		Path:        kaitenhuma.CheckoutSessionsPath,
		Summary:     "Start an anonymous checkout",
		Description: "Starts a checkout for a visitor the vendor's backend does not know yet, with the publishable key and a Turnstile token. " +
			"Writes one checkout session and nothing else: the customer, the instance and the subscription are created by the completion. " +
			"Answers 201 status=open with the session's ksc_ token, returned once; with dryRun, 200 status=preview, writing and emitting nothing. " +
			"dueToday is computed by the server. " +
			"403 .AnonymousCheckoutDisabled; 422 .TurnstileNotConfigured, .TurnstileFailed, .InvalidPriceSelection, .PriceNotPublic, .AddonNotPublic, " +
			".PriceNotFlatFee, .NotSelfServe, .ProviderCannotCapturePayment, .QuantityExceedsMax, .CurrencyMismatch, .InvalidEmail, .InvalidReturnUrl, " +
			".VoucherInvalid, .FallbackRequired; 429 .RateLimited (Retry-After): 10 starts per 10 minutes and 30 an hour per visitor address, dryRun included, " +
			"1,000 an hour per key; 503 .TurnstileUnavailable (Retry-After).",
		Tags:          []string{"public"},
		Metadata:      kaitenhuma.AlsoResponds(http.StatusOK, "A preview (dryRun): nothing was written"),
		DefaultStatus: http.StatusCreated,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusUnprocessableEntity, http.StatusTooManyRequests, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.PublishableKey(ctx)
		if err != nil {
			return nil, err
		}
		start, err := app.CreateCheckoutSession(ctx, cl, request.Body)
		if err != nil {
			return nil, err
		}
		status := http.StatusCreated
		if start.Status == checkout.StartPreview {
			status = http.StatusOK
		}
		return &Response{Status: status, CacheControl: "no-store", Vary: "Origin, X-Kaiten-Publishable-Key", Body: start}, nil
	})
}
