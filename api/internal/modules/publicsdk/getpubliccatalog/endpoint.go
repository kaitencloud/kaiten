package getpubliccatalog

import (
	"context"
	"net/http"
	"slices"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Reader is the one facade method this operation calls.
type Reader interface {
	GetPublicCatalog(ctx context.Context, cl caller.PublishableKeyCaller, query Query) (*PublicCatalog, error)
}

type Request struct {
	FamilySlug string   `query:"familySlug" doc:"Only this licence family" example:"pro"`
	Include    []string `query:"include" enum:"addons,none" doc:"addons (the default) lists the public add-ons too; none leaves them out"`
}

type Response struct {
	CacheControl string `header:"Cache-Control"`
	// Vary keeps a shared cache from answering one organization's key with
	// another's catalogue, or an origin the key refuses with a page it
	// allowed.
	Vary string `header:"Vary"`
	Body *PublicCatalog
}

func RegisterEndpoint(api huma.API, app Reader) {
	kaitenhuma.RegisterPublishable(api, huma.Operation{
		OperationID: "getPublicCatalog",
		Method:      http.MethodGet,
		Path:        "/public/catalog",
		Summary:     "Get the public catalogue",
		Description: "What a pricing page shows: for each licence family the organization made public, its default version " +
			"with its ACTIVE prices and user-facing entitlements, and the same for public add-on families. " +
			"Read with a publishable key (X-Kaiten-Publishable-Key); the organization is the key's. " +
			"Amounts are in minor units; never sum metered prices into a headline. Cacheable for 60 seconds.",
		Tags:   []string{"public"},
		Errors: []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusTooManyRequests, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.PublishableKey(ctx)
		if err != nil {
			return nil, err
		}
		query := Query{FamilySlug: nil, IncludeAddOns: !slices.Contains(request.Include, "none")}
		if request.FamilySlug != "" {
			query.FamilySlug = &request.FamilySlug
		}
		catalog, err := app.GetPublicCatalog(ctx, cl, query)
		if err != nil {
			return nil, err
		}
		return &Response{CacheControl: "public, max-age=60", Vary: "X-Kaiten-Publishable-Key, Origin", Body: catalog}, nil
	})
}
