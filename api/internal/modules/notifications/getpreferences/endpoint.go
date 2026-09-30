package getpreferences

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

type PreferenceReader interface {
	GetNotificationPreferences(ctx context.Context, cl caller.OrganizationCaller) (schema.PreferenceMatrix, error)
}

type Request struct{}

type Response struct {
	Body schema.PreferenceMatrix
}

func RegisterEndpoint(api huma.API, app PreferenceReader) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "getNotificationPreferences",
		Method:      http.MethodGet,
		Path:        "/v1/notification-preferences",
		Summary:     "Read the caller's notification preferences",
		Description: "Every notifiable event, with this user's effective value per channel: their own choice " +
			"where they made one, the catalogue default otherwise. Events absent from the catalogue of a " +
			"deployment never appear, which is what keeps high-volume system events out of the feed.",
		Tags:   []string{"notifications"},
		Errors: []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, _ *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		matrix, err := app.GetNotificationPreferences(ctx, cl)
		if err != nil {
			return nil, err
		}

		return &Response{Body: matrix}, nil
	})
}
