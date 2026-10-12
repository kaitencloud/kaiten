package catalogue_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events"
	addonevents "github.com/kaitencloud/kaiten/api/internal/modules/addons/events"
	billingevents "github.com/kaitencloud/kaiten/api/internal/modules/billing/events"
	componentevents "github.com/kaitencloud/kaiten/api/internal/modules/components/events"
	customerevents "github.com/kaitencloud/kaiten/api/internal/modules/customers/events"
	deploymentzoneevents "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/events"
	identityevents "github.com/kaitencloud/kaiten/api/internal/modules/identity/events"
	instanceevents "github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	licenseevents "github.com/kaitencloud/kaiten/api/internal/modules/licenses/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/catalogue"
	publicsdkevents "github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/events"
	releaseevents "github.com/kaitencloud/kaiten/api/internal/modules/releases/events"
	voucherevents "github.com/kaitencloud/kaiten/api/internal/modules/vouchers/events"
)

var (
	ninjaOsaka = &catalogue.Ref{Slug: "ninja-osaka-prod", Name: "Ninja Osaka Production"}
	sharedEU   = &catalogue.Ref{Slug: "shared-eu", Name: "Shared EU"}
	release    = &catalogue.Ref{Slug: "2026-8-0-09480a", Name: "2026.8.0"}
	premium    = &catalogue.Ref{Slug: "premium-50bb54", Name: "Premium"}
)

// TestClickingANotificationOpensWhatItIsAbout pins where each kind of
// notification goes: the object's own page while it exists, the list it lived on
// once it does not -- never a page the app does not have.
func TestClickingANotificationOpensWhatItIsAbout(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name      string
		event     events.Metadata
		payload   string
		refs      catalogue.Refs
		wantTitle string
		wantURL   string
	}{
		{
			name:      "an instance event opens the instance, under the slug it has now",
			event:     instanceevents.InstanceDeployed,
			payload:   `{"name":"Ninja Osaka Production","slug":"ninja-osaka-old","deploymentZoneSlug":"shared-apac"}`,
			refs:      catalogue.Refs{Instance: ninjaOsaka},
			wantTitle: "Ninja Osaka Production was deployed",
			wantURL:   "/customers/instances/ninja-osaka-prod",
		},
		{
			name:      "an instance that no longer exists opens its customer",
			event:     instanceevents.InstanceCreated,
			payload:   `{"name":"Ninja Osaka Production","slug":"ninja-osaka-prod","customerSlug":"ninja-osaka"}`,
			wantTitle: "Ninja Osaka Production was created",
			wantURL:   "/customers/ninja-osaka",
		},
		{
			name:      "a deleted instance opens its customer rather than a dead page",
			event:     instanceevents.InstanceDeleted,
			payload:   `{"name":"Ninja Osaka Production","slug":"ninja-osaka-prod","customerSlug":"ninja-osaka"}`,
			wantTitle: "Ninja Osaka Production was deleted",
			wantURL:   "/customers/ninja-osaka",
		},
		{
			name:      "an instance with no customer to fall back to opens the instance list",
			event:     instanceevents.InstanceCreated,
			payload:   `{"name":"Ninja Osaka Production"}`,
			wantTitle: "Ninja Osaka Production was created",
			wantURL:   "/customers/instances",
		},
		{
			name:      "a payload that names no instance still reads, from the resolved one",
			event:     instanceevents.InstanceCreated,
			payload:   `{"instance":"ninja-osaka-prod"}`,
			refs:      catalogue.Refs{Instance: ninjaOsaka},
			wantTitle: "Ninja Osaka Production was created",
			wantURL:   "/customers/instances/ninja-osaka-prod",
		},
		{
			name:      "a usage event opens the instance's usage tab",
			event:     instanceevents.InstanceEntitlementUsageReached,
			payload:   `{"entitlementSlug":"menu-items","limit":{"type":"number","value":5}}`,
			refs:      catalogue.Refs{Instance: ninjaOsaka},
			wantTitle: "Ninja Osaka Production has used all of its menu-items",
			wantURL:   "/customers/instances/ninja-osaka-prod/entitlements",
		},
		{
			name:      "the threshold events spell their entitlement in snake_case",
			event:     instanceevents.InstanceEntitlementCapExceeded,
			payload:   `{"entitlement_slug":"menu-items","threshold":5,"value":7,"overage":2}`,
			refs:      catalogue.Refs{Instance: ninjaOsaka},
			wantTitle: "Ninja Osaka Production has reached its menu-items limit",
			wantURL:   "/customers/instances/ninja-osaka-prod/entitlements",
		},
		{
			name:      "a deployment names only ids, and opens the zone it changed",
			event:     deploymentzoneevents.ReleaseDeployed,
			payload:   `{"id":"3b93d92b-12fa-4ee9-8320-65f1aba726a1","deploymentZoneId":"10478d35-5fb7-48e2-8902-fd8b093f3832","releaseId":"bfeecc52-7881-4ac7-bd7a-b9ed263618e8"}`,
			refs:      catalogue.Refs{DeploymentZone: sharedEU, Release: release},
			wantTitle: "Release 2026.8.0 was deployed to Shared EU",
			wantURL:   "/releases/deployment-zones/shared-eu",
		},
		{
			name:      "a deployment to a zone since deleted opens the zone list",
			event:     deploymentzoneevents.ReleaseDeployed,
			payload:   `{"deploymentZoneId":"10478d35-5fb7-48e2-8902-fd8b093f3832"}`,
			refs:      catalogue.Refs{Release: release},
			wantTitle: "Release 2026.8.0 was deployed to a deployment zone",
			wantURL:   "/releases/deployment-zones",
		},
		{
			name:      "a license entitlement names the license, never its slug",
			event:     licenseevents.LicenseEntitlementAssigned,
			payload:   `{"entitlementName":"Delivery Tracking","entitlementSlug":"delivery-tracking","licenseId":"6f1c6c7e-3f7a-4f53-9f2a-0d4f1c8a9b21","licenseSlug":"premium-50bb54"}`,
			refs:      catalogue.Refs{License: premium},
			wantTitle: "Delivery Tracking was assigned to Premium",
			wantURL:   "/catalog/licenses/premium-50bb54",
		},
		{
			name:      "a license entitlement on a license since deleted opens the license list",
			event:     licenseevents.LicenseEntitlementUnassigned,
			payload:   `{"entitlementName":"Delivery Tracking","licenseSlug":"premium-50bb54"}`,
			wantTitle: "Delivery Tracking was unassigned from a license",
			wantURL:   "/catalog/licenses",
		},
		{
			name:      "a customer opens its page",
			event:     customerevents.CustomerCreated,
			payload:   `{"name":"Ninja Osaka","slug":"ninja-osaka"}`,
			wantTitle: "Ninja Osaka was added as a customer",
			wantURL:   "/customers/ninja-osaka",
		},
		{
			name:      "a deleted customer opens the customer list",
			event:     customerevents.CustomerDeleted,
			payload:   `{"name":"Ninja Osaka","slug":"ninja-osaka"}`,
			wantTitle: "Ninja Osaka was deleted",
			wantURL:   "/customers",
		},
		{
			name:      "a deleted release opens the release list",
			event:     releaseevents.ReleaseDeleted,
			payload:   `{"version":"2026.8.0","slug":"2026-8-0-09480a"}`,
			wantTitle: "Release 2026.8.0 was deleted",
			wantURL:   "/releases",
		},
		{
			name:      "a deleted zone opens the zone list",
			event:     deploymentzoneevents.DeploymentZoneDeleted,
			payload:   `{"name":"Shared EU","slug":"shared-eu"}`,
			wantTitle: "Deployment zone Shared EU was deleted",
			wantURL:   "/releases/deployment-zones",
		},
		{
			name:      "a deleted license opens the license list",
			event:     licenseevents.LicenseDeleted,
			payload:   `{"name":"Premium","slug":"premium-50bb54"}`,
			wantTitle: "License Premium was deleted",
			wantURL:   "/catalog/licenses",
		},
		{
			name:      "a component opens the catalog, since it has no page of its own",
			event:     componentevents.ComponentCreated,
			payload:   `{"name":"Kitchen display","slug":"kitchen-display"}`,
			wantTitle: "Component Kitchen display was added",
			wantURL:   "/releases/components",
		},
		{
			name:      "an issued token opens the service accounts",
			event:     identityevents.SystemOrganizationTokenIssued,
			payload:   `{"name":"ci-deploy","slug":"system-kaiten-9f2c1a"}`,
			wantTitle: "A token was issued for ci-deploy",
			wantURL:   "/integrations/service-accounts",
		},
		{
			name:      "a failed push opens the invoice",
			event:     billingevents.InstanceInvoicePushFailed,
			payload:   `{"id":"4f8c","instanceSlug":"ninja-osaka-prod","pushAttempts":5,"lastPushError":"UNAVAILABLE: Stripe did not answer in time"}`,
			wantTitle: "An invoice of ninja-osaka-prod could not be pushed to its payment provider",
			wantURL:   "/invoices/4f8c",
		},
		{
			name:      "a failed payment opens the invoice",
			event:     billingevents.InstanceInvoicePaymentFailed,
			payload:   `{"id":"4f8c","instanceSlug":"ninja-osaka-prod","failureCode":"card_declined"}`,
			wantTitle: "The payment of an invoice of ninja-osaka-prod failed",
			wantURL:   "/invoices/4f8c",
		},
		{
			name:      "a reconciliation mismatch opens the invoice",
			event:     billingevents.InstanceInvoiceReconciliationMismatch,
			payload:   `{"id":"4f8c","instanceSlug":"ninja-osaka-prod"}`,
			wantTitle: "An invoice of ninja-osaka-prod differs in its payment provider",
			wantURL:   "/invoices/4f8c",
		},
		{
			name:      "an invoice event without an id opens the invoice list",
			event:     billingevents.InstanceInvoicePushFailed,
			payload:   `{}`,
			wantTitle: "Invoice push failed",
			wantURL:   "/invoices",
		},
		{
			name:      "an expiring payment method opens its customer",
			event:     billingevents.CustomerPaymentMethodExpiring,
			payload:   `{"customerSlug":"ninja-osaka","providerKind":"STRIPE","expiresAt":"2027-03-31T23:59:59Z"}`,
			wantTitle: "ninja-osaka's payment method expires soon",
			wantURL:   "/customers/ninja-osaka",
		},
		{
			name:      "a failing provider sync opens the billing settings",
			event:     billingevents.BillingProviderSyncFailed,
			payload:   `{"providerKind":"STRIPE","consecutiveFailures":3,"lastSyncError":"UNAVAILABLE"}`,
			wantTitle: "Payments from STRIPE are not being read",
			wantURL:   "/settings/billing",
		},
		{
			name:      "a used-up voucher opens the voucher",
			event:     voucherevents.VoucherExhausted,
			payload:   `{"id":"9a1b","name":"LAUNCH20","maxRedemptions":100}`,
			wantTitle: "Voucher LAUNCH20 is used up",
			wantURL:   "/catalog/vouchers/9a1b",
		},
		{
			name:      "a used-up voucher that names no id opens the vouchers",
			event:     voucherevents.VoucherExhausted,
			payload:   `{"name":"LAUNCH20"}`,
			wantTitle: "Voucher LAUNCH20 is used up",
			wantURL:   "/catalog/vouchers",
		},
		{
			name:      "a used-up voucher event without a payload opens the vouchers",
			event:     voucherevents.VoucherExhausted,
			payload:   `{}`,
			wantTitle: "Voucher used up",
			wantURL:   "/catalog/vouchers",
		},
		{
			name:      "a disconnected provider opens the billing settings",
			event:     billingevents.BillingProviderDisconnected,
			payload:   `{"providerKind":"STRIPE","connectorName":"stripe","livemode":true}`,
			wantTitle: "STRIPE was disconnected: its invoices are no longer pushed",
			wantURL:   "/settings/billing",
		},
		{
			name:      "an issued invoice opens the invoice",
			event:     billingevents.InstanceInvoiceIssued,
			payload:   `{"id":"7f3c","instanceSlug":"acme-prod"}`,
			wantTitle: "An invoice of acme-prod was issued",
			wantURL:   "/invoices/7f3c",
		},
		{
			name:      "a handed-off invoice opens the invoice",
			event:     billingevents.InstanceInvoiceHandoffAcknowledged,
			payload:   `{"invoiceId":"7f3c","externalReference":"INV-42"}`,
			wantTitle: "An invoice was handed off",
			wantURL:   "/invoices/7f3c",
		},
		{
			name:      "a saved payment method opens the customer, without its labels",
			event:     billingevents.CustomerPaymentMethodAttached,
			payload:   `{"customerSlug":"acme","providerKind":"STRIPE","status":"ACTIVE"}`,
			wantTitle: "acme saved a payment method",
			wantURL:   "/customers/acme",
		},
		{
			name:      "an added add-on opens the instance's billing",
			event:     addonevents.InstanceAddonAdded,
			payload:   `{"instanceSlug":"acme-prod","addonSlug":"extra-seats-v1","quantity":2}`,
			wantTitle: "An add-on was added to acme-prod",
			wantURL:   "/customers/instances/acme-prod/billing",
		},
		{
			name:      "an expired voucher opens the voucher",
			event:     voucherevents.VoucherExpired,
			payload:   `{"id":"9a1b","name":"SPRING","expiresAt":"2026-10-01T00:00:00Z"}`,
			wantTitle: "Voucher SPRING expired",
			wantURL:   "/catalog/vouchers/9a1b",
		},
		{
			name:      "an expired voucher that names no id opens the vouchers",
			event:     voucherevents.VoucherExpired,
			payload:   `{"name":"SPRING"}`,
			wantTitle: "Voucher SPRING expired",
			wantURL:   "/catalog/vouchers",
		},
		{
			name:      "a publishable key is named by its label, never its key",
			event:     publicsdkevents.PublishableKeyRevoked,
			payload:   `{"id":"1","label":"Marketing site","keyHint":"x9Qa"}`,
			wantTitle: "Publishable key Marketing site was revoked",
			wantURL:   "/settings/billing",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			entry, ok := catalogue.Lookup(tc.event.Name)
			require.True(t, ok, "%s is not in the catalogue", tc.event.Name)

			rendered := entry.Render([]byte(tc.payload), tc.refs)
			assert.Equal(t, tc.wantTitle, rendered.Title)
			assert.Equal(t, tc.wantURL, rendered.ActionURL)
		})
	}
}
