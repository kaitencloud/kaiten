package gate_test

import (
	"context"
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/gate"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/attachinstanceaddon"
	addoncatalogue "github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/createaddon"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getbillingcapabilities"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/ports"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscribeinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/previewlicenseinvoice"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
	vouchercatalogue "github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/createvoucher"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/publishvoucher"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/redeemvoucher"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/validatevoucher"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage/aitest"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/pkg/dogfooding"
)

type member struct{ user currentuser.User }

func (m member) GetUser(context.Context) (*currentuser.User, error) { return &m.user, nil }

type plans struct {
	grants      map[string]bool
	unavailable string
}

func (p plans) Entitled(_ context.Context, _ uuid.UUID, slug string) (bool, error) {
	if slug == p.unavailable {
		return false, errors.New("KbK unavailable")
	}
	return p.grants[slug], nil
}

func TestCatalogueReadsRemainAllowedAfterDowngrade(t *testing.T) {
	m := member{currentuser.User{ID: uuid.New(), OrganizationID: uuid.New()}}
	g := gate.New(true, plans{grants: map[string]bool{dogfooding.BillingEntitlementSlug: true}})
	addons := addoncatalogue.Deps{UserProvider: m, Gate: g}
	vouchers := vouchercatalogue.Deps{UserProvider: m, Gate: g}
	_, err := addons.Caller(t.Context())
	require.NoError(t, err)
	_, err = vouchers.Caller(t.Context())
	require.NoError(t, err)
	_, err = addons.Writer(t.Context())
	require.Equal(t, "Addons.NotEntitled", apierrors.GetCode(err))
	_, err = vouchers.Writer(t.Context())
	require.Equal(t, "Vouchers.NotEntitled", apierrors.GetCode(err))
}

// These cases deliberately have no database or provider. A forbidden new use
// must be refused before either is reached, including previews and dry runs.
func TestNewUseIsRefusedBeforeDatabaseOrProvider(t *testing.T) {
	m := member{currentuser.User{ID: uuid.New(), OrganizationID: uuid.New()}}
	code := "PROMO"
	for _, unavailable := range []bool{false, true} {
		t.Run(map[bool]string{false: "not granted", true: "authority unavailable"}[unavailable], func(t *testing.T) {
			source := plans{grants: map[string]bool{dogfooding.BillingEntitlementSlug: true}}
			if unavailable {
				source.unavailable = dogfooding.VouchersEntitlementSlug
			}
			g := gate.New(true, source)
			vouchers := vouchercatalogue.Deps{UserProvider: m, Gate: g}
			billing := access.Deps{UserProvider: m, Gate: g}
			license := prices.Deps{UserProvider: m, Gate: g}
			cases := []struct {
				name string
				call func() error
			}{
				{"create voucher", func() error {
					_, err := createvoucher.NewUseCase(vouchers).Execute(t.Context(), vouchercatalogue.VoucherDraft{})
					return err
				}},
				{"publish voucher", func() error {
					_, err := publishvoucher.NewUseCase(vouchers).Execute(t.Context(), uuid.New())
					return err
				}},
				{"redeem voucher", func() error {
					_, err := redeemvoucher.NewUseCase(vouchers).Execute(t.Context(), "instance", code)
					return err
				}},
				{"vendor validate", func() error {
					_, err := validatevoucher.NewUseCase(vouchers).Execute(t.Context(), validatevoucher.VoucherCheck{})
					return err
				}},
				{"subscribe voucher", func() error {
					_, err := subscribeinstance.NewUseCase(billing, nil, nil).Execute(t.Context(), "instance", subscribeinstance.Command{VoucherCode: &code})
					return err
				}},
				{"invoice preview voucher", func() error {
					_, err := previewlicenseinvoice.NewUseCase(license, nil).Execute(t.Context(), "license", previewlicenseinvoice.Scenario{VoucherCode: &code})
					return err
				}},
			}
			wantCode, wantStatus := "Vouchers.NotEntitled", http.StatusForbidden
			if unavailable {
				wantCode, wantStatus = "Vouchers.EntitlementCheckUnavailable", http.StatusServiceUnavailable
			}
			for _, tc := range cases {
				t.Run(tc.name, func(t *testing.T) {
					err := tc.call()
					require.Equal(t, wantCode, apierrors.GetCode(err))
					require.Equal(t, wantStatus, apierrors.GetHTTPStatus(err))
				})
			}
		})
	}
	g := gate.New(true, plans{grants: map[string]bool{dogfooding.BillingEntitlementSlug: true}})
	addons := addoncatalogue.Deps{UserProvider: m, Gate: g}
	billing := access.Deps{UserProvider: m, Gate: g}
	license := prices.Deps{UserProvider: m, Gate: g}
	for _, tc := range []struct {
		name string
		call func() error
	}{
		{"create addon", func() error {
			_, err := createaddon.NewUseCase(addons).Execute(t.Context(), createaddon.NewAddon{Name: "Extra", PricingType: "FREE"})
			return err
		}},
		{"attach addon", func() error {
			_, err := attachinstanceaddon.NewUseCase(addons).Execute(t.Context(), "instance", attachinstanceaddon.NewInstanceAddon{})
			return err
		}},
		{"publish addon", func() error {
			_, err := (addoncatalogue.Transition{To: addoncatalogue.Published}).Move(t.Context(), addons, nil, "extra")
			return err
		}},
		{"subscribe addon", func() error {
			_, err := subscribeinstance.NewUseCase(billing, nil, nil).Execute(t.Context(), "instance", subscribeinstance.Command{AddOns: []subscribeinstance.SubscriptionAddon{{AddonSlug: "extra"}}})
			return err
		}},
		{"invoice preview addon", func() error {
			_, err := previewlicenseinvoice.NewUseCase(license, nil).Execute(t.Context(), "license", previewlicenseinvoice.Scenario{AddOns: []previewlicenseinvoice.AddonQuantity{{AddonSlug: "extra"}}})
			return err
		}},
	} {
		t.Run(tc.name, func(t *testing.T) { err := tc.call(); require.Equal(t, "Addons.NotEntitled", apierrors.GetCode(err)) })
	}
}

// The shared pricing reader also serves legacy checkout reads. It must not
// require a new-use grant; the fake returns a normal pricing refusal, not one
// from the plan, without reaching any database. The AI rollout is on here: off,
// the preview first reads whether the selection carries AI credits.
type missingPrice struct{ ports.CatalogueSource }

func (missingPrice) Price(context.Context, uuid.UUID, uuid.UUID) (*ports.CataloguePrice, error) {
	return nil, nil
}

func TestExistingCheckoutPricingDoesNotRequireNewUseGrants(t *testing.T) {
	code := "PROMO"
	u := subscribeinstance.NewUseCase(access.Deps{AIPolicy: aiusage.Policy{Flags: aitest.Flags(true)}, Uof: uow.NewUnitOfWork(nil), Catalogue: missingPrice{}}, nil, nil)
	_, err := u.PreviewActivation(t.Context(), uuid.New(), subscribeinstance.PreviewCommand{VoucherCode: &code, AddOns: []subscribeinstance.SubscriptionAddon{{AddonSlug: "extra"}}})
	require.Equal(t, "SubscribeInstance.PriceNotFound", apierrors.GetCode(err))
}

func TestDisabledBillingHidesCapabilities(t *testing.T) {
	m := member{currentuser.User{ID: uuid.New(), OrganizationID: uuid.New()}}
	for _, g := range []gate.Gate{gate.New(false, nil), gate.New(true, plans{grants: map[string]bool{dogfooding.VouchersEntitlementSlug: true, dogfooding.AddonsEntitlementSlug: true}})} {
		got, err := getbillingcapabilities.NewUseCase(access.Deps{UserProvider: m, Gate: g, Usage: retention{}}, 24*time.Hour).Execute(t.Context())
		require.NoError(t, err)
		require.False(t, got.Enabled)
		require.False(t, got.Features.Vouchers)
		require.False(t, got.Features.Addons)
	}
}

type retention struct{ ports.UsageSource }

func (retention) RetentionWindow(context.Context, uuid.UUID) (int, string) { return 0, "ENV" }

func TestCapabilitiesFollowIndependentGrants(t *testing.T) {
	m := member{currentuser.User{ID: uuid.New(), OrganizationID: uuid.New()}}
	for _, tc := range []struct {
		name             string
		vouchers, addons bool
		unavailable      string
	}{
		{"starter", false, false, ""},
		{"growth", true, true, ""},
		{"vouchers only", true, false, ""},
		{"unknown voucher grant", true, true, dogfooding.VouchersEntitlementSlug},
	} {
		t.Run(tc.name, func(t *testing.T) {
			g := gate.New(true, plans{grants: map[string]bool{dogfooding.BillingEntitlementSlug: true, dogfooding.VouchersEntitlementSlug: tc.vouchers, dogfooding.AddonsEntitlementSlug: tc.addons}, unavailable: tc.unavailable})
			got, err := getbillingcapabilities.NewUseCase(access.Deps{UserProvider: m, Gate: g, Usage: retention{}}, 24*time.Hour).Execute(t.Context())
			require.NoError(t, err)
			require.True(t, got.Enabled)
			require.Equal(t, tc.vouchers && tc.unavailable != dogfooding.VouchersEntitlementSlug, got.Features.Vouchers)
			require.Equal(t, tc.addons, got.Features.Addons)
			if tc.unavailable == "" {
				require.Empty(t, got.FeatureCheckUnavailable)
			} else {
				require.Equal(t, []string{tc.unavailable}, got.FeatureCheckUnavailable)
			}
		})
	}
}

func TestPublicVoucherValidationKeepsGrantRefusalsOpaque(t *testing.T) {
	m := member{currentuser.User{ID: uuid.New(), OrganizationID: uuid.New()}}
	for _, unavailable := range []string{"", dogfooding.VouchersEntitlementSlug} {
		g := gate.New(true, plans{grants: map[string]bool{dogfooding.BillingEntitlementSlug: true}, unavailable: unavailable})
		u := validatevoucher.NewUseCase(vouchercatalogue.Deps{UserProvider: m, Gate: g})
		voucher, err := u.Visitor(t.Context(), validatevoucher.VisitorCheck{OrganizationID: m.user.OrganizationID})
		require.NoError(t, err)
		require.Nil(t, voucher)
		voucher, err = u.Opaque(t.Context(), validatevoucher.OpaqueCheck{})
		require.NoError(t, err)
		require.Nil(t, voucher)
	}
}

func TestMismatchedCompletionProofIsRefusedByActualEntrypointsBeforeDatabase(t *testing.T) {
	m := member{currentuser.User{ID: uuid.New(), OrganizationID: uuid.New()}}
	source := &plans{grants: map[string]bool{dogfooding.BillingEntitlementSlug: true, dogfooding.VouchersEntitlementSlug: true, dogfooding.AddonsEntitlementSlug: true}}
	g := gate.New(true, source)
	code := "PROMO"
	command := subscribeinstance.Command{BasePriceID: uuid.New(), VoucherCode: &code, AddOns: []subscribeinstance.SubscriptionAddon{{AddonSlug: "extra", Quantity: 2}}}
	scope, err := g.BeginSelection(t.Context(), m.user.OrganizationID, m.user.ID, command.LicensingSelection("instance"))
	require.NoError(t, err)
	defer scope.Close()
	// No DB/UOW/provider is wired: each actual nested entrypoint must reject
	// the mismatched action without reaching any of them.
	_, err = subscribeinstance.NewUseCase(access.Deps{UserProvider: m, Gate: g}, nil, nil).Execute(scope.Context(), "other", command)
	require.Equal(t, gate.CodeEntitlementCheckUnavailable, apierrors.GetCode(err))
	_, err = attachinstanceaddon.NewUseCase(addoncatalogue.Deps{UserProvider: m, Gate: g}).Execute(scope.Context(), "instance", attachinstanceaddon.NewInstanceAddon{AddonSlug: "extra", Quantity: 3})
	require.Equal(t, gate.CodeEntitlementCheckUnavailable, apierrors.GetCode(err))
	_, err = redeemvoucher.NewUseCase(vouchercatalogue.Deps{UserProvider: m, Gate: g}).Execute(scope.Context(), "instance", "OTHER")
	require.Equal(t, gate.CodeEntitlementCheckUnavailable, apierrors.GetCode(err))
}
