package listnotifications

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/feed"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

type Lister interface {
	ListNotifications(ctx context.Context, cl caller.OrganizationCaller, query Query) (schema.List, error)
}

type Request struct {
	Status string `query:"status" enum:"all,unread" doc:"Which notifications to return (default all)"`
	// Repeated rather than comma-separated (`explode`), which is how generated
	// clients send an array by default.
	ObjectTypes []string `query:"objectType,explode" enum:"instance,customer,release,deployment_zone,component,license,token" doc:"Only notifications about these kinds of object; repeat the parameter for several (default: all)"`
	Cursor      string   `query:"cursor" doc:"Opaque cursor from a previous response's next_cursor"`
	Limit       int32    `query:"limit" minimum:"1" maximum:"50" doc:"Page size (default 20, max 50)"`
}

type Response struct {
	Body schema.List
}

func RegisterEndpoint(api huma.API, app Lister) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "listNotifications",
		Method:      http.MethodGet,
		Path:        "/v1/notifications",
		Summary:     "List the caller's notifications",
		Description: "Returns the signed-in user's notification feed, newest first, with the unread count. " +
			"Notifications are a view over this organization's audit trail, narrowed to the events the user " +
			"subscribes to; the id of a notification is the id of the audit trail entry it reports.",
		Tags:   []string{"notifications"},
		Errors: []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		limit := request.Limit
		if limit == 0 {
			limit = feed.DefaultLimit
		}

		objects := make([]catalogue.Object, 0, len(request.ObjectTypes))
		for _, objectType := range request.ObjectTypes {
			objects = append(objects, catalogue.Object(objectType))
		}

		list, err := app.ListNotifications(ctx, cl, Query{
			UnreadOnly: request.Status == "unread",
			Objects:    objects,
			Limit:      limit,
			Cursor:     request.Cursor,
		})
		if err != nil {
			return nil, err
		}

		return &Response{Body: list}, nil
	})
}
