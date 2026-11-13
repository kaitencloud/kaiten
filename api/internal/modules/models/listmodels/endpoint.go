package listmodels

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

type Listr interface {
	List(ctx context.Context, cl caller.OrganizationCaller, filter Filter, limit int32, cursor *string) (pagination.Page[*schema.Model], error)
}

type Request struct {
	Cursor   string          `query:"cursor"`
	Limit    int32           `query:"limit" minimum:"1" maximum:"200" doc:"Page size (default 50, max 200)"`
	Status   schema.Status   `query:"status" enum:"ACTIVE,DEPRECATED,ARCHIVED"`
	Vendor   string          `query:"vendor"`
	Modality schema.Modality `query:"modality" enum:"TEXT,IMAGE,AUDIO,VIDEO,EMBEDDING,MULTIMODAL"`
}

type Response struct {
	Body pagination.Page[*schema.Model]
}

func RegisterEndpoint(api huma.API, app Listr) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "listModels", Method: http.MethodGet, Path: "/models",
		Summary: "List models", Tags: []string{"models"},
		Errors: []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		var cursor *string
		if request.Cursor != "" {
			cursor = &request.Cursor
		}
		filter := Filter{}
		if request.Status != "" {
			filter.Status = &request.Status
		}
		if request.Vendor != "" {
			filter.Vendor = &request.Vendor
		}
		if request.Modality != "" {
			filter.Modality = &request.Modality
		}
		model, err := app.List(ctx, cl, filter, request.Limit, cursor)
		if err != nil {
			return nil, err
		}
		return &Response{Body: model}, nil
	})
}
