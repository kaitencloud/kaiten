package updateinstance

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Updater is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Updater interface {
	Update(
		ctx context.Context, cl caller.OrganizationCaller, slug string, cmd *Command,
	) (*schema.Instance, error)
}

// Request's Body is schema.Instance, the same type create-instance and
// get-instance use. It is a full replacement: the instance ends up with the
// values sent here. deploymentZoneId and slug are the two optional writable
// fields, and absence is the only "leave alone" signal either has -- an
// omitted deploymentZoneId keeps the current zone, an omitted slug keeps the
// current slug, and an explicit null fails validation rather than clearing
// either.
//
// Integrations is accepted on create but not settable here (it has its own
// dedicated endpoints); the handler below rejects it being present with a
// 422 rather than silently ignoring it.
type Request struct {
	InstanceSlug string `path:"instanceSlug" doc:"Instance slug" example:"instance-slug"`
	Body         schema.Instance
}

func RegisterEndpoint(api huma.API, app Updater) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "updateInstance",
		Method:      "PUT",
		Path:        "/instances/{instanceSlug}",
		Summary:     "Update an instance",
		Description: "Update an instance with the provided details",
		Tags:        []string{"instances"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, input *Request) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		if len(input.Body.Integrations) > 0 {
			return nil, kaitenerrors.UnprocessableEntity(
				"UpdateInstance.IntegrationsNotSettable",
				"integrations cannot be set through this endpoint; use the dedicated integration endpoints",
			)
		}

		// A slug the client did not send arrives here as the zero value, which
		// is the same thing as absent: the pattern and minLength on the field
		// reject an explicit empty string before this runs, so "" can only
		// mean the key was missing.
		var slug *string
		if input.Body.Slug != "" {
			slug = &input.Body.Slug
		}

		command := &Command{
			Name:             input.Body.Name,
			Description:      input.Body.Description,
			CustomerID:       input.Body.CustomerID,
			LicenseID:        input.Body.LicenseID,
			DeploymentZoneID: input.Body.DeploymentZoneID,
			Metadata:         input.Body.Metadata,
			StartLicenseDate: input.Body.StartLicenseDate,
			EndLicenseDate:   input.Body.EndLicenseDate,
			Slug:             slug,
		}

		if _, err := app.Update(ctx, cl, input.InstanceSlug, command); err != nil {
			return nil, err
		}

		return nil, nil
	})
}

// RegisterWebhook declares the InstanceUpdated and InstanceMigrated webhook
// contracts in the OpenAPI document.
func RegisterWebhook(api huma.API) {
	webhook.Declare(
		api,
		webhook.Declaration{
			Event:       events.InstanceUpdated,
			Data:        (*schema.Instance)(nil),
			OperationID: "onInstanceUpdated",
			Summary:     "Instance Updated Webhook",
			Description: "Triggered when an instance is updated.",
			Tags:        []string{"webhooks", "instances"},
		},
		webhook.Declaration{
			Event:       events.InstanceMigrated,
			Data:        (*schema.Instance)(nil),
			OperationID: "onInstanceMigrated",
			Summary:     "Instance Migrated Webhook",
			Description: "Triggered when an instance is migrated from one deployment zone to another.",
			Tags:        []string{"webhooks", "instances"},
		},
	)
}
