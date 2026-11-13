package subscribeinstance

import "github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/gate"

// LicensingSelection binds the effective purchase, including default quantities.
// Other command fields remain subject to the ordinary transactional rules.
func (cmd Command) LicensingSelection(instanceSlug string) gate.Selection {
	selection := gate.Selection{InstanceSlug: instanceSlug, BasePriceID: cmd.BasePriceID, VoucherCode: cmd.VoucherCode}
	for _, addon := range cmd.AddOns {
		selection.AddOns = append(selection.AddOns, gate.SelectionAddon{Slug: addon.AddonSlug, Quantity: addon.Quantity})
	}
	return selection
}
