package listorganizationaiinferences

import (
	"context"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/aihistory"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Port is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Port interface {
	ListOrganizationAIInferences(ctx context.Context, cl caller.OrganizationCaller, filter aihistory.OrganizationFilter) (schema.OrganizationAiInferencePage, error)
}

type Request struct {
	From            time.Time `query:"from" doc:"Start of the range, inclusive (RFC 3339). Defaults to 30 days before to."`
	To              time.Time `query:"to" doc:"End of the range, exclusive (RFC 3339). Defaults to now."`
	InstanceSlug    string    `query:"instanceSlug" maxLength:"255" doc:"Only this instance's operations. A slug the organization does not have matches nothing."`
	EntitlementSlug string    `query:"entitlementSlug" maxLength:"255" doc:"Only this credit pool's operations. A slug the organization does not have matches nothing."`
	Status          string    `query:"status" enum:"RESERVED,COMMITTED,RELEASED,EXPIRED" doc:"Only the operations in this status. A release that closed no reservation (RELEASED with the NO_RESERVATION warning) is listed only when status is RELEASED or transactionId is given."`
	TransactionID   string    `query:"transactionId" maxLength:"128" doc:"Only the operation reported under this identifier, a release that closed no reservation included."`
	Authorized      string    `query:"authorized" enum:"true,false" doc:"Only the operations the commit authorized (true) or refused (false). An operation still RESERVED matches neither."`
	ModelSlug       string    `query:"modelSlug" maxLength:"255" doc:"Only the operations that resolved to this catalogue model."`
	Model           string    `query:"model" maxLength:"255" doc:"Only the operations whose model, as sent, is exactly this one. Finds models the catalogue does not know."`
	RequestType     string    `query:"requestType" enum:"COMPLETION,EMBEDDING,IMAGE_GENERATION,AUDIO,VIDEO"`
	Cursor          string    `query:"cursor" doc:"The nextCursor of the previous page."`
	Limit           int32     `query:"limit" minimum:"1" maximum:"500" doc:"Maximum number of operations to return (default 50, max 500)."`
}

type Response struct {
	Body schema.OrganizationAiInferencePage
}

func RegisterEndpoint(api huma.API, app Port) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "listOrganizationAiInferences",
		Method:      http.MethodGet,
		Path:        "/usage/inferences",
		Summary:     "List the organization's AI inferences",
		Description: "Every AI operation of the organization across instances and credit pools, newest first by report time, paged with cursor. Each carries the instance and the pool it belongs to, the rule snapshot that priced it, the licence whose rules were considered, its warnings and its vendor cost. Decimals are strings.",
		Tags:        []string{"instances"},
		Errors: []int{
			http.StatusBadRequest,
			http.StatusUnauthorized,
			http.StatusForbidden,
			http.StatusUnprocessableEntity,
			http.StatusInternalServerError,
		},
	}, RequiredScope, func(ctx context.Context, req *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		filter := aihistory.OrganizationFilter{Filter: aihistory.FilterOf(aihistory.FilterQuery{From: req.From, To: req.To, Status: req.Status, TransactionID: req.TransactionID, Authorized: req.Authorized, ModelSlug: req.ModelSlug, Model: req.Model, RequestType: req.RequestType, Cursor: req.Cursor, Limit: req.Limit})}
		if req.InstanceSlug != "" {
			filter.InstanceSlug = &req.InstanceSlug
		}
		if req.EntitlementSlug != "" {
			filter.EntitlementSlug = &req.EntitlementSlug
		}
		page, err := app.ListOrganizationAIInferences(ctx, cl, filter)
		if err != nil {
			return nil, err
		}
		return &Response{Body: page}, nil
	})
}
