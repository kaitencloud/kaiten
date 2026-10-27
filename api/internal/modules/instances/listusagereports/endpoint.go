package listusagereports

import (
	"context"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Lister is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Lister interface {
	ListUsageReports(
		ctx context.Context, cl caller.OrganizationCaller,
		instanceSlug, entitlementSlug string, q Query,
	) (*UsageReportPage, error)
}

type Request struct {
	InstanceSlug    string    `path:"instanceSlug" doc:"Instance slug" example:"instance-slug"`
	EntitlementSlug string    `path:"entitlementSlug" doc:"Entitlement slug" example:"entitlement-slug"`
	From            time.Time `query:"from" doc:"Start of the range, inclusive (RFC 3339). Defaults to 30 days before to, moved up to the start of the organization's usage history when that is later. An explicit from before it answers 422 ListUsageReports.OutsideRetention."`
	To              time.Time `query:"to" doc:"End of the range, exclusive (RFC 3339). Defaults to now."`
	AfterSeq        int64     `query:"afterSeq" doc:"Return the reports after this reportSeq: the nextAfterSeq of the previous page" minimum:"0"`
	Limit           int32     `query:"limit" doc:"Maximum number of reports to return (default 100, max 500)" minimum:"1" maximum:"500"`
	TransactionID   string    `query:"transactionId" doc:"Only the report sent with this idempotency key" maxLength:"128"`
}

type Response struct {
	Body *UsageReportPage
}

func RegisterEndpoint(api huma.API, app Lister) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "listUsageReports",
		Method:      http.MethodGet,
		Path:        "/instances/{instanceSlug}/entitlements/{entitlementSlug}/usage/reports",
		Summary:     "List an entitlement's usage reports for an instance",
		Description: "The usage history of one instance and entitlement: every accepted report in the range, with the counter before and after it and the limit in force, in reportSeq order, paged with afterSeq. Decimals are strings. Reports are kept for the organization's usage history retention.",
		Tags:        []string{"instances"},
		Errors: []int{
			http.StatusBadRequest,
			http.StatusUnauthorized,
			http.StatusForbidden,
			http.StatusNotFound,
			http.StatusUnprocessableEntity,
			http.StatusInternalServerError,
		},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		q := Query{AfterSeq: request.AfterSeq, Limit: request.Limit}
		if !request.From.IsZero() {
			q.From = &request.From
		}
		if !request.To.IsZero() {
			q.To = &request.To
		}
		if request.TransactionID != "" {
			q.TransactionID = &request.TransactionID
		}

		page, err := app.ListUsageReports(ctx, cl, request.InstanceSlug, request.EntitlementSlug, q)
		if err != nil {
			return nil, err
		}
		return &Response{Body: page}, nil
	})
}
