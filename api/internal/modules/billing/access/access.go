// Package access is what every billing use case does first: name the caller,
// and keep the billing surface behind its switch.
package access

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/gate"
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
