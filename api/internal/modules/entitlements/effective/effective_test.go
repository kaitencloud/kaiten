package effective_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/effective"
)

var t0 = time.Date(2027, 3, 1, 12, 0, 0, 0, time.UTC)

func num(v string) json.RawMessage { return json.RawMessage(`{"type":"number","value":` + v + `}`) }
func pct(p int16) *int16           { return &p }
func dec(v string) *decimal.Decimal {
	d := decimal.RequireFromString(v)
	return &d
}

func licence(v string, p int16) *effective.LicenceGrant {
	return &effective.LicenceGrant{Value: num(v), Pct: pct(p)}
}

func addon(minutes int, quantity int32, behavior, value string, p *int16) effective.AddonGrant {
	return effective.AddonGrant{
		ID: uuid.New(), AttachedAt: t0.Add(time.Duration(minutes) * time.Minute), Quantity: quantity,
		Behavior: behavior, Value: num(value), Pct: p,
	}
}

func boost(minutes int, modifier string, value *decimal.Decimal) effective.Boost {
	return effective.Boost{
		ID: uuid.New(), RedeemedAt: t0.Add(time.Duration(minutes) * time.Minute), Modifier: modifier, Value: value,
		Status: effective.StatusActive, Starts: t0.Add(-time.Hour), Expires: nil,
	}
}

func valueOf(t *testing.T, r effective.Result) decimal.Decimal {
	t.Helper()
	var v struct {
		Value json.Number `json:"value"`
	}
	require.NoError(t, json.Unmarshal(r.Value, &v))
	return decimal.RequireFromString(v.Value.String())
}

// S03-043: the oracle's composition rules, case by case (§7.2, §7.3).
func TestResolveNumbers(t *testing.T) {
	at := t0.Add(24 * time.Hour)
	for _, tc := range []struct {
		name   string
		in     effective.Input
		value  string
		pct    int16
		addons int
		boosts int
	}{
		{"an ADD grant counts its quantity", effective.Input{
			Type: effective.TypeNumber, Licence: licence("10000", 50),
			Addons: []effective.AddonGrant{addon(1, 3, effective.BehaviorAdd, "1000", nil)}, At: at,
		}, "13000", 50, 1, 0},
		{"the latest OVERRIDE wins", effective.Input{Type: effective.TypeNumber, Licence: licence("10000", 50), Addons: []effective.AddonGrant{
			addon(1, 1, effective.BehaviorOverride, "20000", nil), addon(2, 1, effective.BehaviorOverride, "25000", nil),
		}, At: at}, "25000", 50, 2, 0},
		{"MAX raises, never lowers", effective.Input{Type: effective.TypeNumber, Licence: licence("10000", 50), Addons: []effective.AddonGrant{
			addon(1, 1, effective.BehaviorMax, "15000", nil), addon(2, 1, effective.BehaviorMax, "5000", nil),
		}, At: at}, "15000", 50, 2, 0},
		{"OVERRIDE, then MAX, then ADD", effective.Input{Type: effective.TypeNumber, Licence: licence("10000", 50), Addons: []effective.AddonGrant{
			addon(1, 1, effective.BehaviorOverride, "2000", nil), addon(2, 1, effective.BehaviorMax, "5000", nil),
			addon(3, 2, effective.BehaviorAdd, "100", nil),
		}, At: at}, "5200", 50, 3, 0},
		{"an unlimited add-on makes it unlimited", effective.Input{
			Type: effective.TypeNumber, Licence: licence("10000", 50),
			Addons: []effective.AddonGrant{addon(1, 1, effective.BehaviorAdd, "-1", nil)}, At: at,
		}, "-1", -1, 1, 0},
		{"the latest add-on percent wins", effective.Input{Type: effective.TypeNumber, Licence: licence("10000", 50), Addons: []effective.AddonGrant{
			addon(1, 1, effective.BehaviorAdd, "1", pct(10)), addon(2, 1, effective.BehaviorAdd, "1", pct(20)),
		}, At: at}, "10002", 20, 2, 0},
		{"add-ons only, no percent: a hard limit", effective.Input{
			Type: effective.TypeNumber, Licence: nil,
			Addons: []effective.AddonGrant{addon(1, 2, effective.BehaviorAdd, "500", nil)}, At: at,
		}, "1000", 0, 1, 0},
		{
			"SET, then ADD, then MULTIPLY (S03-023)",
			effective.Input{Type: effective.TypeNumber, Licence: licence("10000", 50), Boosts: []effective.Boost{
				boost(1, effective.ModifierSet, dec("5000")), boost(2, effective.ModifierAdd, dec("100")), boost(3, effective.ModifierMultiply, dec("2")),
			}, At: at},
			"10200", 50, 0, 3,
		},
		{"the latest SET wins", effective.Input{Type: effective.TypeNumber, Licence: licence("10000", 50), Boosts: []effective.Boost{
			boost(1, effective.ModifierSet, dec("7000")), boost(2, effective.ModifierSet, dec("5000")),
		}, At: at}, "5000", 50, 0, 2},
		{"multiplications are exact", effective.Input{Type: effective.TypeNumber, Licence: licence("10000", 50), Boosts: []effective.Boost{
			boost(1, effective.ModifierMultiply, dec("1.5")), boost(2, effective.ModifierMultiply, dec("2")),
		}, At: at}, "30000", 50, 0, 2},
		{"an UNLIMITED boost", effective.Input{
			Type: effective.TypeNumber, Licence: licence("10000", 50),
			Boosts: []effective.Boost{boost(1, effective.ModifierUnlimited, nil)}, At: at,
		}, "-1", -1, 0, 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r, ok := effective.Resolve(tc.in)
			require.True(t, ok)
			require.True(t, valueOf(t, r).Equal(decimal.RequireFromString(tc.value)), "value %s", r.Value)
			require.Equal(t, tc.pct, *r.Pct)
			require.Equal(t, tc.addons, r.AddonGrantCount)
			require.Equal(t, tc.boosts, r.BoostGrantCount)
			require.NotNil(t, r.Number)
		})
	}
}

func TestResolveIdentityAndWindows(t *testing.T) {
	at := t0.Add(24 * time.Hour)
	verbatim := &effective.LicenceGrant{Value: json.RawMessage(`{"type": "number", "value": 1000.5}`), Pct: pct(0)}
	r, ok := effective.Resolve(effective.Input{Type: effective.TypeNumber, Licence: verbatim, At: at})
	require.True(t, ok)
	require.Equal(t, string(verbatim.Value), string(r.Value), "identity is the licence's grant, byte for byte (INV-22)")
	require.Nil(t, r.Number)

	expired := boost(1, effective.ModifierSet, dec("1"))
	until := at
	expired.Expires = &until
	revoked := boost(2, effective.ModifierSet, dec("2"))
	revoked.Status = "REVOKED"
	future := boost(3, effective.ModifierSet, dec("3"))
	future.Starts = at.Add(time.Second)
	r, _ = effective.Resolve(effective.Input{
		Type: effective.TypeNumber, Licence: verbatim,
		Boosts: []effective.Boost{expired, revoked, future}, At: at,
	})
	require.Zero(t, r.BoostGrantCount, "expired at the instant, revoked, not started yet")
	require.Equal(t, string(verbatim.Value), string(r.Value))

	_, ok = effective.Resolve(effective.Input{Type: effective.TypeNumber, Boosts: []effective.Boost{boost(1, effective.ModifierAdd, dec("1"))}, At: at})
	require.False(t, ok, "a boost never grants an entitlement")
}

func TestResolveBooleanAndConfig(t *testing.T) {
	at := t0.Add(time.Hour)
	off := &effective.LicenceGrant{Value: json.RawMessage(`{"type":"boolean","value":false}`), Pct: nil}
	on := effective.AddonGrant{ID: uuid.New(), AttachedAt: t0, Quantity: 1, Behavior: effective.BehaviorAdd, Value: json.RawMessage(`{"type":"boolean","value":true}`)}
	r, _ := effective.Resolve(effective.Input{
		Type: effective.TypeBoolean, Licence: off, Addons: []effective.AddonGrant{on},
		Boosts: []effective.Boost{boost(1, effective.ModifierUnlimited, nil)}, At: at,
	})
	require.JSONEq(t, `{"type":"boolean","value":true}`, string(r.Value))
	require.Nil(t, r.Pct)
	require.Zero(t, r.BoostGrantCount, "boosts do not apply to a BOOLEAN")

	basic := &effective.LicenceGrant{Value: json.RawMessage(`{"type":"object","value":{"tier":"basic"}}`)}
	pro := effective.AddonGrant{ID: uuid.New(), AttachedAt: t0, Quantity: 1, Behavior: effective.BehaviorAdd, Value: json.RawMessage(`{"type":"object","value":{"tier":"pro"}}`)}
	ent := effective.AddonGrant{ID: uuid.New(), AttachedAt: t0.Add(time.Minute), Quantity: 1, Behavior: effective.BehaviorAdd, Value: json.RawMessage(`{"type":"object","value":{"tier":"ent"}}`)}
	r, _ = effective.Resolve(effective.Input{Type: effective.TypeConfig, Licence: basic, Addons: []effective.AddonGrant{pro, ent}, At: at})
	require.JSONEq(t, `{"type":"object","value":{"tier":"ent"}}`, string(r.Value), "the latest attached")
}
