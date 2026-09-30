package updatelicense

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

// Updater is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Updater interface {
	Update(
		ctx context.Context, cl caller.OrganizationCaller, slug string, cmd *Command,
	) error
}

// Request's Body is schema.License, the same type create-license and
// get-license use, so it carries fields this endpoint never changes. Each is
// accepted as an echo of what the row already holds -- a client doing
// read-modify-write sends them back -- and refused otherwise rather than
// silently dropped:
//
//   - slug: this endpoint has never renamed a license (checked here, against
//     the path);
//   - version: server-assigned and readOnly since the license-family split, because a version's
//     slug is derived from its number (checked in the repository, against the
//     row);
//   - lifecycleState: moves through publish, archive and unarchive since
//     D2 (checked in the repository, against the row);
//   - familyId: a version never moves between families (checked in the
//     repository, against the row);
//   - familySlug: create-only and writeOnly, refused whatever its value.
type Request struct {
	LicenseSlug string `path:"licenseSlug" doc:"License slug" example:"license-slug"`
	Body        schema.License
}

func RegisterEndpoint(api huma.API, app Updater) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "update-license",
		Method:      http.MethodPut,
		Path:        "/licenses/{licenseSlug}",
		Summary:     "Update a license",
		Description: "Update a license with the provided details",
		Tags:        []string{"licenses"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		if request.Body.Slug != "" && request.Body.Slug != request.LicenseSlug {
			return nil, kaitenerrors.UnprocessableEntity(
				"UpdateLicense.SlugNotRenameable",
				"slug cannot be changed through this endpoint; omit it or send the current slug",
			)
		}

		// familySlug is write-only on create: it names the family a
		// new version joins, and a version never moves between families. It is
		// structurally present on the shared schema, so its presence here is
		// refused rather than silently dropped.
		if request.Body.FamilySlug != "" {
			return nil, kaitenerrors.UnprocessableEntity(
				"UpdateLicense.FamilyNotReassignable",
				"familySlug is only accepted on create; a version cannot move between families",
			)
		}

		// A client doing read-modify-write sends familyId back as it read it.
		// That is accepted, and the repository checks it is the row's own
		// family -- any other value is the same reassignment as above.
		var familyID *uuid.UUID
		if request.Body.FamilyID != uuid.Nil {
			id := request.Body.FamilyID
			familyID = &id
		}

		command := &Command{
			Name:           request.Body.Name,
			Description:    request.Body.Description,
			Type:           request.Body.Type,
			VersionName:    request.Body.VersionName,
			Version:        request.Body.Version,
			IsDefault:      request.Body.IsDefault,
			FamilyID:       familyID,
			LifecycleState: request.Body.LifecycleState,
		}

		if err := app.Update(ctx, cl, request.LicenseSlug, command); err != nil {
			return nil, err
		}

		return nil, nil
	})
}

// RegisterWebhook declares the LicenseUpdated webhook contract in the
// OpenAPI document.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       events.LicenseUpdated,
		Data:        (*schema.License)(nil),
		OperationID: "onLicenseUpdated",
		Summary:     "License Updated Webhook",
		Description: "Triggered when a license is updated.",
		Tags:        []string{"webhooks", "licenses"},
	})
}
