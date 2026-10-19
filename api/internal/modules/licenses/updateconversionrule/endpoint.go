package updateconversionrule

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

type Updater interface {
	UpdateConversionRule(ctx context.Context, cl caller.OrganizationCaller, licenseSlug string, ruleID uuid.UUID, cmd *Command) (*schema.ConversionRule, error)
}
type Request struct {
	LicenseSlug string    `path:"licenseSlug"`
	RuleID      uuid.UUID `path:"ruleId"`
	Body        Command
}
type Response struct{ Body *schema.ConversionRule }

func RegisterEndpoint(api huma.API, app Updater) {
	kaitenhuma.RegisterScoped(api, huma.Operation{OperationID: "updateConversionRule", Method: http.MethodPut, Path: "/licenses/{licenseSlug}/conversion-rules/{ruleId}", Summary: "Update a conversion rule", Tags: []string{"licenses"}, Errors: []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError}}, RequiredScope, func(ctx context.Context, r *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		value, err := app.UpdateConversionRule(ctx, cl, r.LicenseSlug, r.RuleID, &r.Body)
		if err != nil {
			return nil, err
		}
		return &Response{Body: value}, nil
	})
}

func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{Event: events.LicenseConversionRuleUpdated, Data: (*schema.ConversionRuleUpdated)(nil), OperationID: "onUpdateConversionRule", Summary: "Update a conversion rule webhook", Description: "Conversion rule change.", Tags: []string{"webhooks", "licenses"}})
}
