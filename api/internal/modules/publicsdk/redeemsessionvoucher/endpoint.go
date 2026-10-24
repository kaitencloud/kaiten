package redeemsessionvoucher

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/sessions"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// FacadeRedeemer is the one facade method this operation calls.
type FacadeRedeemer interface {
	RedeemSessionVoucher(ctx context.Context, cl caller.CustomerSessionCaller, request SessionRedeem) (*sessions.SessionRedemption, bool, error)
}

type Request struct {
	Body SessionRedeem
}

type Response struct {
	Status int
	Body   *sessions.SessionRedemption
}

func RegisterEndpoint(api huma.API, app FacadeRedeemer) {
	kaitenhuma.RegisterSession(api, huma.Operation{
		OperationID:   "redeemSessionVoucher",
		Method:        http.MethodPost,
		Path:          "/public/session/vouchers/redeem",
		Summary:       "Redeem a voucher code",
		DefaultStatus: http.StatusCreated,
		Description: "Redeems a code on the session's instance, whose subscription is TRIAL, ACTIVE or PAST_DUE: 201 with the redemption, never the code; " +
			"dryRun answers 200 with the redemption it would make and writes nothing. A PRICE voucher discounts from the next invoice composed (appliesFromInvoice: next), " +
			"never one already issued; a boost applies at once. Every refusal of the code is the same 422 .VoucherInvalid. " +
			"409 .SubscriptionIncomplete (a checkout waits for its payment), .NoLiveSubscription; 422 .InstanceRequired (a session bound to the customer only); " +
			"429 .RateLimited, with Retry-After, past 10 attempts per 10 minutes per session or 30 an hour per customer, validate's included.",
		Tags: []string{"public"},
		Errors: []int{
			http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusConflict,
			http.StatusUnprocessableEntity, http.StatusTooManyRequests, http.StatusInternalServerError, http.StatusServiceUnavailable,
		},
	}, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.CustomerSession(ctx)
		if err != nil {
			return nil, err
		}
		redemption, created, err := app.RedeemSessionVoucher(ctx, cl, request.Body)
		if err != nil {
			return nil, err
		}
		status := http.StatusOK
		if created {
			status = http.StatusCreated
		}
		return &Response{Status: status, Body: redemption}, nil
	})
}
