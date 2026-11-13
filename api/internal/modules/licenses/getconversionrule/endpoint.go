package getconversionrule

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

type Getter interface {
	GetConversionRule(ctx context.Context, cl caller.OrganizationCaller, licenseSlug string, ruleID uuid.UUID) (*schema.ConversionRule, error)
}
type Request struct {
	LicenseSlug string    `path:"licenseSlug"`
	RuleID      uuid.UUID `path:"ruleId"`
}
type Response struct{ Body *schema.ConversionRule }

func RegisterEndpoint(api huma.API, app Getter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{OperationID: "getConversionRule", Method: http.MethodGet, Path: "/licenses/{licenseSlug}/conversion-rules/{ruleId}", Summary: "Get a conversion rule", Tags: []string{"licenses"}, Errors: []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError}}, RequiredScope, func(ctx context.Context, r *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		value, err := app.GetConversionRule(ctx, cl, r.LicenseSlug, r.RuleID)
		if err != nil {
			return nil, err
		}
		return &Response{Body: value}, nil
	})
}
