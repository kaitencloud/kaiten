package createconversionrule

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

type Creator interface {
	CreateConversionRule(ctx context.Context, cl caller.OrganizationCaller, licenseSlug string, cmd *Command) (*schema.ConversionRule, error)
}
type Request struct {
	LicenseSlug string `path:"licenseSlug"`
	Body        Command
}
type Response struct{ Body *schema.ConversionRule }

func RegisterEndpoint(api huma.API, app Creator) {
	kaitenhuma.RegisterScoped(api, huma.Operation{OperationID: "createConversionRule", Method: http.MethodPost, Path: "/licenses/{licenseSlug}/conversion-rules", Summary: "Create a conversion rule", Tags: []string{"licenses"}, DefaultStatus: http.StatusCreated, Errors: []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError}}, RequiredScope, func(ctx context.Context, r *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		value, err := app.CreateConversionRule(ctx, cl, r.LicenseSlug, &r.Body)
		if err != nil {
			return nil, err
		}
		return &Response{Body: value}, nil
	})
}

func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{Event: events.LicenseConversionRuleCreated, Data: (*schema.ConversionRule)(nil), OperationID: "onCreateConversionRule", Summary: "Create a conversion rule webhook", Description: "Conversion rule change.", Tags: []string{"webhooks", "licenses"}})
}
