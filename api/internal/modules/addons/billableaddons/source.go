// Package billableaddons is the add-ons an instance holds, as billing reads
// them: the add-on module's implementation of billing's ports.AddonSource.
package billableaddons

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/shopspring/decimal"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
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

// BillableAttachments implements ports.AddonSource.
func (s *Source) BillableAttachments(ctx context.Context, organizationID, instanceID uuid.UUID, billingPeriod string, from, to time.Time) ([]ports.BillableAttachment, error) {
	q := db.New(s.uof.DBTX(ctx))
	rows, err := q.ListBillableAttachments(ctx, db.ListBillableAttachmentsParams{
		OrganizationID: organizationID, InstanceID: instanceID, ToAt: timestamp(to), FromAt: timestamp(from),
	})
	if err != nil || len(rows) == 0 {
		return nil, err
	}
	addonIDs := make([]uuid.UUID, 0, len(rows))
	for _, row := range rows {
		addonIDs = append(addonIDs, row.AddonID)
	}
	active := db.PriceStatusACTIVE
	priceRows, err := q.ListAddonPrices(ctx, db.ListAddonPricesParams{OrganizationID: organizationID, AddonIds: addonIDs, Status: &active})
	if err != nil {
		return nil, err
	}
	byAddon := map[uuid.UUID][]db.ListAddonPricesRow{}
	for _, row := range priceRows {
		byAddon[row.AddonID] = append(byAddon[row.AddonID], row)
	}

	out := make([]ports.BillableAttachment, 0, len(rows))
	for _, row := range rows {
		attachment := ports.BillableAttachment{
			InstanceAddonID: row.InstanceAddonID, AddonID: row.AddonID, FamilyID: row.AddonFamilyID, Name: row.AddonName,
			Quantity: row.Quantity, AttachedAt: row.AttachedAt.Time.UTC(), RemovedAt: nil, Flat: nil, Metered: nil,
		}
		if row.RemovedAt.Valid {
			removed := row.RemovedAt.Time.UTC()
			attachment.RemovedAt = &removed
		}
		flat, metered, err := split(byAddon[row.AddonID], row.InstanceAddonID, row.AddonID, row.AddonName, row.Quantity, billingPeriod)
		if err != nil {
			return nil, err
		}
		attachment.Flat, attachment.Metered = flat, metered
		out = append(out, attachment)
	}
	return out, nil
}

func timestamp(t time.Time) pgtype.Timestamp {
	return pgtype.Timestamp{Time: t.UTC(), InfinityModifier: pgtype.Finite, Valid: true}
}

// split sorts an add-on version's ACTIVE prices into its default FLAT_FEE
// price for billingPeriod and its metered prices.
func split(rows []db.ListAddonPricesRow, attachmentID, addonID uuid.UUID, name string, quantity int32, billingPeriod string) (*ports.BillableAddon, []ports.CataloguePrice, error) {
	var flat *ports.BillableAddon
	var metered []ports.CataloguePrice
	for _, price := range rows {
		switch {
		case price.BillingModel == db.BillingModelFLATFEE:
			if !price.IsDefault || price.BillingPeriod == nil || string(*price.BillingPeriod) != billingPeriod {
				continue
			}
			amount, err := decimal.NewFromString(price.UnitAmountDecimal)
			if err != nil {
				return nil, nil, err
			}
			label := ""
			if price.DisplayLabel != nil {
				label = *price.DisplayLabel
			}
			flat = &ports.BillableAddon{
				InstanceAddonID: attachmentID, AddonID: addonID, Name: name, Quantity: quantity,
				PriceID: price.ID, BillingTiming: string(price.BillingTiming), UnitAmountDecimal: amount,
				Currency: price.Currency, DisplayLabel: label,
			}
		case price.MetersEntitlementID != nil:
			entitlementName := ""
			if price.EntitlementName != nil {
				entitlementName = *price.EntitlementName
			}
			metered = append(metered, ports.CataloguePrice{
				Price: catalogue.ToPrice(price), LicenseID: uuid.Nil, LicenseSlug: "", LicenseName: "", LicenseState: "",
				EntitlementID: price.MetersEntitlementID, EntitlementName: entitlementName,
			})
		}
	}
	return flat, metered, nil
}

// PreviewAddon implements ports.AddonSource.
func (s *Source) PreviewAddon(ctx context.Context, organizationID uuid.UUID, slug, billingPeriod string) (*ports.PreviewAddon, error) {
	q := db.New(s.uof.DBTX(ctx))
	addon, err := q.GetAddonBySlug(ctx, db.GetAddonBySlugParams{OrganizationID: organizationID, Slug: slug})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	grants, err := q.ListAddonEntitlements(ctx, db.ListAddonEntitlementsParams{OrganizationID: organizationID, AddonID: addon.ID, EntitlementSlug: nil})
	if err != nil {
		return nil, err
	}
	active := db.PriceStatusACTIVE
	priceRows, err := q.ListAddonPrices(ctx, db.ListAddonPricesParams{OrganizationID: organizationID, AddonIds: []uuid.UUID{addon.ID}, Status: &active})
	if err != nil {
		return nil, err
	}
	flat, metered, err := split(priceRows, uuid.Nil, addon.ID, addon.Name, 0, billingPeriod)
	if err != nil {
		return nil, err
	}
	out := &ports.PreviewAddon{AddonID: addon.ID, Name: addon.Name, Grants: nil, Flat: flat, Metered: metered}
	for _, grant := range grants {
		out.Grants = append(out.Grants, ports.AddonGrantRef{
			EntitlementID: grant.EntitlementID, Behavior: string(grant.OverrideBehavior),
			Value: grant.Value, Pct: grant.LimitCapExceededOveragePercent,
		})
	}
	return out, nil
}
