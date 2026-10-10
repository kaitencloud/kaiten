package getsessionportal

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/shared/nullable"
)

// FacadeReader is the one facade method this operation calls.
type FacadeReader interface {
	GetSessionPortal(ctx context.Context, cl caller.CustomerSessionCaller) (*SessionPortal, error)
}

type Response struct {
	Body *SessionPortal
}

func RegisterEndpoint(api huma.API, app FacadeReader) {
	kaitenhuma.RegisterSession(api, huma.Operation{
		OperationID: "getSessionPortal",
		Method:      http.MethodGet,
		Path:        "/public/session/portal",
		Summary:     "Read the customer portal",
		Description: "Everything the customer's portal shows, in one read: the customer, and for a session bound to an instance its subscription, " +
			"effective quotas with where they come from, add-ons, vouchers and next invoice; the payment method; and what the portal may offer. " +
			"A session bound to the customer only gets the customer, its instances and the payment method.",
		Tags: []string{"public"},
		Errors: []int{
			http.StatusUnauthorized, http.StatusForbidden, http.StatusTooManyRequests, http.StatusInternalServerError, http.StatusServiceUnavailable,
		},
	}, func(ctx context.Context, _ *struct{}) (*Response, error) {
		cl, err := caller.CustomerSession(ctx)
		if err != nil {
			return nil, err
		}
		portal, err := app.GetSessionPortal(ctx, cl)
		if err != nil {
			return nil, err
		}
		return &Response{Body: portal}, nil
	})
}

// TransformSchema publishes SessionPortal's absent members as null (§13.15).
func (SessionPortal) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	return nullable.Pointers(s, SessionPortal{})
}

// TransformSchema publishes PortalCustomer's absent members as null (§13.15).
func (PortalCustomer) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	return nullable.Pointers(s, PortalCustomer{})
}

// TransformSchema publishes PortalInstanceSummary's absent members as null (§13.15).
func (PortalInstanceSummary) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	return nullable.Pointers(s, PortalInstanceSummary{})
}

// TransformSchema publishes PortalEntitlement's absent members as null (§13.15).
func (PortalEntitlement) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	return nullable.Pointers(s, PortalEntitlement{})
}

// TransformSchema publishes PortalVoucher's absent members as null (§13.15).
func (PortalVoucher) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	return nullable.Pointers(s, PortalVoucher{})
}

// TransformSchema publishes PortalPaymentMethod's absent members as null (§13.15).
func (PortalPaymentMethod) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	return nullable.Pointers(s, PortalPaymentMethod{})
}
