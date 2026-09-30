package patchinstance

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Patcher is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Patcher interface {
	Patch(
		ctx context.Context, cl caller.OrganizationCaller, slug string, cmd *Command,
	) error
}

type Request struct {
	InstanceSlug string `path:"instanceSlug" doc:"Instance slug" example:"instance-slug"`
	Body         PatchInstanceBody
}

// PatchInstanceBody is a partial update: every field is optional. Only the
// fields present in the request are applied; each applied change emits its
// own domain event.
//
// Absence is the only "leave alone" signal either field has, so neither can
// be sent back to its unset state through this endpoint: an omitted
// lifecycleStage keeps the current one, and an explicit null fails
// validation rather than clearing it. The doc says so instead of
// inventing a sentinel value the field would then have to exclude.
type PatchInstanceBody struct {
	Status         *schema.InstanceStatus `json:"status,omitempty" doc:"Operational status of the instance" enum:"HEALTHY,DEGRADED,INCIDENT,MAINTENANCE" example:"INCIDENT"`
	LifecycleStage *string                `json:"lifecycleStage,omitempty" doc:"Commercial lifecycle stage (free-form; suggested: TRIAL, ACTIVE, AT_RISK, CHURNED). When omitted, the current stage is preserved; clearing it back to unset is not supported." minLength:"1" example:"AT_RISK"`
}

func RegisterEndpoint(api huma.API, app Patcher) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "patchInstance",
		Method:        http.MethodPatch,
		Path:          "/instances/{instanceSlug}",
		Summary:       "Patch an instance",
		Description:   "Partially update an instance. Currently supports the operational status and the commercial lifecycle stage.",
		Tags:          []string{"instances"},
		DefaultStatus: http.StatusNoContent,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, input *Request) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		command := &Command{
			Status:         input.Body.Status,
			LifecycleStage: input.Body.LifecycleStage,
		}
		if err := app.Patch(ctx, cl, input.InstanceSlug, command); err != nil {
			return nil, err
		}

		return nil, nil
	})
}

// RegisterWebhook declares the InstanceStatusChanged and
// InstanceLifecycleStageChanged webhook contracts in the OpenAPI document.
func RegisterWebhook(api huma.API) {
	webhook.Declare(
		api,
		webhook.Declaration{
			Event:       events.InstanceStatusChanged,
			Data:        (*InstanceStatusChanged)(nil),
			OperationID: "onInstanceStatusChanged",
			Summary:     "Instance Status Changed Webhook",
			Description: "Triggered when an instance operational status changes.",
			Tags:        []string{"webhooks", "instances"},
		},
		webhook.Declaration{
			Event:       events.InstanceLifecycleStageChanged,
			Data:        (*InstanceLifecycleStageChanged)(nil),
			OperationID: "onInstanceLifecycleStageChanged",
			Summary:     "Instance Lifecycle Stage Changed Webhook",
			Description: "Triggered when an instance commercial lifecycle stage changes.",
			Tags:        []string{"webhooks", "instances"},
		},
	)
}
