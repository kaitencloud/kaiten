// Package access is what every billing use case does first: name the caller,
// and keep the billing surface behind its switch.
package access

import (
	"context"
	"time"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/gate"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/ports"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
)

// Deps is what every billing use case needs.
type Deps struct {
	UserProvider currentuser.Provider
	Uof          *uow.UnitOfWork
	Gate         gate.Gate
	// Catalogue and Usage are the other modules' data billing reads: licence
	// prices, and the usage journal.
	Catalogue ports.CatalogueSource
	Usage     ports.UsageSource
	// Addons is the add-ons an instance holds, which its invoices bill.
	Addons ports.AddonSource
	// Discounts is the PRICE vouchers an instance redeemed, which its
	// invoices apply.
	Discounts ports.DiscountSource
	// Attacher, Redeemer and Mover are the other modules' writes a subscribe
	// makes inside its transaction: the add-ons and the voucher it is started
	// with (§9.1), and the version a self-serve checkout moves the instance to
	// (§14.4 rule 2). Nil where a test wires none: a subscribe that asks for
	// one is then refused.
	Attacher ports.AddonAttacher
	Redeemer ports.VoucherRedeemer
	Mover    ports.InstanceVersionMover
	// Providers resolves the payment providers invoices are issued through.
	Providers provider.Registry
	// ProviderTimeout bounds one call to a provider.
	ProviderTimeout time.Duration
	// AutoCollectionGrace is how long an invoice the provider charges may
	// stay unpaid after its issue before it is overdue (§9.6 rule 1).
	AutoCollectionGrace time.Duration
}

// AutoCollectionBefore is the issue instant before which an unpaid invoice
// the provider charges is overdue at now.
func (d Deps) AutoCollectionBefore(now time.Time) time.Time {
	return now.Add(-d.AutoCollectionGrace)
}

// Caller is the user a request acts for, past the billing gate.
func (d Deps) Caller(ctx context.Context) (*currentuser.User, error) {
	user, err := d.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}
	if err := d.Gate.Require(ctx, user.OrganizationID); err != nil {
		return nil, err
	}
	return user, nil
}

// Queries binds to the transaction ctx carries, or the pool.
func (d Deps) Queries(ctx context.Context) *db.Queries {
	return db.New(d.Uof.DBTX(ctx))
}

// Pushes reports whether invoices issued through a provider wait in the push
// queue rather than being issued MANUAL. A provider this deployment does not
// know is taken to push: its invoices wait in the queue until a deployment
// that knows it pushes them.
func (d Deps) Pushes(kind db.BillingProviderKind) bool {
	if kind == db.BillingProviderKindNOOP {
		return false
	}
	if d.Providers == nil {
		return true
	}
	capabilities, ok := d.Providers.Capabilities(provider.Kind(kind))
	return !ok || capabilities.PushesInvoices
}
