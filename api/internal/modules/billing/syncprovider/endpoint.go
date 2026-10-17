package syncprovider

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Syncer is the one facade method this operation calls.
type Syncer interface {
	SyncProvider(ctx context.Context, cl caller.OrganizationCaller) (*SyncReport, error)
}

type Request struct{}

type Response struct {
	Body *SyncReport
}

func RegisterEndpoint(api huma.API, app Syncer) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "syncBillingProvider",
		Method:        http.MethodPost,
		Path:          "/billing/sync",
		Summary:       "Sync with the payment providers now",
		Description:   "Runs one sync pass now for each payment provider the organization has connected: payments, voids and finalizations done in the provider are mirrored, as the periodic pass does. Refused when none is connected (409 SyncProvider.NotConnected). Requires billing to be enabled for the organization.",
		Tags:          []string{"billing"},
		DefaultStatus: http.StatusAccepted,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusConflict, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, _ *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		report, err := app.SyncProvider(ctx, cl)
		if err != nil {
			return nil, err
		}
		return &Response{Body: report}, nil
	})
}
