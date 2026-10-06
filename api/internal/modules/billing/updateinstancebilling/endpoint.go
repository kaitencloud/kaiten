package updateinstancebilling

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Updater is the one facade method this operation calls.
type Updater interface {
	UpdateInstanceBilling(ctx context.Context, cl caller.OrganizationCaller, instanceSlug string, cmd Command) (*subscriptions.InstanceBilling, error)
}

// SubscriptionTerms is a change of a subscription's own terms. An omitted
// member is left alone; null restores the organization's default.
type SubscriptionTerms struct {
	ProviderKind     *string `json:"providerKind,omitempty" enum:"NOOP" doc:"Who collects the invoices. Only NOOP is available until a payment provider is."`
	CollectionMethod *string `json:"collectionMethod,omitempty" enum:"SEND_INVOICE" nullable:"true" doc:"null: the organization's default"`
	DaysUntilDue     *int32  `json:"daysUntilDue,omitempty" nullable:"true" doc:"0 to 365; null: the organization's default"`
}

type Request struct {
	InstanceSlug string `path:"instanceSlug" doc:"Instance slug" example:"acme-prod"`
	Body         SubscriptionTerms
	RawBody      []byte
}

type Response struct {
	Body *subscriptions.InstanceBilling
}

func RegisterEndpoint(api huma.API, app Updater) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "updateInstanceBilling",
		Method:      http.MethodPatch,
		Path:        "/instances/{instanceSlug}/billing",
		Summary:     "Change a subscription's terms",
		Description: "Changes the subscription's collection method and payment terms from its next invoice on; null restores the organization's default. Invoices already composed keep their own. Requires billing to be enabled for the organization.",
		Tags:        []string{"billing"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		// Which members were sent at all, null included: the decoded body
		// cannot tell null from absent.
		var present map[string]json.RawMessage
		_ = json.Unmarshal(request.RawBody, &present)
		_, methodSet := present["collectionMethod"]
		_, daysSet := present["daysUntilDue"]
		billing, err := app.UpdateInstanceBilling(ctx, cl, request.InstanceSlug, Command{
			CollectionMethod: Optional[string]{Set: methodSet, Value: request.Body.CollectionMethod},
			DaysUntilDue:     Optional[int32]{Set: daysSet, Value: request.Body.DaysUntilDue},
		})
		if err != nil {
			return nil, err
		}
		return &Response{Body: billing}, nil
	})
}
