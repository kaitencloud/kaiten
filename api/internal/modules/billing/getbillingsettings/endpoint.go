package getbillingsettings

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/settings"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Getter is the one facade method this operation calls.
type Getter interface {
	GetSettings(ctx context.Context, cl caller.OrganizationCaller) (*settings.BillingSettings, error)
}

type Response struct {
	Body *settings.BillingSettings
}

func RegisterEndpoint(api huma.API, app Getter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "getBillingSettings",
		Method:      http.MethodGet,
		Path:        "/billing/settings",
		Summary:     "Get billing settings",
		Description: "The organization's billing defaults: the collection method and payment terms a subscription gets when it names none of its own. An organization that never wrote them has the defaults (SEND_INVOICE, 30 days).",
		Tags:        []string{"billing"},
		Errors:      []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, _ *struct{}) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		current, err := app.GetSettings(ctx, cl)
		if err != nil {
			return nil, err
		}
		return &Response{Body: current}, nil
	})
}
