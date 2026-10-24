package getcheckoutsession

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/checkout"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Reader is the one facade method this operation calls.
type Reader interface {
	GetCheckoutSession(ctx context.Context, cl caller.CheckoutSessionCaller) (*checkout.CheckoutSession, error)
}

type Request struct {
	SessionID uuid.UUID `path:"sessionId" doc:"The session the ksc_ was minted for; another one answers 401"`
}

type Response struct {
	CacheControl string `header:"Cache-Control"`
	Vary         string `header:"Vary"`
	Body         *checkout.CheckoutSession
}

func RegisterEndpoint(api huma.API, app Reader) {
	kaitenhuma.RegisterCheckoutSession(api, huma.Operation{
		OperationID: "getCheckoutSession",
		Method:      http.MethodGet,
		Path:        kaitenhuma.CheckoutSessionsPath + "/{sessionId}",
		Summary:     "Read an anonymous checkout session",
		Description: "The session its ksc_ was minted for: its status, what it bought and what is due, and, once completed, the customer and instance created. " +
			"A session still OPEN after expiresAt reads ABANDONED. The token keeps reading it for 24 h after it closed, then answers 401 PublicAuth.InvalidCredential.",
		Tags:   []string{"public"},
		Errors: []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusTooManyRequests, http.StatusInternalServerError},
	}, func(ctx context.Context, _ *Request) (*Response, error) {
		cl, err := caller.CheckoutSession(ctx)
		if err != nil {
			return nil, err
		}
		session, err := app.GetCheckoutSession(ctx, cl)
		if err != nil {
			return nil, err
		}
		return &Response{CacheControl: "no-store", Vary: "Origin, Authorization", Body: session}, nil
	})
}
