package getsummary

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Reader is the one facade method this operation calls.
type Reader interface {
	GetSummary(ctx context.Context, cl caller.OrganizationCaller, rng Range) (*DashboardSummary, error)
}

type Request struct {
	Range string `query:"range" enum:"7d,30d,90d" default:"30d" doc:"The period the rates and the lists cover"`
}

type Response struct {
	Body *DashboardSummary
}

func RegisterEndpoint(api huma.API, app Reader) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "getDashboardSummary",
		Method:      http.MethodGet,
		Path:        "/dashboard/summary",
		Summary:     "Get the dashboard summary",
		Description: "The console's home in one response, computed in the database over the whole organization: what needs attention (limits reached, refused reports, silent instances, Licenses ending, archived versions, expiring tokens, zones behind), the figures of the period, the meters closest to their limits, usage reports per day and per instance, evaluations per flag, who runs which License version, what runs where, and who talks to Kaiten. Blocks about a module the caller cannot read are absent; billing figures say nothing about whether billing is enabled, which GET /billing/capabilities does.",
		Tags:        []string{"dashboard"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, req *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		summary, err := app.GetSummary(ctx, cl, Range(req.Range))
		if err != nil {
			return nil, err
		}
		return &Response{Body: summary}, nil
	})
}
