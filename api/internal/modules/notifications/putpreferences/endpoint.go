package putpreferences

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

type Writer interface {
	PutNotificationPreferences(
		ctx context.Context, cl caller.OrganizationCaller, updates []schema.PreferenceUpdate,
	) (schema.PreferenceMatrix, error)
}

// PreferenceChoices is the set of events a user is changing.
type PreferenceChoices struct {
	Events []schema.PreferenceUpdate `json:"events" required:"true" doc:"Events to set; events left out keep their current value"`
}

type Request struct {
	Body PreferenceChoices
}

type Response struct {
	Body schema.PreferenceMatrix
}

func RegisterEndpoint(api huma.API, app Writer) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "putNotificationPreferences",
		Method:      http.MethodPut,
		Path:        "/v1/notification-preferences",
		Summary:     "Set the caller's notification preferences",
		Description: "Stores the signed-in user's choices and answers with the whole matrix. A value that " +
			"equals the catalogue default is stored as no row at all, so a later change to that default still " +
			"reaches this user.",
		Tags:   []string{"notifications"},
		Errors: []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		matrix, err := app.PutNotificationPreferences(ctx, cl, request.Body.Events)
		if err != nil {
			return nil, err
		}

		return &Response{Body: matrix}, nil
	})
}
