package markread

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

type Marker interface {
	MarkNotificationsRead(
		ctx context.Context, cl caller.OrganizationCaller, command Command,
	) (schema.MarkReadResult, error)
}

// ReadSelection is what to mark read: a page of ids, or everything.
type ReadSelection struct {
	IDs []uuid.UUID `json:"ids,omitempty" doc:"Notifications to mark read" maxItems:"200"`
	All bool        `json:"all,omitempty" doc:"Mark every notification read, up to now"`
}

type Request struct {
	Body ReadSelection
}

type Response struct {
	Body schema.MarkReadResult
}

func RegisterEndpoint(api huma.API, app Marker) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "markNotificationsRead",
		Method:      http.MethodPost,
		Path:        "/v1/notifications/mark-read",
		Summary:     "Mark notifications read",
		Description: "Marks the given notifications read for the signed-in user, or all of them with all: true. " +
			"Ids belonging to another organization are ignored rather than rejected, so a retry of a partially " +
			"applied call is safe.",
		Tags:   []string{"notifications"},
		Errors: []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		result, err := app.MarkNotificationsRead(ctx, cl, Command{
			IDs: request.Body.IDs,
			All: request.Body.All,
		})
		if err != nil {
			return nil, err
		}

		return &Response{Body: result}, nil
	})
}
