package updateserviceaccount

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Updater is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Updater interface {
	Update(ctx context.Context, cl caller.OrganizationCaller, slug, name string) error
}

// Request's Body is schema.ServiceAccount, the same type create-service-
// account and get-service-account use. Slug is structurally writable too,
// but this endpoint has never supported renaming an account -- rejected
// below if it differs from the path's.
type Request struct {
	ServiceAccountSlug string                `path:"serviceAccountSlug" doc:"Service account slug" example:"service-account-slug"`
	Body               schema.ServiceAccount `doc:"Service account update details"`
}

func RegisterEndpoint(api huma.API, app Updater) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "update-service-account",
		Method:        http.MethodPut,
		Path:          "/service-accounts/{serviceAccountSlug}",
		Summary:       "Update a service account",
		Description:   "Update the name of a service account (machine user) by its slug.",
		Tags:          []string{"service-accounts"},
		DefaultStatus: http.StatusNoContent,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		if request.Body.Slug != "" && request.Body.Slug != request.ServiceAccountSlug {
			return nil, kaitenerrors.UnprocessableEntity(
				"UpdateServiceAccount.SlugNotRenameable",
				"slug cannot be changed through this endpoint; omit it or send the current slug",
			)
		}

		if err := app.Update(
			ctx, cl, request.ServiceAccountSlug, request.Body.Name); err != nil {
			return nil, err
		}

		return nil, nil
	})
}
