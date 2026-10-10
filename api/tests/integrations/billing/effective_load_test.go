//go:build load

package billing_test

import (
	"encoding/json"
	"math/rand/v2"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
)

// S03-042 (XC-06): the usage gate's lookup of instance_effective_entitlement
// uses index scans only, and answers in 5 ms at p99 (§7.4 rule 3), on the
// stress dataset: 10,000 instances, 200 entitlements, 20 active add-on
// attachments and 10 active boost redemptions per instance.
//
// Nightly, behind the load build tag: go test -tags load -run
// TestEffectiveViewLoad ./tests/integrations/billing/. The dataset is cloned
// in SQL from rows the API created (jsonb_populate_record keeps every other
// column as the API wrote it), so it stays valid as the schema moves.
func TestEffectiveViewLoad(t *testing.T) {
	const (
		entitlements = 200
		instances    = 10_000
		families     = 40
		attachments  = 20
		vouchers     = 30
		redemptions  = 10
		grantsPerAdd = 10
		lookups      = 1_000
	)
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	started := time.Now()

	// Templates through the API.
	first := newEntitlement(t, "load-0", 0)
	version := newVersion(t, "Load", licenseschema.Published)
	grant(t, version.Slug, "load-0", 10000, 50)
	addon := newAddon(t, map[string]any{"name": "L0", "slug": "load-addon-0", "pricingType": "FREE"})
	addonGrant(t, addon.Slug, "load-0", 100, "ADD")
	voucher := newVoucher(t, map[string]any{
		"name": "LB0", "voucherType": "ENTITLEMENT_BOOST",
		"grants": []map[string]any{{"entitlementSlug": "load-0", "modifierType": "ADD", "modifierValue": "10"}},
	})
	publish(t, voucher)
	customer := newCustomer(t, "load")
	instance := newInstance(t, "Load 0", customer.ID, version.ID)

	// Clones, in SQL.
	exec(t, `INSERT INTO entitlement
	         SELECT (jsonb_populate_record(e, jsonb_build_object('id', gen_random_uuid(), 'slug', 'load-' || g, 'name', 'load-' || g))).*
	           FROM entitlement e, generate_series(1, $2::int - 1) g WHERE e.id = $1`, first, entitlements)
	exec(t, `INSERT INTO license_entitlement
	         SELECT (jsonb_populate_record(le, jsonb_build_object('id', gen_random_uuid(), 'entitlement_id', e.id))).*
	           FROM license_entitlement le, entitlement e
	          WHERE le.license_id = $1 AND le.entitlement_id = $2 AND e.slug LIKE 'load-%' AND e.id <> $2`, version.ID, first)
	exec(t, `INSERT INTO addon_family
	         SELECT (jsonb_populate_record(f, jsonb_build_object('id', gen_random_uuid(), 'slug', 'load-family-' || g))).*
	           FROM addon_family f, generate_series(1, $2::int - 1) g
	          WHERE f.id = (SELECT family_id FROM addon WHERE id = $1)`, addon.ID, families)
	exec(t, `INSERT INTO addon
	         SELECT (jsonb_populate_record(a, jsonb_build_object('id', gen_random_uuid(), 'family_id', f.id, 'slug', f.slug || '-v1'))).*
	           FROM addon a, addon_family f
	          WHERE a.id = $1 AND f.slug LIKE 'load-family-%'`, addon.ID)
	exec(t, `INSERT INTO addon_entitlement
	         SELECT (jsonb_populate_record(ae, jsonb_build_object('id', gen_random_uuid(), 'addon_id', a.id, 'entitlement_id', e.id))).*
	           FROM addon_entitlement ae, addon a,
	                LATERAL (SELECT id FROM entitlement WHERE slug LIKE 'load-%' ORDER BY md5(a.id::text || id::text) LIMIT $2) e
	          WHERE ae.addon_id = $1 AND a.id <> $1
	            AND NOT EXISTS (SELECT 1 FROM addon_entitlement x WHERE x.addon_id = a.id AND x.entitlement_id = e.id)`, addon.ID, grantsPerAdd)
	// Vouchers through the API: code_normalized is a generated column, which
	// a clone cannot write. Three grants each.
	for i := 1; i < vouchers; i++ {
		var grants []map[string]any
		for j := range 3 {
			grants = append(grants, map[string]any{"entitlementSlug": "load-" + strconv.Itoa((i*7+j*31)%entitlements), "modifierType": "ADD", "modifierValue": "10"})
		}
		publish(t, newVoucher(t, map[string]any{"name": "LB" + strconv.Itoa(i), "voucherType": "ENTITLEMENT_BOOST", "grants": grants}))
	}
	exec(t, `INSERT INTO instance
	         SELECT (jsonb_populate_record(i, jsonb_build_object('id', gen_random_uuid(), 'slug', 'load-' || g, 'name', 'Load ' || g))).*
	           FROM instance i, generate_series(1, $2::int - 1) g WHERE i.id = $1`, instance.ID, instances)
	var user uuid.UUID
	require.NoError(t, testDb.DbPool.QueryRow(t.Context(), `SELECT created_by_id FROM addon WHERE id = $1`, addon.ID).Scan(&user))
	exec(t, `INSERT INTO instance_addon (organization_id, instance_id, addon_id, addon_family_id, quantity, created_by_id, updated_by_id)
	         SELECT i.organization_id, i.id, a.id, a.family_id, 1 + (abs(hashtext(i.id::text || a.id::text)) % 5), $2, $2
	           FROM instance i
	           CROSS JOIN LATERAL (SELECT id, family_id FROM addon WHERE organization_id = i.organization_id
	                                ORDER BY md5(i.id::text || id::text) LIMIT $1) a
	          WHERE i.customer_id = $3`, attachments, user, customer.ID)
	exec(t, `INSERT INTO instance_voucher (organization_id, instance_id, voucher_id, redeemed_at, redeemed_by_id, effective_starts_at)
	         SELECT i.organization_id, i.id, v.id, now() - interval '1 day', $2, now() - interval '1 day'
	           FROM instance i
	           CROSS JOIN LATERAL (SELECT id FROM voucher WHERE organization_id = i.organization_id AND voucher_type = 'ENTITLEMENT_BOOST'
	                                ORDER BY md5(i.id::text || id::text) LIMIT $1) v
	          WHERE i.customer_id = $3`, redemptions, user, customer.ID)
	exec(t, `ANALYZE`)
	t.Logf("dataset built in %s", time.Since(started))

	var counts [4]int64
	require.NoError(t, testDb.DbPool.QueryRow(t.Context(), `SELECT (SELECT count(*) FROM instance), (SELECT count(*) FROM entitlement),
	         (SELECT count(*) FROM instance_addon), (SELECT count(*) FROM instance_voucher)`).Scan(&counts[0], &counts[1], &counts[2], &counts[3]))
	t.Logf("instances %d, entitlements %d, attachments %d, redemptions %d", counts[0], counts[1], counts[2], counts[3])
	require.GreaterOrEqual(t, counts[0], int64(instances))
	require.GreaterOrEqual(t, counts[2], int64(instances*attachments))

	// Random (instance, entitlement) pairs.
	var pairs [][2]uuid.UUID
	rows, err := testDb.DbPool.Query(t.Context(), `SELECT i.id, e.id FROM instance i, entitlement e
	                                                 WHERE e.slug LIKE 'load-%' ORDER BY random() LIMIT $1`, lookups)
	require.NoError(t, err)
	for rows.Next() {
		var pair [2]uuid.UUID
		require.NoError(t, rows.Scan(&pair[0], &pair[1]))
		pairs = append(pairs, pair)
	}
	require.NoError(t, rows.Err())
	const lookup = `SELECT * FROM instance_effective_entitlement WHERE instance_id = $1 AND entitlement_id = $2`

	// The plan: index scans on the five tables the view reads.
	var plan []byte
	require.NoError(t, testDb.DbPool.QueryRow(t.Context(), `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) `+lookup, pairs[0][0], pairs[0][1]).Scan(&plan))
	nodes := planNodes(t, plan)
	// The per-instance tables are never scanned; a catalogue table is, by
	// the planner's own choice, only while it is too small for an index to
	// pay (a few dozen vouchers' grants).
	for _, relation := range []string{"instance_addon", "addon_entitlement", "instance_voucher", "voucher_entitlement_grant", "license_entitlement"} {
		var rows float64
		require.NoError(t, testDb.DbPool.QueryRow(t.Context(), `SELECT reltuples FROM pg_class WHERE relname = $1`, relation).Scan(&rows))
		for _, node := range nodes {
			if node.Type == "Seq Scan" && node.Relation == relation {
				require.Less(t, rows, 1000.0, "a sequential scan of %s, %v rows:\n%s", relation, rows, plan)
				t.Logf("a sequential scan of %s, %v rows: the planner's choice for so small a table", relation, rows)
			}
		}
	}
	var indexes []string
	for _, node := range nodes {
		if node.Index != "" {
			indexes = append(indexes, node.Index)
		}
	}
	t.Logf("indexes used: %s", strings.Join(indexes, ", "))

	// The latency: p99 of the lookups, each in its own round trip as the
	// gate makes it.
	rng := rand.New(rand.NewPCG(42, 42)) //nolint:gosec // a reproducible order
	rng.Shuffle(len(pairs), func(i, j int) { pairs[i], pairs[j] = pairs[j], pairs[i] })
	durations := make([]time.Duration, 0, len(pairs))
	for _, pair := range pairs {
		begin := time.Now()
		rows, err := testDb.DbPool.Query(t.Context(), lookup, pair[0], pair[1])
		require.NoError(t, err)
		for rows.Next() {
		}
		require.NoError(t, rows.Err())
		durations = append(durations, time.Since(begin))
	}
	slices.Sort(durations)
	p50, p99 := durations[len(durations)/2], durations[len(durations)*99/100]
	t.Logf("lookup p50 %s, p99 %s over %d lookups", p50, p99, len(durations))
	require.LessOrEqual(t, p99, 5*time.Millisecond, "§7.4 rule 3: p99 ≤ 5 ms")
}

type planNode struct {
	Type     string `json:"Node Type"`
	Relation string `json:"Relation Name"`
	Index    string `json:"Index Name"`
	Plans    []planNode
}

func planNodes(t *testing.T, raw []byte) []planNode {
	t.Helper()
	var plans []struct {
		Plan planNode `json:"Plan"`
	}
	require.NoError(t, json.Unmarshal(raw, &plans))
	var out []planNode
	var walk func(planNode)
	walk = func(n planNode) {
		out = append(out, n)
		for _, child := range n.Plans {
			walk(child)
		}
	}
	for _, p := range plans {
		walk(p.Plan)
	}
	return out
}
