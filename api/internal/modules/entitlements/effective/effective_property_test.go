package effective_test

import (
	"math/rand/v2"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/effective"
)

// S03-046: properties of the composition, on the oracle alone (§7.2):
// monotonicity, absorption, order independence. 50,000 cases.
func TestResolveProperties(t *testing.T) {
	rng := rand.New(rand.NewPCG(46, 46)) //nolint:gosec // reproducible test data
	value := func() string {
		return decimal.NewFromInt(rng.Int64N(100000)).Shift(-rng.Int32N(4)).String()
	}
	behaviors := []string{effective.BehaviorAdd, effective.BehaviorOverride, effective.BehaviorMax}
	random := func() effective.Input {
		in := effective.Input{Type: effective.TypeNumber, Licence: licence(value(), int16(rng.IntN(201))), At: t0.Add(24 * time.Hour)} //nolint:gosec // bounded
		for range rng.IntN(5) {
			in.Addons = append(in.Addons, addon(rng.IntN(60), int32(1+rng.IntN(20)), behaviors[rng.IntN(3)], value(), nil)) //nolint:gosec // bounded
		}
		for range rng.IntN(4) {
			switch rng.IntN(3) {
			case 0:
				in.Boosts = append(in.Boosts, boost(rng.IntN(60), effective.ModifierSet, dec(value())))
			case 1:
				in.Boosts = append(in.Boosts, boost(rng.IntN(60), effective.ModifierAdd, dec(value())))
			default:
				in.Boosts = append(in.Boosts, boost(rng.IntN(60), effective.ModifierMultiply, dec([]string{"0.5", "1", "1.5", "2"}[rng.IntN(4)])))
			}
		}
		return in
	}
	resolve := func(in effective.Input) decimal.Decimal {
		r, ok := effective.Resolve(in)
		require.True(t, ok)
		return valueOf(t, r)
	}

	for i := range 50000 {
		in := random()
		before := resolve(in)
		switch i % 4 {
		case 0: // (a) an ADD add-on of a value >= 0 never lowers it
			more := in
			more.Addons = append(append([]effective.AddonGrant{}, in.Addons...), addon(rng.IntN(60), int32(1+rng.IntN(20)), effective.BehaviorAdd, value(), nil)) //nolint:gosec // bounded
			require.True(t, resolve(more).GreaterThanOrEqual(before), "case %d", i)
		case 1: // (b) an ADD boost, or a MULTIPLY >= 1, never lowers it
			more := in
			extra := boost(rng.IntN(60), effective.ModifierAdd, dec(value()))
			if rng.IntN(2) == 0 {
				extra = boost(rng.IntN(60), effective.ModifierMultiply, dec([]string{"1", "1.5", "2"}[rng.IntN(3)]))
			}
			more.Boosts = append(append([]effective.Boost{}, in.Boosts...), extra)
			require.True(t, resolve(more).GreaterThanOrEqual(before), "case %d", i)
		case 2: // (c) UNLIMITED absorbs everything, and its percent is -1
			unlimited := in
			if rng.IntN(2) == 0 {
				unlimited.Boosts = append(append([]effective.Boost{}, in.Boosts...), boost(rng.IntN(60), effective.ModifierUnlimited, nil))
			} else {
				unlimited.Addons = append(append([]effective.AddonGrant{}, in.Addons...), addon(rng.IntN(60), 1, behaviors[rng.IntN(3)], "-1", nil))
			}
			r, _ := effective.Resolve(unlimited)
			require.True(t, valueOf(t, r).Equal(decimal.NewFromInt(-1)), "case %d", i)
			require.Equal(t, int16(-1), *r.Pct, "case %d", i)
		default: // (d) the attachment order of ADD-only grants does not matter
			adds := effective.Input{Type: effective.TypeNumber, Licence: in.Licence, At: in.At}
			for range 1 + rng.IntN(5) {
				adds.Addons = append(adds.Addons, addon(rng.IntN(60), int32(1+rng.IntN(20)), effective.BehaviorAdd, value(), nil)) //nolint:gosec // bounded
			}
			want := resolve(adds)
			for j := range adds.Addons {
				adds.Addons[j].AttachedAt = t0.Add(time.Duration(rng.IntN(60)) * time.Minute)
				adds.Addons[j].ID = uuid.New()
			}
			require.True(t, resolve(adds).Equal(want), "case %d", i)
		}
	}
}
