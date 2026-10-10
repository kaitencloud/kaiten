package billing_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math/rand/v2"
	"os"
	"reflect"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	oracle "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/effective"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
)

// S03-044 (XC-06): the SQL view instance_effective_entitlement and its Go
// oracle, entitlements/effective, agree on random catalogues: the same rows,
// the same value (decimals compared as numbers), percent, grant counts and
// number provenance, for every (instance, entitlement, instant).
//
// Each seed builds a catalogue through the API -- entitlements of every
// type, a licence version granting some of them, add-on versions and
// ENTITLEMENT_BOOST vouchers granting others -- then attaches and redeems by
// SQL, so that attachment instants can coincide, some attachments are
// removed and some redemptions are revoked, expired, or outside their window.
// The oracle's inputs are read back from the rows stored, so both sides
// compose the same data.
//
// KAITEN_EFFECTIVE_SEEDS sets how many seeds run (20 by default, about 2,000
// comparisons); KAITEN_EFFECTIVE_SEED replays one. A mismatch names its seed.
func TestEffectiveViewEqualsTheOracle(t *testing.T) {
	seeds := 20
	if n, err := strconv.Atoi(os.Getenv("KAITEN_EFFECTIVE_SEEDS")); err == nil && n > 0 {
		seeds = n
	}
	first := uint64(time.Now().UnixNano())
	if s, err := strconv.ParseUint(os.Getenv("KAITEN_EFFECTIVE_SEED"), 10, 64); err == nil {
		first, seeds = s, 1
	}
	compared := 0
	for i := range seeds {
		seed := first + uint64(i)
		compared += differentialSeed(t, seed)
		if t.Failed() {
			t.Fatalf("the view and the oracle differ: replay with KAITEN_EFFECTIVE_SEED=%d", seed)
		}
	}
	t.Logf("%d (instance, entitlement, instant) rows compared over %d seeds from %d", compared, seeds, first)
}

type generated struct {
	rng      *rand.Rand
	numbers  []string
	booleans []string
	configs  []string
}

func (g *generated) pick(values []string) string { return values[g.rng.IntN(len(values))] }

// numberValue is a grant value: unlimited, zero, small, large, decimal.
func (g *generated) numberValue() string {
	switch g.rng.IntN(8) {
	case 0:
		return "-1"
	case 1:
		return "0"
	case 2:
		return "0.5"
	case 3:
		return "1"
	case 4:
		return "1000"
	case 5:
		return "1000000000000"
	default:
		return decimal.NewFromInt(g.rng.Int64N(10_000_000)).Shift(-g.rng.Int32N(7)).String()
	}
}

// pct is an overage percent coupled with its value: -1 for unlimited.
func (g *generated) pct(value string) int {
	if value == "-1" {
		return -1
	}
	return g.rng.IntN(201)
}

func differentialSeed(t *testing.T, seed uint64) int {
	t.Helper()
	require.NoError(t, testDb.Reset())
	// A seeded generator on purpose: a seed replays its catalogue.
	g := &generated{rng: rand.New(rand.NewPCG(seed, seed^0x9e3779b97f4a7c15))} //nolint:gosec // reproducible test data, not a secret
	tag := strconv.FormatUint(seed%1_000_000, 36)

	// Entitlements of every type.
	for i := range 2 + g.rng.IntN(3) {
		slug := fmt.Sprintf("n%d-%s", i, tag)
		newEntitlement(t, slug, 0)
		g.numbers = append(g.numbers, slug)
	}
	slug := "ai-" + tag
	created(t, "POST", "/api/entitlements", map[string]any{
		"name": slug, "slug": slug, "description": slug, "type": "NUMBER_AI_CREDIT", "aggregationMethod": "SUM", "resetPeriod": "MONTH",
	})
	g.numbers = append(g.numbers, slug)
	for i := range 2 {
		slug := fmt.Sprintf("b%d-%s", i, tag)
		created(t, "POST", "/api/entitlements", map[string]any{"name": slug, "slug": slug, "description": slug, "type": "BOOLEAN"})
		g.booleans = append(g.booleans, slug)
		slug = fmt.Sprintf("c%d-%s", i, tag)
		created(t, "POST", "/api/entitlements", map[string]any{"name": slug, "slug": slug, "description": slug, "type": "CONFIG"})
		g.configs = append(g.configs, slug)
	}

	// A licence version granting some of them.
	version := newVersion(t, "Pro "+tag, licenseschema.Published)
	for _, e := range g.numbers {
		if g.rng.IntN(4) == 0 {
			continue
		}
		value := g.numberValue()
		created(t, "POST", "/api/licenses/"+version.Slug+"/entitlements", map[string]any{
			"entitlementSlug": e, "value": map[string]any{"type": "number", "value": json.Number(value)},
			"limitCapExceededOveragePercent": g.pct(value),
		})
	}
	for _, e := range g.booleans {
		if g.rng.IntN(2) == 0 {
			created(t, "POST", "/api/licenses/"+version.Slug+"/entitlements", map[string]any{
				"entitlementSlug": e, "value": map[string]any{"type": "boolean", "value": g.rng.IntN(2) == 0},
			})
		}
	}
	for _, e := range g.configs {
		if g.rng.IntN(2) == 0 {
			created(t, "POST", "/api/licenses/"+version.Slug+"/entitlements", map[string]any{
				"entitlementSlug": e, "value": map[string]any{"type": "object", "value": map[string]any{"tier": "basic"}},
			})
		}
	}

	// Add-on versions, each in its own family, with grants.
	var addons []uuid.UUID
	for i := range 1 + g.rng.IntN(6) {
		addon := newAddon(t, map[string]any{"name": fmt.Sprintf("A%d", i), "slug": fmt.Sprintf("a%d-%s", i, tag), "pricingType": "FREE"})
		addons = append(addons, addon.ID)
		for _, e := range g.numbers {
			if g.rng.IntN(3) != 0 {
				continue
			}
			value := g.numberValue()
			grant := map[string]any{
				"entitlementSlug": e, "value": map[string]any{"type": "number", "value": json.Number(value)},
				"overrideBehavior": []string{"ADD", "OVERRIDE", "MAX"}[g.rng.IntN(3)],
			}
			if g.rng.IntN(2) == 0 {
				grant["limitCapExceededOveragePercent"] = g.pct(value)
			}
			created(t, "POST", "/api/addons/"+addon.Slug+"/entitlements", grant)
		}
		if g.rng.IntN(3) == 0 {
			created(t, "POST", "/api/addons/"+addon.Slug+"/entitlements", map[string]any{
				"entitlementSlug": g.pick(g.booleans), "value": map[string]any{"type": "boolean", "value": g.rng.IntN(2) == 0},
				"overrideBehavior": "ADD",
			})
		}
		if g.rng.IntN(3) == 0 {
			created(t, "POST", "/api/addons/"+addon.Slug+"/entitlements", map[string]any{
				"entitlementSlug": g.pick(g.configs), "value": map[string]any{"type": "object", "value": map[string]any{"tier": fmt.Sprintf("t%d", i)}},
				"overrideBehavior": "ADD",
			})
		}
	}

	// ENTITLEMENT_BOOST vouchers on the numbers.
	var vouchers []uuid.UUID
	for i := range g.rng.IntN(7) {
		var grants []map[string]any
		for _, e := range g.numbers {
			if g.rng.IntN(2) != 0 {
				continue
			}
			modifier := []string{"SET", "ADD", "MULTIPLY", "UNLIMITED"}[g.rng.IntN(4)]
			grant := map[string]any{"entitlementSlug": e, "modifierType": modifier}
			switch modifier {
			case "SET":
				grant["modifierValue"] = strconv.Itoa(g.rng.IntN(10000))
			case "ADD":
				grant["modifierValue"] = strconv.Itoa(1 + g.rng.IntN(1000))
			case "MULTIPLY":
				grant["modifierValue"] = []string{"0.5", "1.5", "2", "3"}[g.rng.IntN(4)]
			}
			grants = append(grants, grant)
		}
		if len(grants) == 0 {
			continue
		}
		voucher := newVoucher(t, map[string]any{"name": fmt.Sprintf("B%d", i), "voucherType": "ENTITLEMENT_BOOST", "grants": grants})
		publish(t, voucher)
		vouchers = append(vouchers, voucher.ID)
	}

	// Instances, attachments and redemptions, at instants around three
	// evaluation instants.
	base := time.Date(2027, 3, 1, 0, 0, 0, 0, time.UTC)
	instants := []time.Time{base, base.Add(36 * time.Hour), base.Add(72 * time.Hour)}
	around := func() time.Time { return base.Add(time.Duration(g.rng.IntN(96)-12) * time.Hour) }
	var user uuid.UUID
	require.NoError(t, testDb.DbPool.QueryRow(t.Context(), `SELECT created_by_id FROM addon LIMIT 1`).Scan(&user))
	customer := newCustomer(t, "cust-"+tag)
	var instances []uuid.UUID
	for i := range 1 + g.rng.IntN(4) {
		instance := newInstance(t, fmt.Sprintf("I%d %s", i, tag), customer.ID, version.ID)
		instances = append(instances, instance.ID)
		shared := around()
		for _, addon := range addons {
			if g.rng.IntN(3) == 0 {
				continue
			}
			at := around()
			if g.rng.IntN(4) == 0 {
				at = shared // a tie, broken by id
			}
			if g.rng.IntN(4) == 0 { // a removed attachment before the active one
				exec(t, `INSERT INTO instance_addon (organization_id, instance_id, addon_id, addon_family_id, quantity, created_at, removed_at, removed_by_id, created_by_id, updated_by_id)
				         SELECT organization_id, $1, id, family_id, $2, $3, $4, $5, $5, $5 FROM addon WHERE id = $6`,
					instance.ID, 1+g.rng.IntN(100), at.Add(-48*time.Hour), at.Add(-24*time.Hour), user, addon)
			}
			exec(t, `INSERT INTO instance_addon (organization_id, instance_id, addon_id, addon_family_id, quantity, created_at, created_by_id, updated_by_id)
			         SELECT organization_id, $1, id, family_id, $2, $3, $4, $4 FROM addon WHERE id = $5`,
				instance.ID, 1+g.rng.IntN(100), at, user, addon)
		}
		for _, voucher := range vouchers {
			if g.rng.IntN(2) == 0 {
				continue
			}
			redeemed := around()
			starts := redeemed
			var expires *time.Time
			if g.rng.IntN(2) == 0 {
				e := starts.Add(time.Duration(1+g.rng.IntN(72)) * time.Hour)
				expires = &e
			}
			status := []string{"ACTIVE", "ACTIVE", "ACTIVE", "REVOKED", "EXPIRED"}[g.rng.IntN(5)]
			var revokedAt, expiredAt *time.Time
			var reason *string
			switch status {
			case "REVOKED":
				r, why := redeemed.Add(time.Hour), "test"
				revokedAt, reason = &r, &why
			case "EXPIRED":
				e := redeemed.Add(time.Hour)
				expiredAt = &e
			}
			exec(t, `INSERT INTO instance_voucher (organization_id, instance_id, voucher_id, redeemed_at, redeemed_by_id, effective_starts_at,
			           effective_expires_at, status, expired_at, revoked_at, revoked_by_id, revoked_reason)
			         SELECT organization_id, $1, id, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $8::timestamp IS NULL THEN NULL ELSE $3::uuid END, $9
			           FROM voucher WHERE id = $10`,
				instance.ID, redeemed, user, starts, expires, status, expiredAt, revokedAt, reason, voucher)
		}
	}

	compared := 0
	for _, at := range instants {
		view := viewRows(t, at)
		resolved := oracleRows(t, instances, at)
		require.Equal(t, rowKeys(resolved), rowKeys(view), "seed %d at %s: the same rows", seed, at)
		for key, want := range resolved {
			got := view[key]
			describe := fmt.Sprintf("seed %d at %s, instance %s, entitlement %s (%s)\noracle input: %s", seed, at, key.instance, key.entitlement, got.typ, want.input)
			sameValue(t, got.typ, want.result.Value, got.value, describe)
			require.Equal(t, ptrString(want.result.Pct), ptrString(got.pct), "percent: %s", describe)
			require.Equal(t, want.result.AddonGrantCount, got.addons, "add-on grants: %s", describe)
			require.Equal(t, want.result.BoostGrantCount, got.boosts, "boosts: %s", describe)
			sameNumber(t, want.result.Number, got.number, describe)
			compared++
		}
	}
	return compared
}

type rowKey struct{ instance, entitlement uuid.UUID }

type viewRow struct {
	typ    string
	value  json.RawMessage
	pct    *int16
	addons int
	boosts int
	number map[string]any
}

func viewRows(t *testing.T, at time.Time) map[rowKey]viewRow {
	t.Helper()
	tx, err := testDb.DbPool.Begin(t.Context())
	require.NoError(t, err)
	defer func() { _ = tx.Rollback(t.Context()) }()
	_, err = tx.Exec(t.Context(), `SELECT set_config('kaiten.entitlement_effective_at', $1, true)`, at.Format("2006-01-02 15:04:05.000"))
	require.NoError(t, err)
	rows, err := tx.Query(t.Context(), `SELECT instance_id, entitlement_id, entitlement_type::text, value, limit_cap_exceeded_overage_percent,
	                                           addon_grant_count, boost_grant_count, provenance->'number'
	                                      FROM instance_effective_entitlement`)
	require.NoError(t, err)
	out := map[rowKey]viewRow{}
	for rows.Next() {
		var key rowKey
		var row viewRow
		var addons, boosts int64
		var number []byte
		require.NoError(t, rows.Scan(&key.instance, &key.entitlement, &row.typ, &row.value, &row.pct, &addons, &boosts, &number))
		row.addons, row.boosts = int(addons), int(boosts)
		if len(number) > 0 && string(number) != "null" {
			// json.Number: a float64 would round 24000000371709.112.
			decoder := json.NewDecoder(bytes.NewReader(number))
			decoder.UseNumber()
			require.NoError(t, decoder.Decode(&row.number))
		}
		out[key] = row
	}
	require.NoError(t, rows.Err())
	return out
}

type oracleRow struct {
	result oracle.Result
	input  string
}

// oracleRows reads every grant stored and resolves each (instance,
// entitlement) with the oracle.
func oracleRows(t *testing.T, instances []uuid.UUID, at time.Time) map[rowKey]oracleRow {
	t.Helper()
	ctx := t.Context()
	types := map[uuid.UUID]string{}
	rows, err := testDb.DbPool.Query(ctx, `SELECT id, type::text FROM entitlement`)
	require.NoError(t, err)
	for rows.Next() {
		var id uuid.UUID
		var typ string
		require.NoError(t, rows.Scan(&id, &typ))
		types[id] = typ
	}
	require.NoError(t, rows.Err())

	out := map[rowKey]oracleRow{}
	for _, instance := range instances {
		inputs := map[uuid.UUID]*oracle.Input{}
		input := func(entitlement uuid.UUID) *oracle.Input {
			if in, ok := inputs[entitlement]; ok {
				return in
			}
			in := &oracle.Input{Type: types[entitlement], Licence: nil, Addons: nil, Boosts: nil, At: at}
			inputs[entitlement] = in
			return in
		}
		licence, err := testDb.DbPool.Query(ctx, `SELECT le.entitlement_id, le.value, le.limit_cap_exceeded_overage_percent
		                                            FROM license_entitlement le JOIN instance i ON i.license_id = le.license_id
		                                           WHERE i.id = $1`, instance)
		require.NoError(t, err)
		for licence.Next() {
			var entitlement uuid.UUID
			grant := &oracle.LicenceGrant{}
			require.NoError(t, licence.Scan(&entitlement, &grant.Value, &grant.Pct))
			input(entitlement).Licence = grant
		}
		require.NoError(t, licence.Err())

		attached, err := testDb.DbPool.Query(ctx, `SELECT ae.entitlement_id, ia.id, ia.created_at, ia.quantity, ae.override_behavior::text,
		                                                  ae.value, ae.limit_cap_exceeded_overage_percent
		                                             FROM instance_addon ia JOIN addon_entitlement ae ON ae.addon_id = ia.addon_id
		                                            WHERE ia.instance_id = $1 AND ia.removed_at IS NULL`, instance)
		require.NoError(t, err)
		for attached.Next() {
			var entitlement uuid.UUID
			var grant oracle.AddonGrant
			var createdAt pgtype.Timestamp
			require.NoError(t, attached.Scan(&entitlement, &grant.ID, &createdAt, &grant.Quantity, &grant.Behavior, &grant.Value, &grant.Pct))
			grant.AttachedAt = createdAt.Time.UTC()
			in := input(entitlement)
			in.Addons = append(in.Addons, grant)
		}
		require.NoError(t, attached.Err())

		boosts, err := testDb.DbPool.Query(ctx, `SELECT veg.entitlement_id, iv.id, iv.redeemed_at, veg.modifier_type::text, veg.modifier_value::text,
		                                                iv.status::text, iv.effective_starts_at, iv.effective_expires_at
		                                           FROM instance_voucher iv JOIN voucher_entitlement_grant veg ON veg.voucher_id = iv.voucher_id
		                                          WHERE iv.instance_id = $1`, instance)
		require.NoError(t, err)
		for boosts.Next() {
			var entitlement uuid.UUID
			var b oracle.Boost
			var redeemed, starts, expires pgtype.Timestamp
			var value *string
			require.NoError(t, boosts.Scan(&entitlement, &b.ID, &redeemed, &b.Modifier, &value, &b.Status, &starts, &expires))
			b.RedeemedAt, b.Starts = redeemed.Time.UTC(), starts.Time.UTC()
			if expires.Valid {
				e := expires.Time.UTC()
				b.Expires = &e
			}
			if value != nil {
				v := decimal.RequireFromString(*value)
				b.Value = &v
			}
			if in, ok := inputs[entitlement]; ok {
				in.Boosts = append(in.Boosts, b)
			} else {
				// A boost alone never grants: kept to show the oracle drops it.
				in := input(entitlement)
				in.Boosts = append(in.Boosts, b)
			}
		}
		require.NoError(t, boosts.Err())

		for entitlement, in := range inputs {
			result, ok := oracle.Resolve(*in)
			if !ok {
				continue
			}
			described, _ := json.Marshal(in)
			out[rowKey{instance: instance, entitlement: entitlement}] = oracleRow{result: result, input: string(described)}
		}
	}
	return out
}

func rowKeys[V any](m map[rowKey]V) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k.instance.String()+"/"+k.entitlement.String())
	}
	slices.Sort(out)
	return out
}

func ptrString(p *int16) string {
	if p == nil {
		return "null"
	}
	return strconv.Itoa(int(*p))
}

// sameValue compares two entitlement values: numbers as decimals, anything
// else as JSON.
func sameValue(t *testing.T, typ string, want, got json.RawMessage, describe string) {
	t.Helper()
	if typ == oracle.TypeNumber || typ == oracle.TypeNumberAICredit {
		require.True(t, numberOf(t, want).Equal(numberOf(t, got)), "value %s, oracle %s: %s", got, want, describe)
		return
	}
	var w, g any
	require.NoError(t, json.Unmarshal(want, &w))
	require.NoError(t, json.Unmarshal(got, &g))
	require.True(t, reflect.DeepEqual(w, g), "value %s, oracle %s: %s", got, want, describe)
}

func numberOf(t *testing.T, raw json.RawMessage) decimal.Decimal {
	t.Helper()
	var v struct {
		Value json.Number `json:"value"`
	}
	require.NoError(t, json.Unmarshal(raw, &v), string(raw))
	return decimal.RequireFromString(v.Value.String())
}

// sameNumber compares the view's provenance.number with the oracle's.
func sameNumber(t *testing.T, want *oracle.Number, got map[string]any, describe string) {
	t.Helper()
	if want == nil {
		require.Nil(t, got, "provenance.number: %s", describe)
		return
	}
	require.NotNil(t, got, "provenance.number: %s", describe)
	dec := func(name string, w *decimal.Decimal) {
		t.Helper()
		raw, present := got[name]
		if w == nil {
			require.True(t, !present || raw == nil, "%s: view %v, oracle null: %s", name, raw, describe)
			return
		}
		require.True(t, decimal.RequireFromString(fmt.Sprint(raw)).Equal(*w), "%s: view %v, oracle %s: %s", name, raw, w, describe)
	}
	dec("license", want.License)
	after, effectiveValue := want.AfterAddons, want.Effective
	dec("after_addons", &after)
	dec("boost_set", want.BoostSet)
	dec("boost_add", want.BoostAdd)
	dec("boost_multiply", want.BoostMultiply)
	dec("effective", &effectiveValue)
	require.Equal(t, want.Unlimited, got["unlimited"], "unlimited: %s", describe)
}

func created(t *testing.T, method, path string, body any) {
	t.Helper()
	resp := call(t, method, path, body)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode >= 300 {
		raw := make([]byte, 512)
		n, _ := resp.Body.Read(raw)
		require.Failf(t, "setup refused", "%s %s: %d %s", method, path, resp.StatusCode, strings.TrimSpace(string(raw[:n])))
	}
}
