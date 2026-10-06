package subscribeinstance

import (
	"context"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/events"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Subscriber is the one facade method this operation calls.
type Subscriber interface {
	Subscribe(ctx context.Context, cl caller.OrganizationCaller, instanceSlug string, cmd Command) (*StartedSubscription, error)
}

// NewSubscription is a subscription to start. Add-ons, vouchers, automatic
// collection and payment providers are not offered yet: the body takes none
// of them.
type NewSubscription struct {
	BasePriceID      uuid.UUID  `json:"basePriceId" doc:"An ACTIVE FLAT_FEE price of the instance's licence version, which must be PUBLISHED. The subscription stays pinned to it, even once deprecated."`
	ProviderKind     string     `json:"providerKind,omitempty" enum:"NOOP" doc:"Who collects the invoices. NOOP (the default): the organization itself, through the handoff queue."`
	CollectionMethod *string    `json:"collectionMethod,omitempty" enum:"SEND_INVOICE" doc:"Omitted: the organization's default, read at each invoice."`
	DaysUntilDue     *int32     `json:"daysUntilDue,omitempty" doc:"Payment terms in days, 0 to 365. Omitted: the organization's default, read at each invoice."`
	StartAt          *time.Time `json:"startAt,omitempty" doc:"The anchor periods are counted from, truncated to the second: now when omitted, else at most one billing period ago. A period that has already ended closes on the next pass."`
	TrialDays        *int32     `json:"trialDays,omitempty" doc:"Days of trial from the anchor: nothing is billed, and no usage counts, until it ends; the period close then issues the first invoice. 0 is no trial. Omitted: the licence's trialPeriodDays, else no trial."`
}

type Request struct {
	InstanceSlug string `path:"instanceSlug" doc:"Instance slug" example:"acme-prod"`
	Body         NewSubscription
}

type Response struct {
	Body *StartedSubscription
}

func RegisterEndpoint(api huma.API, app Subscriber) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "subscribeInstance",
		Method:        http.MethodPost,
		Path:          "/instances/{instanceSlug}/billing",
		Summary:       "Subscribe an instance",
		Description:   "Starts billing an instance on a FLAT_FEE price of its licence version. A base price that bills in advance issues the first period's invoice (ACTIVATION) at once; each period then closes into a RENEWAL. A CANCELED subscription is subscribed again. While the subscription is live the instance's customer and licence cannot change. Requires billing to be enabled for the organization.",
		Tags:          []string{"billing"},
		DefaultStatus: http.StatusCreated,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		started, err := app.Subscribe(ctx, cl, request.InstanceSlug, Command{
			BasePriceID:      request.Body.BasePriceID,
			CollectionMethod: request.Body.CollectionMethod,
			DaysUntilDue:     request.Body.DaysUntilDue,
			StartAt:          request.Body.StartAt,
			TrialDays:        request.Body.TrialDays,
		})
		if err != nil {
			return nil, err
		}
		return &Response{Body: started}, nil
	})
}

// RegisterWebhook declares the InstanceBillingStarted webhook contract.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       events.InstanceBillingStarted,
		Data:        (*BillingStarted)(nil),
		OperationID: "onInstanceBillingStarted",
		Summary:     "Instance Billing Started Webhook",
		Description: "Triggered when an instance is subscribed, or a CANCELED subscription subscribed again.",
		Tags:        []string{"webhooks", "billing"},
	})
}
