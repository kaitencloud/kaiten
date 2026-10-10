// Package effective is the reference resolution of an instance's effective
// entitlement (§7.2, §7.3, D-53): the licence grant, then the add-ons
// attached, then the boosts in their window. The SQL view
// instance_effective_entitlement is what every reader uses; this is its
// oracle, written from the spec, which the differential tests hold the view
// to (S03-043, S03-044), and what a preview resolves a grant with when it has
// no instance to read (§8.9).
//
// It is pure: it reads nothing and asks no clock. Numbers are exact decimals.
package effective

import (
	"encoding/json"
	"slices"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// Entitlement types.
const (
	TypeNumber         = "NUMBER"
	TypeNumberAICredit = "NUMBER_AI_CREDIT"
	TypeBoolean        = "BOOLEAN"
	TypeConfig         = "CONFIG"
)

// Add-on grant behaviours and boost modifiers.
const (
	BehaviorAdd      = "ADD"
	BehaviorOverride = "OVERRIDE"
	BehaviorMax      = "MAX"

	ModifierSet       = "SET"
	ModifierAdd       = "ADD"
	ModifierMultiply  = "MULTIPLY"
	ModifierUnlimited = "UNLIMITED"

	// StatusActive is the only redemption status whose boosts apply.
	StatusActive = "ACTIVE"
)

// LicenceGrant is the licence version's grant of the entitlement.
type LicenceGrant struct {
	// Value is the grant as stored: {"type": "number", "value": 1000.5}.
	Value json.RawMessage
	Pct   *int16
}

// AddonGrant is one grant of an add-on attached to the instance (and not
// removed): its value counts quantity times.
type AddonGrant struct {
	// ID and AttachedAt are the attachment's: the latest attached wins an
	// OVERRIDE, a CONFIG and the percent.
	ID         uuid.UUID
	AttachedAt time.Time
	Quantity   int32
	Behavior   string
	Value      json.RawMessage
	Pct        *int16
}

// Boost is one modification a redemption of an ENTITLEMENT_BOOST voucher
// makes to the entitlement.
type Boost struct {
	// ID and RedeemedAt are the redemption's: the latest redeemed SET wins.
	ID         uuid.UUID
	RedeemedAt time.Time
	Modifier   string
	// Value is the modifier's value; nil for UNLIMITED.
	Value   *decimal.Decimal
	Status  string
	Starts  time.Time
	Expires *time.Time
}

// Input is one (instance, entitlement) at an instant.
type Input struct {
	Type    string
	Licence *LicenceGrant
	Addons  []AddonGrant
	Boosts  []Boost
	At      time.Time
}

// Number is how a NUMBER entitlement's effective value was composed, when an
// add-on or a boost contributed (the view's provenance.number).
type Number struct {
	License       *decimal.Decimal
	AfterAddons   decimal.Decimal
	BoostSet      *decimal.Decimal
	BoostAdd      *decimal.Decimal
	BoostMultiply *decimal.Decimal
	Unlimited     bool
	Effective     decimal.Decimal
}

// Result is the effective entitlement.
type Result struct {
	// Value is the effective value: the licence's verbatim when nothing else
	// contributes, else {"type": ..., "value": ...}.
	Value json.RawMessage
	// Pct is the effective overage percent; nil for BOOLEAN and CONFIG once
	// an add-on contributes, and when the licence's is.
	Pct             *int16
	AddonGrantCount int
	BoostGrantCount int
	// Number is set for a NUMBER entitlement an add-on or a boost touches.
	Number *Number
}

type typed struct {
	Type  string          `json:"type"`
	Value json.RawMessage `json:"value"`
}

func parse(raw json.RawMessage) (typed, bool) {
	var t typed
	if len(raw) == 0 || json.Unmarshal(raw, &t) != nil {
		return typed{}, false
	}
	return t, true
}

func number(raw json.RawMessage) (decimal.Decimal, bool) {
	t, ok := parse(raw)
	if !ok || t.Type != "number" {
		return decimal.Decimal{}, false
	}
	d, err := decimal.NewFromString(string(t.Value))
	return d, err == nil
}

func boolean(raw json.RawMessage) (value, ok bool) {
	t, parsed := parse(raw)
	if !parsed || t.Type != "boolean" {
		return false, false
	}
	if json.Unmarshal(t.Value, &value) != nil {
		return false, false
	}
	return value, true
}

var minusOne = decimal.NewFromInt(-1)

// latestFirst orders attachments the latest attached first (created_at DESC,
// id DESC).
func latestFirst(grants []AddonGrant) []AddonGrant {
	out := slices.Clone(grants)
	slices.SortStableFunc(out, func(a, b AddonGrant) int {
		if c := b.AttachedAt.Compare(a.AttachedAt); c != 0 {
			return c
		}
		return compareUUID(b.ID, a.ID)
	})
	return out
}

func compareUUID(a, b uuid.UUID) int {
	for i := range a {
		if a[i] != b[i] {
			if a[i] < b[i] {
				return -1
			}
			return 1
		}
	}
	return 0
}

// Resolve resolves one entitlement of one instance. ok is false when the
// instance has no row for it: neither the licence nor an attached add-on
// grants it (boosts never grant one, §7.2).
func Resolve(in Input) (Result, bool) {
	if in.Licence == nil && len(in.Addons) == 0 {
		return Result{}, false
	}
	isNumber := in.Type == TypeNumber || in.Type == TypeNumberAICredit

	// Boosts apply to numbers only, ACTIVE, in their window.
	var boosts []Boost
	if isNumber {
		for _, b := range in.Boosts {
			if b.Status == StatusActive && !in.At.Before(b.Starts) && (b.Expires == nil || in.At.Before(*b.Expires)) {
				boosts = append(boosts, b)
			}
		}
	}
	out := Result{Value: nil, Pct: nil, AddonGrantCount: len(in.Addons), BoostGrantCount: len(boosts), Number: nil}

	// Identity (INV-22): nothing contributes, the licence's grant verbatim.
	if len(in.Addons) == 0 && len(boosts) == 0 {
		out.Value, out.Pct = in.Licence.Value, in.Licence.Pct
		return out, true
	}

	var licence json.RawMessage
	var licencePct *int16
	if in.Licence != nil {
		licence, licencePct = in.Licence.Value, in.Licence.Pct
	}
	latest := latestFirst(in.Addons)

	switch {
	case isNumber:
		n := numberOf(licence, latest, boosts)
		out.Number = &n
		out.Value = mustJSON(map[string]any{"type": "number", "value": json.RawMessage(n.Effective.String())})
		pct := int16(0)
		switch {
		case n.Unlimited:
			pct = -1
		default:
			found := false
			for _, g := range latest {
				if g.Pct != nil {
					pct, found = *g.Pct, true
					break
				}
			}
			if !found && licencePct != nil {
				pct = *licencePct
			}
		}
		out.Pct = &pct
	case in.Type == TypeBoolean:
		value, _ := boolean(licence)
		for _, g := range in.Addons {
			if v, ok := boolean(g.Value); ok && v {
				value = true
			}
		}
		out.Value = mustJSON(map[string]any{"type": "boolean", "value": value})
	default:
		out.Value = licence
		for _, g := range latest {
			if t, ok := parse(g.Value); ok && t.Type == "object" {
				out.Value = g.Value
				break
			}
		}
	}
	return out, true
}

// numberOf composes a number (§7.2): unlimited anywhere; else OVERRIDE (the
// latest), MAX, ADD, all times the quantity; then the latest SET boost, the
// ADD boosts and the product of the MULTIPLY boosts, exactly.
func numberOf(licence json.RawMessage, latest []AddonGrant, boosts []Boost) Number {
	var n Number
	lic, hasLicence := number(licence)
	if hasLicence {
		l := lic
		n.License = &l
	}
	n.Unlimited = hasLicence && lic.Equal(minusOne)

	var override, maximum *decimal.Decimal
	add := decimal.Zero
	hasAdd := false
	for _, g := range latest {
		v, ok := number(g.Value)
		if !ok {
			continue
		}
		if v.Equal(minusOne) {
			n.Unlimited = true
		}
		contribution := v.Mul(decimal.NewFromInt32(g.Quantity))
		switch g.Behavior {
		case BehaviorOverride:
			if override == nil {
				c := contribution
				override = &c
			}
		case BehaviorMax:
			if maximum == nil || contribution.GreaterThan(*maximum) {
				c := contribution
				maximum = &c
			}
		case BehaviorAdd:
			add, hasAdd = add.Add(contribution), true
		}
	}
	base := decimal.Zero
	switch {
	case override != nil:
		base = *override
	case hasLicence:
		base = lic
	}
	if maximum != nil && maximum.GreaterThan(base) {
		base = *maximum
	}
	if hasAdd {
		base = base.Add(add)
	}
	n.AfterAddons = base

	// Latest SET by redeemed_at DESC, id DESC; ADD summed; MULTIPLY product.
	ordered := slices.Clone(boosts)
	slices.SortStableFunc(ordered, func(a, b Boost) int {
		if c := b.RedeemedAt.Compare(a.RedeemedAt); c != 0 {
			return c
		}
		return compareUUID(b.ID, a.ID)
	})
	for _, b := range ordered {
		switch b.Modifier {
		case ModifierUnlimited:
			n.Unlimited = true
		case ModifierSet:
			if n.BoostSet == nil && b.Value != nil {
				v := *b.Value
				n.BoostSet = &v
			}
		case ModifierAdd:
			if b.Value != nil {
				sum := *b.Value
				if n.BoostAdd != nil {
					sum = n.BoostAdd.Add(*b.Value)
				}
				n.BoostAdd = &sum
			}
		case ModifierMultiply:
			if b.Value != nil {
				product := *b.Value
				if n.BoostMultiply != nil {
					product = n.BoostMultiply.Mul(*b.Value)
				}
				n.BoostMultiply = &product
			}
		}
	}
	if n.Unlimited {
		n.Effective = minusOne
		return n
	}
	value := n.AfterAddons
	if n.BoostSet != nil {
		value = *n.BoostSet
	}
	if n.BoostAdd != nil {
		value = value.Add(*n.BoostAdd)
	}
	if n.BoostMultiply != nil {
		value = value.Mul(*n.BoostMultiply)
	}
	n.Effective = value
	return n
}

func mustJSON(v any) json.RawMessage {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return b
}
