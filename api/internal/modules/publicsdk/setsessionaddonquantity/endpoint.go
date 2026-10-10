package setsessionaddonquantity

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/sessions"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// FacadeSetter is the one facade method this operation calls.
type FacadeSetter interface {
	SetSessionAddonQuantity(ctx context.Context, cl caller.CustomerSessionCaller, addonSlug string, request SessionAddonQuantity) (*sessions.SessionAddon, error)
}

type Request struct {
	AddonSlug string `path:"addonSlug" doc:"An add-on version: the public one, or the one the instance holds" example:"extra-seats-v1"`
	Body      SessionAddonQuantity
}

type Response struct {
	Body *sessions.SessionAddon
}

func RegisterEndpoint(api huma.API, app FacadeSetter) {
	kaitenhuma.RegisterSession(api, huma.Operation{
		OperationID: "setSessionAddonQuantity",
		Method:      http.MethodPut,
		Path:        "/public/session/addons/{addonSlug}",
		Summary:     "Set how many of an add-on the instance holds",
		Description: "Attaches the add-on to the session's instance, changes its quantity, or removes it with 0. Entitlements change at once; the subscription bills the quantity held at each renewal, with no proration. " +
			"Setting the quantity held changes nothing. 409 .OtherVersionAttached when another version of the same add-on is held, .BoundaryPending while the period that ended is being closed (Retry-After); " +
			"422 .AddonNotPublic, .Incompatible, .QuantityExceedsMax, .CurrencyMismatch, .InstanceRequired.",
		Tags:     []string{"public"},
		Metadata: kaitenhuma.BoundaryPending(),
		Errors: []int{
			http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusConflict,
			http.StatusUnprocessableEntity, http.StatusTooManyRequests, http.StatusInternalServerError, http.StatusServiceUnavailable,
		},
	}, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.CustomerSession(ctx)
		if err != nil {
			return nil, err
		}
		addon, err := app.SetSessionAddonQuantity(ctx, cl, request.AddonSlug, request.Body)
		if err != nil {
			return nil, err
		}
		return &Response{Body: addon}, nil
	})
}
