package getaiusagecapabilities

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

type (
	Facade interface {
		Capabilities(context.Context, caller.OrganizationCaller) (Capabilities, error)
	}
	Request  struct{}
	Response struct {
		CacheControl string `header:"Cache-Control"`
		Body         Capabilities
	}
)

func RegisterEndpoint(api huma.API, app Facade) {
	kaitenhuma.RegisterAIUsageCapabilities(api, huma.Operation{
		OperationID: "getAiUsageCapabilities", Method: http.MethodGet, Path: "/ai/capabilities",
		Summary: "Read AI platform rollout availability", Description: "Current organization-scoped platform flag only, not authorization to consume AI credits. Available while AI is disabled. Responses must not be cached.",
		Tags: []string{"ai"}, Errors: []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusInternalServerError},
	}, func(ctx context.Context, _ *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		body, err := app.Capabilities(ctx, cl)
		if err != nil {
			return nil, err
		}
		return &Response{CacheControl: "no-store", Body: body}, nil
	})
}
