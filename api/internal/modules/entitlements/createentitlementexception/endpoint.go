package createentitlementexception

import (
	"context"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/exceptions"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Creator is the one facade method this operation calls.
type Creator interface {
	CreateException(ctx context.Context, cl caller.OrganizationCaller, instanceSlug string, cmd Command) (*exceptions.EntitlementException, error)
}

// NewEntitlementException is the body of the create route.
type NewEntitlementException struct {
	EntitlementSlug string           `json:"entitlementSlug" doc:"The entitlement it overrides; the instance's licence and add-ons need not grant it" example:"sso"`
	Kind            string           `json:"kind" enum:"SET,ADD,UNLIMITED" doc:"SET works on every type; ADD and UNLIMITED on NUMBER and NUMBER_AI_CREDIT only"`
	Value           exceptions.Value `json:"value,omitempty" doc:"For SET, a number of 0 or more on the NUMBER types, a boolean on BOOLEAN, an object on CONFIG; for ADD, a number above 0; for UNLIMITED, absent or null"`
	StartsAt        *time.Time       `json:"startsAt,omitempty" doc:"Now when absent; a past instant is taken as given, a future one schedules the exception"`
	EndsAt          *time.Time       `json:"endsAt,omitempty" nullable:"true" doc:"After startsAt and after now; absent or null: no end"`
	Reason          string           `json:"reason" doc:"Why, 1 to 500 characters, not blank; shown to the vendor only"`
}

type Request struct {
	InstanceSlug string `path:"instanceSlug" doc:"Instance slug" example:"acme-prod"`
	Body         NewEntitlementException
}

type Response struct {
	Body *exceptions.EntitlementException
}

func RegisterEndpoint(api huma.API, app Creator) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "createEntitlementException",
		Method:        http.MethodPost,
		Path:          "/instances/{instanceSlug}/entitlement-exceptions",
		Summary:       "Set an exception on an instance's entitlement",
		Description:   "The vendor's explicit, dated decision on one entitlement of one instance, without a code: the last layer of the effective entitlements, after the licence, the add-ons and the boosts. It wins over them and may lower the value. One unrevoked exception per instance and entitlement at any instant. Emits INSTANCE_ENTITLEMENT_EXCEPTION_CREATED. Works whether or not billing is enabled.",
		Tags:          []string{"instances"},
		DefaultStatus: http.StatusCreated,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		result, err := app.CreateException(ctx, cl, request.InstanceSlug, Command(request.Body))
		if err != nil {
			return nil, err
		}
		return &Response{Body: result}, nil
	})
}
