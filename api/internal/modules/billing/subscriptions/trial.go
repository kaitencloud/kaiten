package subscriptions

import (
	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/shared/nullable"
)

// TrialWillEnd is the payload of INSTANCE_BILLING_TRIAL_WILL_END: the
// subscription, plus what the vendor's reminder e-mail needs, read when it is
// emitted and never updated (§15.2 rule 9, V32-09).
type TrialWillEnd struct {
	InstanceBilling
	Customer      TrialCustomer       `json:"customer"`
	Instance      TrialInstance       `json:"instance"`
	LicenseName   string              `json:"licenseName" doc:"The licence version of the base price"`
	FamilySlug    string              `json:"familySlug" doc:"Its family"`
	DaysLeft      int                 `json:"daysLeft" doc:"Whole days from the event to trialEndsAt, rounded up; 0 once it passed"`
	Charge        *TrialCharge        `json:"charge" doc:"What the conversion would charge, as upcoming-invoice previews it, discounts included and before any tax the provider adds; null when nothing would be"`
	PaymentMethod *TrialPaymentMethod `json:"paymentMethod" doc:"The ACTIVE card the conversion would be charged to; null without one, or on NOOP"`
}

// TransformSchema publishes the payload's absent members as null, its
// InstanceBilling's included (§13.15).
func (TrialWillEnd) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	return nullable.Pointers(s, TrialWillEnd{})
}

// TrialCustomer is who the reminder is for.
type TrialCustomer struct {
	Slug         string  `json:"slug"`
	Name         string  `json:"name"`
	BillingEmail *string `json:"billingEmail" nullable:"true" doc:"Personal data: the second payload that carries an e-mail (D-56)"`
}

// TrialInstance is the instance on trial.
type TrialInstance struct {
	Slug string `json:"slug"`
	Name string `json:"name"`
}

// TrialCharge is an amount the conversion would charge, in minor units.
type TrialCharge struct {
	Amount        int64  `json:"amount"`
	Currency      string `json:"currency" example:"EUR"`
	BillingPeriod string `json:"billingPeriod" enum:"MONTHLY,QUARTERLY,SEMI_ANNUAL,ANNUAL"`
}

// TrialPaymentMethod is the labels of a card, never its data.
type TrialPaymentMethod struct {
	Brand    *string `json:"brand" nullable:"true" example:"visa"`
	Last4    *string `json:"last4" nullable:"true" example:"4242"`
	ExpMonth *int    `json:"expMonth" nullable:"true"`
	ExpYear  *int    `json:"expYear" nullable:"true"`
}
