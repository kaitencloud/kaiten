package updatelicensefamily

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Updater is the one facade method this operation calls.
type Updater interface {
	UpdateFamily(ctx context.Context, cl caller.OrganizationCaller, familySlug string, cmd Command) (*schema.LicenseFamilyView, error)
}

// LicenseFamilyUpdate is the family's settings to change; an absent member
// keeps the stored value.
type LicenseFamilyUpdate struct {
	IsPublic                     *bool   `json:"isPublic,omitempty" doc:"List the family's default PUBLISHED version, with its ACTIVE prices, in the public catalogue"`
	FallbackLicenseFamilySlug    *string `json:"fallbackLicenseFamilySlug,omitempty" maxLength:"255" doc:"Another FREE family of the organization (every version of it priced FREE), whose default PUBLISHED version an instance moves to when its subscription ends. \"\" removes the fallback. Anything else answers 422 .InvalidFallback, an unknown family included."`
	TrialEndWithoutPaymentMethod *string `json:"trialEndWithoutPaymentMethod,omitempty" doc:"CANCEL or CONVERT: what a trial charged automatically with a total above 0 becomes at its end when the customer has no ACTIVE payment method. CANCEL cancels it; CONVERT makes it ACTIVE, whose first charge then fails. Any other value answers 422 .InvalidTrialEndBehavior."`
	TrialReminderDays            *int32  `json:"trialReminderDays,omitempty" doc:"How many days before a trial's end trial_will_end fires, from 1 to 30, for the trials started after the change"`
}

type Request struct {
	FamilySlug string `path:"familySlug" doc:"License family slug" example:"pro"`
	Body       LicenseFamilyUpdate
}

type Response struct {
	Body *schema.LicenseFamilyView
}

func RegisterEndpoint(api huma.API, app Updater) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "updateLicenseFamily",
		Method:      http.MethodPatch,
		Path:        "/license-families/{familySlug}",
		Summary:     "Update a license family",
		Description: "Changes a family's own settings: whether the public catalogue lists it (families are private until made public), its fallback family, what a trial without a payment method becomes at its end, and the trial reminder's lead. An absent member keeps the stored value. " +
			"404 .NotFound; 422 .InvalidFallback, .InvalidTrialEndBehavior, .InvalidTrialReminderDays.",
		Tags:   []string{"licenses"},
		Errors: []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		body := request.Body
		view, err := app.UpdateFamily(ctx, cl, request.FamilySlug, Command{
			IsPublic: body.IsPublic, FallbackLicenseFamilySlug: body.FallbackLicenseFamilySlug,
			TrialEndWithoutPaymentMethod: body.TrialEndWithoutPaymentMethod, TrialReminderDays: body.TrialReminderDays,
		})
		if err != nil {
			return nil, err
		}
		return &Response{Body: view}, nil
	})
}
