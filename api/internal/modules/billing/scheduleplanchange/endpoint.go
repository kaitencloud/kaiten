package scheduleplanchange

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Scheduler is the one facade method this operation calls.
type Scheduler interface {
	SchedulePlanChange(ctx context.Context, cl caller.OrganizationCaller, instanceSlug string, priceID uuid.UUID) (*subscriptions.InstanceBilling, error)
}

// PlanChangeTarget is the price a subscription moves to.
type PlanChangeTarget struct {
	LicensePriceID uuid.UUID `json:"licensePriceId" doc:"An ACTIVE FLAT_FEE price of a PUBLISHED licence version, in the subscription's currency"`
}

type Request struct {
	InstanceSlug string `path:"instanceSlug" doc:"Instance slug" example:"acme-prod"`
	Body         PlanChangeTarget
}

type Response struct {
	Body *subscriptions.InstanceBilling
}

func RegisterEndpoint(api huma.API, app Scheduler) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "schedulePlanChange",
		Method:      http.MethodPut,
		Path:        "/instances/{instanceSlug}/billing/scheduled-change",
		Summary:     "Schedule a plan change",
		Description: "Schedules a move to another FLAT_FEE price, of any PUBLISHED licence version in the subscription's currency, for the next boundary. That boundary's RENEWAL bills the old plan's arrears and the new plan's advance, and moves the instance to the new version; there is no proration. Scheduling another target replaces the change, the same one changes nothing. A scheduled target's price cannot be deprecated, nor its version archived. Requires billing to be enabled for the organization.",
		Tags:        []string{"billing"},
		Metadata:    kaitenhuma.BoundaryPending(),
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		billing, err := app.SchedulePlanChange(ctx, cl, request.InstanceSlug, request.Body.LicensePriceID)
		if err != nil {
			return nil, err
		}
		return &Response{Body: billing}, nil
	})
}
