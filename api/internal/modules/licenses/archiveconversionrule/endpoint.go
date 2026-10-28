package archiveconversionrule

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

type Archiver interface {
	ArchiveConversionRule(ctx context.Context, cl caller.OrganizationCaller, licenseSlug string, ruleID uuid.UUID) error
}
type Request struct {
	LicenseSlug string    `path:"licenseSlug"`
	RuleID      uuid.UUID `path:"ruleId"`
}

func RegisterEndpoint(api huma.API, app Archiver) {
	kaitenhuma.RegisterScoped(api, huma.Operation{OperationID: "archiveConversionRule", Method: http.MethodDelete, Path: "/licenses/{licenseSlug}/conversion-rules/{ruleId}", Summary: "Archive a conversion rule", Tags: []string{"licenses"}, Errors: []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError}}, RequiredScope, func(ctx context.Context, r *Request) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		if err := app.ArchiveConversionRule(ctx, cl, r.LicenseSlug, r.RuleID); err != nil {
			return nil, err
		}
		return nil, nil
	})
}

func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{Event: events.LicenseConversionRuleArchived, Data: (*schema.ConversionRule)(nil), OperationID: "onArchiveConversionRule", Summary: "Archive a conversion rule webhook", Description: "Conversion rule change.", Tags: []string{"webhooks", "licenses"}})
}
