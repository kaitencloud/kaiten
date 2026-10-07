// Package billableaddons is the add-ons an instance holds, as billing reads
// them: the add-on module's implementation of billing's ports.AddonSource.
package billableaddons

import (
	"context"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/ports"
)

// Source implements ports.AddonSource.
type Source struct {
	uof *uow.UnitOfWork
}

// New returns a source reading in the transaction its callers carry.
func New(uof *uow.UnitOfWork) *Source { return &Source{uof: uof} }

var _ ports.AddonSource = (*Source)(nil)

// BillableAddons implements ports.AddonSource.
func (s *Source) BillableAddons(ctx context.Context, organizationID, instanceID uuid.UUID, billingPeriod string) ([]ports.BillableAddon, error) {
	rows, err := db.New(s.uof.DBTX(ctx)).ListBillableAddons(ctx, db.ListBillableAddonsParams{
		BillingPeriod: db.BillingPeriod(billingPeriod), OrganizationID: organizationID, InstanceID: instanceID,
	})
	if err != nil {
		return nil, err
	}
	out := make([]ports.BillableAddon, len(rows))
	for i, row := range rows {
		amount, err := decimal.NewFromString(row.UnitAmountDecimal)
		if err != nil {
			return nil, err
		}
		label := ""
		if row.DisplayLabel != nil {
			label = *row.DisplayLabel
		}
		out[i] = ports.BillableAddon{
			InstanceAddonID: row.InstanceAddonID, AddonID: row.AddonID, Name: row.AddonName, Quantity: row.Quantity,
			PriceID: row.PriceID, BillingTiming: string(row.BillingTiming), UnitAmountDecimal: amount,
			Currency: row.Currency, DisplayLabel: label,
		}
	}
	return out, nil
}

// Incompatible implements ports.AddonSource.
func (s *Source) Incompatible(ctx context.Context, organizationID, instanceID, licenseID uuid.UUID, billingPeriod string) ([]string, error) {
	return db.New(s.uof.DBTX(ctx)).AddonsIncompatibleWith(ctx, db.AddonsIncompatibleWithParams{
		OrganizationID: organizationID, InstanceID: instanceID, LicenseID: licenseID, BillingPeriod: db.BillingPeriod(billingPeriod),
	})
}
