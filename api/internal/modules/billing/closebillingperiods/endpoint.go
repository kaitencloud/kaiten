package closebillingperiods

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/closing"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Closer is the one facade method the Core operation calls.
type Closer interface {
	CloseBillingPeriods(ctx context.Context, cl caller.OrganizationCaller, instanceSlug *string) (*closing.Report, error)
}

// PlatformCloser is the one facade method the Platform operation calls.
type PlatformCloser interface {
	CloseBillingPeriods(ctx context.Context, cl caller.PlatformCaller, target uuid.UUID, instanceSlug *string) (*closing.Report, error)
}

// ClosePeriodsScope narrows a close to one instance.
type ClosePeriodsScope struct {
	InstanceSlug *string `json:"instanceSlug,omitempty" doc:"Close only this instance's subscription"`
}

type Request struct {
	Body ClosePeriodsScope
}

type PlatformRequest struct {
	OrganizationID uuid.UUID `path:"orgId" format:"uuid" doc:"Organization ID"`
	Body           ClosePeriodsScope
}

type Response struct {
	Body *closing.Report
}

const description = "Closes the subscriptions whose period has ended now, rather than at the period-close job's next pass: each one's RENEWAL invoice is composed and issued (or held, when its usage journal fails a check) and its period advances. A subscription several periods behind closes one period at a time until it is current. Only what is due closes, at most the configured batch size per call."

func RegisterEndpoint(api huma.API, app Closer) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "closeBillingPeriods",
		Method:      http.MethodPost,
		Path:        "/billing/close-periods",
		Summary:     "Close due billing periods",
		Description: description + " Requires billing to be enabled for the organization.",
		Tags:        []string{"billing"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		report, err := app.CloseBillingPeriods(ctx, cl, request.Body.InstanceSlug)
		if err != nil {
			return nil, err
		}
		return &Response{Body: report}, nil
	})
}

func RegisterPlatformEndpoint(api huma.API, app PlatformCloser) {
	kaitenhuma.RegisterPlatformForOrganization(api, huma.Operation{
		OperationID: "platform-close-billing-periods",
		Method:      http.MethodPost,
		Path:        "/platform/organizations/{orgId}/billing/close-periods",
		Summary:     "Close an organization's due billing periods",
		Description: description + " Platform API: requires a Kaiten platform token (`ksm_...`) with write:billing; the closes are recorded under system:kaiten.",
		Tags:        []string{"billing"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *PlatformRequest) (*Response, error) {
		cl, err := caller.Platform(ctx)
		if err != nil {
			return nil, err
		}
		report, err := app.CloseBillingPeriods(ctx, cl, request.OrganizationID, request.Body.InstanceSlug)
		if err != nil {
			return nil, err
		}
		return &Response{Body: report}, nil
	})
}
