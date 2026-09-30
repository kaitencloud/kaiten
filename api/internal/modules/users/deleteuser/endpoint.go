package deleteuser

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Deleter is the one facade method this operation calls, declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Deleter interface {
	DeleteUser(ctx context.Context, cl caller.PlatformCaller, userID uuid.UUID) error
}

type Request struct {
	ID uuid.UUID `path:"id" format:"uuid" doc:"User ID"`
}

// RegisterEndpoint publishes this operation on the Platform API only.
//
// It sits outside the /platform/organizations/{orgId} namespace deliberately:
// deleting a user is global, and a credential with no organization execution
// context is exactly the right thing to authorize it. On the Core API it let any
// organization credential holding delete:users soft-delete any user by UUID,
// including -- until the protect trigger -- system:kaiten itself.
func RegisterEndpoint(api huma.API, app Deleter) {
	kaitenhuma.RegisterPlatform(api, huma.Operation{
		OperationID:   "delete-user",
		Method:        http.MethodDelete,
		Path:          "/platform/users/{id}",
		Summary:       "Delete a user",
		Description:   "Soft-deletes a user by ID. Platform API: requires a Kaiten platform token (`ksm_...`) with delete:users. The system:kaiten platform identity cannot be deleted — the database refuses it, and this answers 403.",
		Tags:          []string{"users"},
		DefaultStatus: http.StatusNoContent,
		Errors:        []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*struct{}, error) {
		cl, err := caller.Platform(ctx)
		if err != nil {
			return nil, err
		}

		if err := app.DeleteUser(ctx, cl, request.ID); err != nil {
			return nil, err
		}
		return nil, nil
	})
}
