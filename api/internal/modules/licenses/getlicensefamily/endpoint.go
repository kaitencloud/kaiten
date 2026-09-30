package getlicensefamily

import (
	"context"
	"net/http"
	"slices"

	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// FamilyGetter is the one facade method this operation calls. Declared here rather
// than imported: internal/kaiten holds this use case, so naming it would close a
// cycle.
type FamilyGetter interface {
	GetFamily(
		ctx context.Context, cl caller.OrganizationCaller, familySlug string, query *Query,
	) (*schema.LicenseFamilyView, error)
}

type Request struct {
	FamilySlug string   `path:"familySlug" doc:"License family slug" example:"enterprise-license"`
	Version    int32    `query:"version" doc:"Address this version number instead of resolving the current one. Explicit historical access: the version is returned in currentVersion whatever its lifecycle state, draft and archived included, and the resolution rule does not apply." minimum:"1"`
	Include    []string `query:"include" nullable:"false" doc:"Extra representations to add, comma-separated. Only 'versions' exists today: it adds every version of the family, oldest first, and makes a family with no PUBLISHED version readable instead of a 404. A list, so that another representation can be added later without changing the parameter's type." enum:"versions"`
}

type Response struct {
	Body *schema.LicenseFamilyView
}

func RegisterEndpoint(api huma.API, app FamilyGetter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "get-license-family",
		Method:      http.MethodGet,
		Path:        "/license-families/{familySlug}",
		Summary:     "Get a license family by slug",
		Description: "Resolves a license family to the version it currently serves, returned as currentVersion: the family's default version if it has one, otherwise its highest-numbered PUBLISHED version. This is the stable address for \"the current version of this product\", so a caller never has to name a version slug.\n\nA family with a default keeps serving it when a newer version is published -- the default is what the vendor puts forward, and superseding it is an explicit act (make another version the default, or unset it). A family without a default follows publication: the newest PUBLISHED version wins.\n\nReturns 404 GetLicenseFamily.NoPublishedVersion when the family exists but has no PUBLISHED version, since there is nothing to resolve to. Use ?include=versions to read such a family anyway: with the history requested, the family is returned with its versions and no currentVersion. Use ?version=N for explicit access to one version, including draft and archived ones.",
		Tags:        []string{"license-families"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		query := &Query{IncludeVersions: slices.Contains(request.Include, includeVersions)}
		if request.Version > 0 {
			query.Version = &request.Version
		}

		family, err := app.GetFamily(ctx, cl, request.FamilySlug, query)
		if err != nil {
			return nil, err
		}

		return &Response{
			Body: family,
		}, nil
	})
}

// RegisterWebhooks declares the three license family event contracts in the
// OpenAPI document. No operation writes a family directly -- its versions do,
// through create, update, delete and the lifecycle transitions -- but this is
// the family's resource, and all three carry the family's view as this
// endpoint serves it, without its history.
func RegisterWebhooks(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       events.LicenseFamilyCreated,
		Data:        (*schema.LicenseFamilyView)(nil),
		OperationID: "onLicenseFamilyCreated",
		Summary:     "License Family Created Webhook",
		Description: "Triggered when a license is created without naming a family: its version 1 opens a new family, which this event carries, with the version it serves -- none if that version is a draft. It is recorded in the same transaction as that version's LICENSE_CREATED.",
		Tags:        []string{"webhooks", "license-families"},
	})
	webhook.Declare(api, webhook.Declaration{
		Event:       events.LicenseFamilyUpdated,
		Data:        (*schema.LicenseFamilyView)(nil),
		OperationID: "onLicenseFamilyUpdated",
		Summary:     "License Family Updated Webhook",
		Description: "Triggered when a license family starts serving another version, or none: a newer version published, a version published, archived or unarchived, the family's default taken or given up, or the served version deleted. It carries the family with the version it serves now, and is recorded in the same transaction as the version event that caused the change. A change that leaves the served version where it was -- a draft added, a version renamed, a default restated -- triggers none.",
		Tags:        []string{"webhooks", "license-families"},
	})
	webhook.Declare(api, webhook.Declaration{
		Event:       events.LicenseFamilyDeleted,
		Data:        (*schema.LicenseFamilyView)(nil),
		OperationID: "onLicenseFamilyDeleted",
		Summary:     "License Family Deleted Webhook",
		Description: "Triggered when a license family's last version is deleted, which deletes the family and frees its slug. It carries the family as it stood before that version went, and is recorded in the same transaction as that version's LICENSE_DELETED.",
		Tags:        []string{"webhooks", "license-families"},
	})
}
