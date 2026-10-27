package updatebillingsettings

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/settings"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Updater is the one facade method this operation calls.
type Updater interface {
	UpdateSettings(ctx context.Context, cl caller.OrganizationCaller, next settings.BillingSettings) (*settings.BillingSettings, error)
}

type Request struct {
	Body settings.BillingSettings
}

type Response struct {
	Body *settings.BillingSettings
}

func RegisterEndpoint(api huma.API, app Updater) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "updateBillingSettings",
		Method:      http.MethodPut,
		Path:        "/billing/settings",
		Summary:     "Update billing settings",
		Description: "Replaces the organization's billing defaults. A subscription that names its own terms keeps them; the others take these at their next invoice.",
		Tags:        []string{"billing"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		updated, err := app.UpdateSettings(ctx, cl, request.Body)
		if err != nil {
			return nil, err
		}
		return &Response{Body: updated}, nil
	})
}
