package createsessionportalsession

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/createportalsession"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// FacadeOpener is the one facade method this operation calls.
type FacadeOpener interface {
	CreateSessionPortalSession(ctx context.Context, cl caller.CustomerSessionCaller, request NewSessionPortalSession) (*createportalsession.PortalSession, error)
}

type Request struct {
	Body NewSessionPortalSession
}

type Response struct {
	Body *createportalsession.PortalSession
}

func RegisterEndpoint(api huma.API, app FacadeOpener) {
	kaitenhuma.RegisterSession(api, huma.Operation{
		OperationID: "createSessionPortalSession",
		Method:      http.MethodPost,
		Path:        "/public/session/billing/portal-session",
		Summary:     "Open the payment provider's customer portal",
		Description: "Opens the payment provider's hosted portal, where the session's customer manages its payment methods and billing details. " +
			"What it changes there reaches Kaiten through the provider sync.",
		Tags: []string{"public"},
		Errors: []int{
			http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict,
			http.StatusUnprocessableEntity, http.StatusTooManyRequests, http.StatusInternalServerError, http.StatusServiceUnavailable,
		},
	}, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.CustomerSession(ctx)
		if err != nil {
			return nil, err
		}
		opened, err := app.CreateSessionPortalSession(ctx, cl, request.Body)
		if err != nil {
			return nil, err
		}
		return &Response{Body: opened}, nil
	})
}
