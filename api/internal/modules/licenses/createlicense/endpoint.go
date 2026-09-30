package createlicense

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
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Creator is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Creator interface {
	Create(
		ctx context.Context, cl caller.OrganizationCaller, cmd *Command,
	) (*schema.License, error)
}

type Request struct {
	Body schema.License
}

type Response struct {
	Body *schema.License
}

func RegisterEndpoint(api huma.API, app Creator) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "create-license",
		Method:        http.MethodPost,
		Path:          "/licenses",
		Summary:       "Create a new license",
		Description:   "Create a new license with the provided details. Without familySlug or familyId this creates a new license family and the license becomes its version 1. With one of them it adds the next version to that family (familySlug names it by slug, familyId by identifier; sent together they must agree), and the version number is assigned by the server as the next one in the family's sequence. The version starts PUBLISHED, or DRAFT when lifecycleState says so; ARCHIVED is refused (422 CreateLicense.LifecycleStateNotSettable), because a version is archived with archive-license once it has been on sale.\n\nWhere the deployment limits how many licenses an organization may have, only a new family counts against that limit (409 CreateLicense.EntitlementLimitReached once it is reached): a new version of an existing family never does.",
		Tags:          []string{"licenses"},
		DefaultStatus: http.StatusCreated,
		// 404 is reachable since the license-family split: familySlug names a family that has to
		// already exist, so a create can now fail on a resource lookup the way
		// a read does (CreateLicense.FamilyNotFound).
		Errors: []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, input *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		// version is server-assigned: a BEFORE INSERT trigger overwrites it
		// with MAX(version)+1 for the family regardless of what is sent.
		// It is rejected outright rather than silently discarded. The field is
		// readOnly on the shared schema, and huma
		// skips readOnly fields on write instead of rejecting them, so the
		// refusal has to be explicit.
		if input.Body.Version != "" {
			return nil, kaitenerrors.UnprocessableEntity(
				"CreateLicense.VersionNotSettable",
				"version is assigned by the server on creation and cannot be set",
			)
		}

		var slug *string
		if input.Body.Slug != "" {
			slug = &input.Body.Slug
		}
		var familySlug *string
		if input.Body.FamilySlug != "" {
			familySlug = &input.Body.FamilySlug
		}
		// The identifier form of familySlug: the console holds a license's
		// familyId and nothing else, so it names the family the way an instance
		// names its license. A zero UUID is "not sent" -- the field is optional
		// on the shared schema because responses always carry it.
		var familyID *uuid.UUID
		if input.Body.FamilyID != uuid.Nil {
			id := input.Body.FamilyID
			familyID = &id
		}
		command := &Command{
			Name:           input.Body.Name,
			Description:    input.Body.Description,
			Type:           input.Body.Type,
			VersionName:    input.Body.VersionName,
			Slug:           slug,
			FamilySlug:     familySlug,
			FamilyID:       familyID,
			IsDefault:      input.Body.IsDefault,
			LifecycleState: input.Body.LifecycleState,
		}

		license, err := app.Create(ctx, cl, command)
		if err != nil {
			return nil, err
		}

		return &Response{
			Body: license,
		}, nil
	})
}

// RegisterWebhook declares the LicenseCreated webhook contract in the
// OpenAPI document.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       events.LicenseCreated,
		Data:        (*schema.License)(nil),
		OperationID: "onLicenseCreated",
		Summary:     "License Created Webhook",
		Description: "Triggered when a new license is created.",
		Tags:        []string{"webhooks", "licenses"},
	})
}
