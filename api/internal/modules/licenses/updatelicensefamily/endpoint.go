package updatelicensefamily

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Updater is the one facade method this operation calls.
type Updater interface {
	UpdateFamily(ctx context.Context, cl caller.OrganizationCaller, familySlug string, isPublic bool) (*schema.LicenseFamilyView, error)
}

// LicenseFamilyVisibility is whether a family is listed publicly.
type LicenseFamilyVisibility struct {
	IsPublic bool `json:"isPublic" doc:"List the family's default PUBLISHED version, with its ACTIVE prices, in the public catalogue"`
}

type Request struct {
	FamilySlug string `path:"familySlug" doc:"License family slug" example:"pro"`
	Body       LicenseFamilyVisibility
}

type Response struct {
	Body *schema.LicenseFamilyView
}

func RegisterEndpoint(api huma.API, app Updater) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "updateLicenseFamily",
		Method:      http.MethodPatch,
		Path:        "/license-families/{familySlug}",
		Summary:     "Update a license family",
		Description: "Lists the family in the public catalogue, or takes it out. Families are private until made public.",
		Tags:        []string{"licenses"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		view, err := app.UpdateFamily(ctx, cl, request.FamilySlug, request.Body.IsPublic)
		if err != nil {
			return nil, err
		}
		return &Response{Body: view}, nil
	})
}
