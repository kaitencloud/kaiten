package claimhandoff

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Claimer is the one facade method this operation calls.
type Claimer interface {
	ClaimHandoff(ctx context.Context, cl caller.OrganizationCaller, limit, leaseSeconds int32) (*HandoffClaim, error)
}

// HandoffClaimSize is how many invoices to lease, and for how long.
type HandoffClaimSize struct {
	Limit        int32 `json:"limit,omitempty" doc:"Invoices to lease, 1 to 100; 25 when omitted"`
	LeaseSeconds int32 `json:"leaseSeconds,omitempty" doc:"Lease length, 60 to 3600 seconds; 900 when omitted"`
}

type Request struct {
	Body HandoffClaimSize
}

type Response struct {
	Body *HandoffClaim
}

func RegisterEndpoint(api huma.API, app Claimer) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "claimHandoff",
		Method:      http.MethodPost,
		Path:        "/billing/handoff/claim",
		Summary:     "Claim invoices from the handoff queue",
		Description: "Leases the oldest invoices waiting for the organization's accounting system, under one lease. Two consumers claiming at once get different invoices. An invoice not acknowledged before its lease expires is claimed again: the queue delivers at least once, so a consumer deduplicates on the invoice id. A claim is not idempotent: a lost response leaves its invoices leased until leasedUntil. Requires billing to be enabled for the organization.",
		Tags:        []string{"billing"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		claim, err := app.ClaimHandoff(ctx, cl, request.Body.Limit, request.Body.LeaseSeconds)
		if err != nil {
			return nil, err
		}
		return &Response{Body: claim}, nil
	})
}
