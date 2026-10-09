package schema

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// Sources of an effective entitlement (§7.4): the instance's licence grants
// it -- add-ons and boosts may change it -- or only add-ons do.
const (
	SourceLicense = "license"
	SourceAddon   = "addon"
)

// Provenance is what each layer contributes to an instance's effective
// entitlement (§7.5), so a reader can show why a quota is what it is: the
// licence's grant, the add-ons attached, the boosts redeemed and in their
// window, and, for a number any of them changed, the arithmetic. It never
// carries a voucher code.
type Provenance struct {
	License *ProvenanceLicense `json:"license" doc:"The licence's grant; null when only add-ons grant the entitlement"`
	Addons  []ProvenanceAddon  `json:"addons" nullable:"false" doc:"The active add-on grants, in attachment order"`
	Boosts  []ProvenanceBoost  `json:"boosts" nullable:"false" doc:"The boosts in their window, in redemption order"`
	Number  *ProvenanceNumber  `json:"number" doc:"How a number was composed; null for BOOLEAN and CONFIG, and when no add-on or boost changes it"`
}

// ProvenanceLicense is the licence layer.
type ProvenanceLicense struct {
	LicenseEntitlementID           uuid.UUID        `json:"licenseEntitlementId"`
	Value                          EntitlementValue `json:"value"`
	LimitCapExceededOveragePercent *int16           `json:"limitCapExceededOveragePercent"`
}

// ProvenanceAddon is one add-on grant: its value counts quantity times.
type ProvenanceAddon struct {
	InstanceAddonID                uuid.UUID        `json:"instanceAddonId"`
	AddonID                        uuid.UUID        `json:"addonId"`
	AddonEntitlementID             uuid.UUID        `json:"addonEntitlementId"`
	Quantity                       int32            `json:"quantity"`
	OverrideBehavior               string           `json:"overrideBehavior" enum:"ADD,OVERRIDE,MAX"`
	Value                          EntitlementValue `json:"value" doc:"One unit's grant"`
	LimitCapExceededOveragePercent *int16           `json:"limitCapExceededOveragePercent"`
	AttachedAt                     time.Time        `json:"attachedAt"`
}

// ProvenanceBoost is one boost of a redeemed voucher.
type ProvenanceBoost struct {
	InstanceVoucherID         uuid.UUID  `json:"instanceVoucherId"`
	VoucherID                 uuid.UUID  `json:"voucherId"`
	VoucherEntitlementGrantID uuid.UUID  `json:"voucherEntitlementGrantId"`
	ModifierType              string     `json:"modifierType" enum:"SET,ADD,MULTIPLY,UNLIMITED"`
	ModifierValue             *float64   `json:"modifierValue"`
	RedeemedAt                time.Time  `json:"redeemedAt"`
	EffectiveStartsAt         time.Time  `json:"effectiveStartsAt"`
	EffectiveExpiresAt        *time.Time `json:"effectiveExpiresAt"`
}

// ProvenanceNumber is a number's composition: the licence's value, then the
// add-ons (OVERRIDE, MAX, ADD), then the boosts (SET, ADD, MULTIPLY).
type ProvenanceNumber struct {
	License       *float64 `json:"license" doc:"The licence's value; null when only add-ons grant it"`
	AfterAddons   float64  `json:"afterAddons"`
	BoostSet      *float64 `json:"boostSet"`
	BoostAdd      *float64 `json:"boostAdd"`
	BoostMultiply *float64 `json:"boostMultiply"`
	Unlimited     bool     `json:"unlimited"`
	Effective     float64  `json:"effective" doc:"-1 when unlimited"`
}

// The view's own spelling, snake_case as SQL builds it (§7.5). Only the
// structure is renamed: a CONFIG value inside is the vendor's object and
// keeps its keys.
type (
	sqlProvenance struct {
		License *struct {
			LicenseEntitlementID uuid.UUID        `json:"license_entitlement_id"`
			Value                EntitlementValue `json:"value"`
			OveragePercent       *int16           `json:"limit_cap_exceeded_overage_percent"`
		} `json:"license"`
		Addons []struct {
			InstanceAddonID    uuid.UUID        `json:"instance_addon_id"`
			AddonID            uuid.UUID        `json:"addon_id"`
			AddonEntitlementID uuid.UUID        `json:"addon_entitlement_id"`
			Quantity           int32            `json:"quantity"`
			OverrideBehavior   string           `json:"override_behavior"`
			Value              EntitlementValue `json:"value"`
			OveragePercent     *int16           `json:"limit_cap_exceeded_overage_percent"`
			AttachedAt         sqlTime          `json:"attached_at"`
		} `json:"addons"`
		Boosts []struct {
			InstanceVoucherID         uuid.UUID `json:"instance_voucher_id"`
			VoucherID                 uuid.UUID `json:"voucher_id"`
			VoucherEntitlementGrantID uuid.UUID `json:"voucher_entitlement_grant_id"`
			ModifierType              string    `json:"modifier_type"`
			ModifierValue             *float64  `json:"modifier_value"`
			RedeemedAt                sqlTime   `json:"redeemed_at"`
			EffectiveStartsAt         sqlTime   `json:"effective_starts_at"`
			EffectiveExpiresAt        *sqlTime  `json:"effective_expires_at"`
		} `json:"boosts"`
		Number *struct {
			License       *float64 `json:"license"`
			AfterAddons   float64  `json:"after_addons"`
			BoostSet      *float64 `json:"boost_set"`
			BoostAdd      *float64 `json:"boost_add"`
			BoostMultiply *float64 `json:"boost_multiply"`
			Unlimited     bool     `json:"unlimited"`
			Effective     float64  `json:"effective"`
		} `json:"number"`
	}

	// sqlTime is a TIMESTAMP(3) as jsonb renders it: UTC, without a zone.
	sqlTime struct{ time.Time }
)

func (t *sqlTime) UnmarshalJSON(raw []byte) error {
	var text string
	if err := json.Unmarshal(raw, &text); err != nil {
		return err
	}
	for _, layout := range []string{"2006-01-02T15:04:05.999999999", time.RFC3339Nano} {
		if parsed, err := time.Parse(layout, text); err == nil {
			t.Time = parsed.UTC()
			return nil
		}
	}
	return fmt.Errorf("provenance: unreadable timestamp %q", text)
}

// ParseProvenance decodes the view's provenance column; nil when there is
// none.
func ParseProvenance(raw []byte) (*Provenance, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return nil, nil
	}
	var in sqlProvenance
	if err := json.Unmarshal(raw, &in); err != nil {
		return nil, fmt.Errorf("provenance: %w", err)
	}
	out := &Provenance{
		License: nil,
		Addons:  make([]ProvenanceAddon, 0, len(in.Addons)),
		Boosts:  make([]ProvenanceBoost, 0, len(in.Boosts)),
		Number:  nil,
	}
	if l := in.License; l != nil {
		out.License = &ProvenanceLicense{LicenseEntitlementID: l.LicenseEntitlementID, Value: l.Value, LimitCapExceededOveragePercent: l.OveragePercent}
	}
	for _, a := range in.Addons {
		out.Addons = append(out.Addons, ProvenanceAddon{
			InstanceAddonID: a.InstanceAddonID, AddonID: a.AddonID, AddonEntitlementID: a.AddonEntitlementID,
			Quantity: a.Quantity, OverrideBehavior: a.OverrideBehavior, Value: a.Value,
			LimitCapExceededOveragePercent: a.OveragePercent, AttachedAt: a.AttachedAt.Time,
		})
	}
	for _, b := range in.Boosts {
		boost := ProvenanceBoost{
			InstanceVoucherID: b.InstanceVoucherID, VoucherID: b.VoucherID, VoucherEntitlementGrantID: b.VoucherEntitlementGrantID,
			ModifierType: b.ModifierType, ModifierValue: b.ModifierValue,
			RedeemedAt: b.RedeemedAt.Time, EffectiveStartsAt: b.EffectiveStartsAt.Time, EffectiveExpiresAt: nil,
		}
		if b.EffectiveExpiresAt != nil {
			expires := b.EffectiveExpiresAt.Time
			boost.EffectiveExpiresAt = &expires
		}
		out.Boosts = append(out.Boosts, boost)
	}
	if n := in.Number; n != nil {
		out.Number = &ProvenanceNumber{
			License: n.License, AfterAddons: n.AfterAddons, BoostSet: n.BoostSet, BoostAdd: n.BoostAdd,
			BoostMultiply: n.BoostMultiply, Unlimited: n.Unlimited, Effective: n.Effective,
		}
	}
	return out, nil
}

// SourceOf is where an effective entitlement comes from: the licence, when it
// grants it, else the add-ons.
func SourceOf(licenseEntitlementID *uuid.UUID) string {
	if licenseEntitlementID != nil {
		return SourceLicense
	}
	return SourceAddon
}
