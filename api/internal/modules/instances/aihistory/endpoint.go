package aihistory

import (
	"context"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
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
	TransactionID   string    `query:"transactionId" maxLength:"128"`
	Authorized      string    `query:"authorized" enum:"true,false" doc:"Only the operations the commit authorized (true) or refused (false). An operation still RESERVED matches neither."`
	ModelSlug       string    `query:"modelSlug" maxLength:"255" doc:"Only the operations that resolved to this catalogue model."`
	Model           string    `query:"model" maxLength:"255" doc:"Only the operations whose model, as sent, is exactly this one. Finds models the catalogue does not know."`
	RequestType     string    `query:"requestType" enum:"COMPLETION,EMBEDDING,IMAGE_GENERATION,AUDIO,VIDEO"`
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
		filter := FilterOf(FilterQuery{From: req.From, To: req.To, Status: req.Status, TransactionID: req.TransactionID, Authorized: req.Authorized, ModelSlug: req.ModelSlug, Model: req.Model, RequestType: req.RequestType, Cursor: req.Cursor, Limit: req.Limit})
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
