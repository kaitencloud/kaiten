package aihistory

import (
	"context"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
)

var RequiredScope = scope.Read(scope.Instances)

type Port interface {
	ListAIInferences(context.Context, caller.OrganizationCaller, string, string, Filter) (schema.AiInferencePage, error)
	ListAIReservations(context.Context, caller.OrganizationCaller, string, string) (schema.AiReservations, error)
}

type InferenceRequest struct {
	InstanceSlug    string    `path:"instanceSlug"`
	EntitlementSlug string    `path:"entitlementSlug"`
	From            time.Time `query:"from"`
	To              time.Time `query:"to"`
	Status          string    `query:"status" enum:"RESERVED,COMMITTED,RELEASED,EXPIRED"`
	TransactionID   string    `query:"transactionId"`
	Cursor          string    `query:"cursor"`
	Limit           int32     `query:"limit" minimum:"1" maximum:"500"`
}
type (
	InferenceResponse  struct{ Body schema.AiInferencePage }
	ReservationRequest struct {
		InstanceSlug    string `path:"instanceSlug"`
		EntitlementSlug string `path:"entitlementSlug"`
	}
)
type ReservationResponse struct{ Body schema.AiReservations }

func RegisterEndpoints(api huma.API, app Port) {
	kaitenhuma.RegisterScoped(api, huma.Operation{OperationID: "listAiInferences", Method: http.MethodGet, Path: "/instances/{instanceSlug}/entitlements/{entitlementSlug}/usage/inferences", Summary: "List AI inferences", Tags: []string{"instances"}, Errors: []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError}}, RequiredScope, func(ctx context.Context, req *InferenceRequest) (*InferenceResponse, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		filter := Filter{From: req.From, To: req.To, Limit: req.Limit}
		if req.Status != "" {
			s := db.AiInferenceStatus(req.Status)
			filter.Status = &s
		}
		if req.TransactionID != "" {
			filter.TransactionID = &req.TransactionID
		}
		if req.Cursor != "" {
			filter.Cursor = &req.Cursor
		}
		page, err := app.ListAIInferences(ctx, cl, req.InstanceSlug, req.EntitlementSlug, filter)
		if err != nil {
			return nil, err
		}
		return &InferenceResponse{Body: page}, nil
	})
	kaitenhuma.RegisterScoped(api, huma.Operation{OperationID: "listAiReservations", Method: http.MethodGet, Path: "/instances/{instanceSlug}/entitlements/{entitlementSlug}/usage/reservations", Summary: "List open AI reservations", Tags: []string{"instances"}, Errors: []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError}}, RequiredScope, func(ctx context.Context, req *ReservationRequest) (*ReservationResponse, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		page, err := app.ListAIReservations(ctx, cl, req.InstanceSlug, req.EntitlementSlug)
		if err != nil {
			return nil, err
		}
		return &ReservationResponse{Body: page}, nil
	})
}
