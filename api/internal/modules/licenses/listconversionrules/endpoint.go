package listconversionrules

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

type Lister interface {
	ListConversionRules(ctx context.Context, cl caller.OrganizationCaller, licenseSlug string, filter Filter) ([]*schema.ConversionRule, error)
}
type Request struct {
	LicenseSlug     string                      `path:"licenseSlug"`
	Status          schema.ConversionRuleStatus `query:"status" enum:"ACTIVE,ARCHIVED" default:"ACTIVE"`
	EntitlementSlug string                      `query:"entitlementSlug"`
	ModelSlug       string                      `query:"modelSlug"`
}
type Response struct{ Body []*schema.ConversionRule }

func RegisterEndpoint(api huma.API, app Lister) {
	kaitenhuma.RegisterScoped(api, huma.Operation{OperationID: "listConversionRules", Method: http.MethodGet, Path: "/licenses/{licenseSlug}/conversion-rules", Summary: "List conversion rules", Tags: []string{"licenses"}, Errors: []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError}}, RequiredScope, func(ctx context.Context, r *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		filter := Filter{}
		if r.Status != "" {
			filter.Status = &r.Status
		}
		if r.EntitlementSlug != "" {
			filter.EntitlementSlug = &r.EntitlementSlug
		}
		if r.ModelSlug != "" {
			filter.ModelSlug = &r.ModelSlug
		}
		value, err := app.ListConversionRules(ctx, cl, r.LicenseSlug, filter)
		if err != nil {
			return nil, err
		}
		return &Response{Body: value}, nil
	})
}
