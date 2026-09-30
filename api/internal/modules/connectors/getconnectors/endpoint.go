package getconnectors

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Lister is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Lister interface {
	List(ctx context.Context, cl caller.OrganizationCaller) ([]schema.Connector, error)
}

type Request struct{}

type Response struct {
	Body []schema.Connector
}

func RegisterEndpoint(api huma.API, app Lister) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "list-connectors",
		Method:      http.MethodGet,
		Path:        "/connectors",
		Summary:     "List registered connectors",
		Description: "Returns every registered connector with its version and settings schema, ordered by name. The registry is platform-wide rather than per-organization and holds one row per connector, so the response is not paginated.",
		Tags:        []string{"connectors"},
		Errors:      []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, _ *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		connectors, err := app.List(ctx, cl)
		if err != nil {
			return nil, err
		}

		return &Response{Body: connectors}, nil
	})
}
