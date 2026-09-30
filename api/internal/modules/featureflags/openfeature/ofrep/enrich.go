package ofrep

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/featureflag"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/openfeature"
	customertargetingfacts "github.com/kaitencloud/kaiten/api/internal/modules/customers/targetingfacts"
	deploymentzonetargetingfacts "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/targetingfacts"
	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	instancetargetingfacts "github.com/kaitencloud/kaiten/api/internal/modules/instances/targetingfacts"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	"github.com/kaitencloud/kaiten/api/pkg/dogfoodingctx"
)

// Two namespaces, split by trust level.
const (
	// KaitenInput aliases pkg/dogfoodingctx.KaitenInputKey -- kept here too
	// since this is the name existing callers in this package use, and
	// because this is also where the doc comment above explains its role
	// among the other three OFREP-context conventions.
	KaitenInput          = dogfoodingctx.KaitenInputKey
	KaitenFactsNamespace = featureflag.FactsRoot
)

// The keys the server owns within KaitenFactsNamespace. A rule may read
// them; nothing a caller sends can set them. The names, and the shape written
// under each, are declared once in infrastructure/featureflag — the targeting
// lint reads the same declarations, which is what keeps "what a rule may
// write" and "what the server produces" from drifting apart.
const (
	// LicenseInput carries a featureflag.LicenseFact:
	// `__kaiten.license.familySlug == 'scale'` for a product, and
	// `__kaiten.license.slug == 'scale-v2'` for one of its versions.
	LicenseInput = featureflag.LicenseRoot
	// EntitlementsInput maps each entitlement slug to a
	// featureflag.EntitlementFact:
	// `__kaiten.entitlements['seats'].percentage > 0.8`. Slugs contain
	// hyphens, so index notation is required for most of them.
	EntitlementsInput = featureflag.EntitlementsRoot
	// InstanceInput carries the calling instance's own registry facts, a
	// featureflag.InstanceFact:
	// `__kaiten.instance.metadata.demo == true`.
	InstanceInput = featureflag.InstanceRoot
	// CustomerInput carries the instance's owning customer, a
	// featureflag.CustomerFact.
	CustomerInput = featureflag.CustomerRoot
	// DeploymentZoneInput carries the instance's deployment zone (absent if
	// the instance has none), a featureflag.DeploymentZoneFact.
	DeploymentZoneInput = featureflag.DeploymentZoneRoot
)

// ResetKaitenFacts clears any caller-supplied "__kaiten" object from the
// evaluation context and installs a fresh, empty one. Call this once, before
// any Enrich* function — every one of them assumes the facts namespace is
// already theirs and only manages its own keys within it. Without this
// reset, a caller putting "__kaiten": {...} in its own request body would
// have that object reused (not replaced) as the base map, and any key we
// don't explicitly manage inside it would survive untouched.
func ResetKaitenFacts(ec *openfeature.EvaluationContext) {
	if ec.Inputs == nil {
		ec.Inputs = make(map[string]any, 1)
	}
	delete(ec.Inputs, dogfoodingctx.InternalEvaluationContextKey)
	ec.Inputs[KaitenFactsNamespace] = make(map[string]any, 5)
}

// kaitenFacts returns the facts namespace, assuming ResetKaitenFacts already
// ran on this context.
func kaitenFacts(ec *openfeature.EvaluationContext) map[string]any {
	ns, _ := ec.Inputs[KaitenFactsNamespace].(map[string]any)
	return ns
}

// kaitenInput reads the caller-supplied kaiten.* object. Untrusted by
// construction — used only to decide what to look up, never as a fact.
func kaitenInput(ec *openfeature.EvaluationContext) map[string]any {
	m, _ := ec.Inputs[KaitenInput].(map[string]any)
	return m
}

// EnrichWithServerFacts resolves the caller's licence and entitlement state from
// its targeting key and writes them into the evaluation context.
//
// The server namespace is cleared FIRST, unconditionally, and only this function
// ever repopulates it. That ordering is the whole guarantee: `ToEvaluationContext`
// copies the request body verbatim into Inputs, so a client that puts
// `"__kaiten": {"license": {"slug": "scale"}}` in its body arrives holding the key
// we are about to judge it on. Clearing only on the success path would leave the
// claim standing on exactly the paths that do not resolve — and a targeting key
// that is not a customer slug is documented below as normal, not exceptional. The
// gate would then believe the claim precisely where it has nothing to check it
// against.
//
// With the keys gone, a failure to resolve leaves a rule reading
// `__kaiten.license.slug` unmatched, and the flag falls through to its default
// variant — the safe direction for a gate.
func EnrichWithServerFacts(
	ctx context.Context,
	reader customertargetingfacts.Port,
	orgID uuid.UUID,
	ec *openfeature.EvaluationContext,
) {
	facts := kaitenFacts(ec)
	// Safe on a nil map, so this precedes the nil check below.
	delete(facts, LicenseInput)
	delete(facts, EntitlementsInput)

	if ec.TargetingKey == "" || reader == nil {
		return
	}

	rows, err := reader.GetTargetingFactsByCustomerSlug(ctx, orgID, ec.TargetingKey)
	if err != nil || len(rows) == 0 {
		// Not every targeting key is a customer slug — a host may target a user
		// or a device. Nothing to enrich is normal, not an error.
		slog.DebugContext(ctx, "ofrep: no targeting facts for key",
			"targeting_key", ec.TargetingKey, "error", err)
		return
	}

	// Every row describes the same instance — the query scopes to one — so the
	// licence read off the first row is the licence the usage below was measured
	// against. Taking them from different rows is what made a customer with two
	// instances report a plan and a consumption that never coexisted.
	facts[LicenseInput] = toFactMap(featureflag.LicenseFact{
		Slug:       rows[0].LicenseSlug,
		FamilySlug: rows[0].LicenseFamilySlug,
		Type:       rows[0].LicenseType,
	})
	facts[EntitlementsInput] = entitlementFacts(rows)
}

// entitlementFacts shapes one entitlement per key, with the numbers a rule wants
// to compare: what was granted, what has been consumed, and how full that is.
//
// `percentage` is the reason this exists. A rule can already be written against
// a limit, but "who is about to run out" is the question a plan-aware feature
// gate is actually asked, and computing it in CEL from two other fields would
// put a division — and the unlimited sentinel — in every rule.
func entitlementFacts(rows []customertargetingfacts.TargetingFact) map[string]any {
	facts := make(map[string]any, len(rows))

	for _, row := range rows {
		if row.EntitlementSlug == nil {
			continue
		}

		limit, hasLimit := numberOf(row.LimitValue)
		used, _ := numberOf(row.UsageValue)
		unlimited := hasLimit && entitlementvalue.IsUnlimitedThreshold(limit)

		fact := featureflag.EntitlementFact{Used: used, Unlimited: unlimited}

		switch {
		case unlimited:
			// No ceiling to be near, so the ceiling reported is one no usage
			// reaches: `remaining < 5` catches a customer running out, and a 0
			// here would match for exactly the customers who cannot. Nothing is
			// consumed of an infinite pool, so percentage stays 0. See
			// featureflag.UnlimitedQuantity for why a number and not an omission.
			fact.Limit, fact.Remaining = featureflag.UnlimitedQuantity, featureflag.UnlimitedQuantity
		case !hasLimit:
			// Not a numeric entitlement — both parsers require a "number"
			// value, so this is a boolean or object grant, which has no
			// quantity at all. The three stay 0: an entitlement with no number
			// is not an entitlement with no ceiling, and giving it the
			// unlimited sentinel would say the latter.
		default:
			fact.Limit = limit
			fact.Remaining = max(limit-used, 0)
			if limit > 0 {
				fact.Percentage = used / limit
			}
		}

		facts[*row.EntitlementSlug] = toFactMap(fact)
	}

	return facts
}

// numberOf reads a stored entitlement value, whichever of the two shapes it is:
// a licence threshold or a recorded usage. Anything else contributes nothing.
func numberOf(raw []byte) (float64, bool) {
	if len(raw) == 0 {
		return 0, false
	}

	if threshold, err := entitlementvalue.ParseNumberThreshold(raw); err == nil {
		return threshold, true
	}
	if usage, err := entitlementvalue.ParseNumberUsageValue(raw); err == nil {
		return usage.Value, true
	}

	return 0, false
}

// instanceRow is the shared shape instancetargetingfacts.Instance carries,
// used by both single-instance and by-IDs lookups — the parts
// EnrichWithInstanceFacts actually needs.
type instanceRow = instancetargetingfacts.Instance

// EnrichWithInstanceFacts resolves the instance identified by the caller's
// kaiten.instanceSlug/kaiten.instanceId input and writes its registry facts —
// plus its owning customer and deployment zone — into the evaluation context,
// so a rule can reference e.g. `__kaiten.instance.metadata.demo == true`.
//
// instances, customers, and deploymentZones are each the owning module's own
// public read port -- this package never reaches into any of those modules'
// generated db packages directly.
//
// Same discipline as EnrichWithServerFacts: the facts namespace is cleared
// FIRST, unconditionally (via ResetKaitenFacts, called once by the handler
// before any Enrich* function runs) — a caller putting
// `"__kaiten": {"instance": {...}}` in its own request body must never
// survive into a rule that judges it.
func EnrichWithInstanceFacts(
	ctx context.Context,
	instances instancetargetingfacts.Port,
	customers customertargetingfacts.Port,
	deploymentZones deploymentzonetargetingfacts.Port,
	orgID uuid.UUID,
	ec *openfeature.EvaluationContext,
) {
	facts := kaitenFacts(ec)
	delete(facts, InstanceInput)
	delete(facts, CustomerInput)
	delete(facts, DeploymentZoneInput)

	if instances == nil {
		return
	}

	row, ok := resolveInstance(ctx, instances, orgID, kaitenInput(ec))
	if !ok {
		return
	}

	facts[InstanceInput] = instanceFacts(row)

	if row.CustomerSlug != nil && customers != nil {
		customer, err := customers.GetOneCustomerBySlug(ctx, orgID, *row.CustomerSlug)
		if err != nil {
			if !errors.Is(err, pgx.ErrNoRows) {
				slog.WarnContext(ctx, "ofrep: customer facts lookup failed", "customer_slug", *row.CustomerSlug, "error", err)
			}
		} else {
			facts[CustomerInput] = customerFacts(customer)
		}
	}

	if row.DeploymentZoneSlug != nil && deploymentZones != nil {
		zone, err := deploymentZones.GetOneBySlug(ctx, orgID, *row.DeploymentZoneSlug)
		if err != nil {
			if !errors.Is(err, pgx.ErrNoRows) {
				slog.WarnContext(ctx, "ofrep: deployment zone facts lookup failed", "deployment_zone_slug", *row.DeploymentZoneSlug, "error", err)
			}
		} else {
			facts[DeploymentZoneInput] = deploymentZoneFacts(zone)
		}
	}
}

// resolveInstance tries kaiten.instanceSlug first, then kaiten.instanceId —
// two explicit fields, not one polymorphic value: instance slugs in this
// domain are themselves UUID-formatted strings by existing convention
// (instanceSlug := actualOrgID.String(), dev-dogfooding/profile.go), so which
// field the caller populated is the only unambiguous signal for which lookup
// to run — guessing from the value's shape would not be safe here.
func resolveInstance(ctx context.Context, instances instancetargetingfacts.Port, orgID uuid.UUID, input map[string]any) (instanceRow, bool) {
	if slug, ok := input["instanceSlug"].(string); ok && slug != "" {
		row, err := instances.GetOneBySlug(ctx, orgID, slug)
		if err != nil {
			if !errors.Is(err, pgx.ErrNoRows) {
				slog.WarnContext(ctx, "ofrep: instance facts lookup by slug failed", "instance_slug", slug, "error", err)
			}
			return instanceRow{}, false
		}
		return *row, true
	}

	idStr, ok := input["instanceId"].(string)
	if !ok || idStr == "" {
		// Neither reserved input is set — most evaluations (a plain
		// host/user/device targeting rule) have no instance in play at all,
		// which is normal, not an error.
		return instanceRow{}, false
	}

	id, err := uuid.Parse(idStr)
	if err != nil {
		slog.WarnContext(ctx, "ofrep: kaiten.instanceId is not a valid uuid", "instance_id", idStr, "error", err)
		return instanceRow{}, false
	}

	rows, err := instances.GetByIDs(ctx, orgID, []uuid.UUID{id})
	if err != nil || len(rows) == 0 {
		if err != nil {
			slog.WarnContext(ctx, "ofrep: instance facts lookup by id failed", "instance_id", idStr, "error", err)
		}
		return instanceRow{}, false
	}
	return rows[0], true
}

func instanceFacts(row instanceRow) map[string]any {
	return toFactMap(featureflag.InstanceFact{
		ID:             row.ID.String(),
		Slug:           row.Slug,
		Name:           row.Name,
		Status:         row.Status,
		LifecycleStage: row.LifecycleStage,
		Metadata:       decodeJSONObject(row.Metadata),
	})
}

func customerFacts(row *customertargetingfacts.Customer) map[string]any {
	return toFactMap(featureflag.CustomerFact{
		ID:                 row.ID.String(),
		Name:               row.Name,
		Slug:               row.Slug,
		ExternalCustomerID: row.ExternalCustomerID,
		Domain:             row.Domain,
	})
}

func deploymentZoneFacts(row *deploymentzonetargetingfacts.DeploymentZone) map[string]any {
	fact := featureflag.DeploymentZoneFact{
		ID:       row.ID.String(),
		Name:     row.Name,
		Slug:     row.Slug,
		Type:     row.Type,
		Metadata: decodeJSONObject(row.Metadata),
	}
	if row.ReleaseID != uuid.Nil {
		fact.CurrentReleaseID = ptr.To(row.ReleaseID.String())
	}
	return toFactMap(fact)
}

// decodeJSONObject decodes a JSONB column into a map, always returning a
// non-nil map so a rule can safely dereference — a missing key is a CEL
// evaluation error, which skips the rule, never a panic. Malformed JSONB is a
// stored-data bug, not a caller input, so it degrades silently rather than
// being surfaced per request.
func decodeJSONObject(raw []byte) map[string]any {
	m := map[string]any{}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &m)
	}
	return m
}
