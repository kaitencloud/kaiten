package graphql

import (
	"context"

	"github.com/google/uuid"
	dataloaderLib "github.com/graph-gophers/dataloader/v7"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/http/graphql/dataloader"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/conversionrules"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
)

const LicenseConversionRulesLoaderName = "LicenseConversionRulesLoader"

// Cache and batch by license plus filter so aliases cannot share another status.
type ConversionRulesKey struct {
	LicenseID uuid.UUID
	Status    schema.ConversionRuleStatus
}

func newConversionRulesBatchFn(q *db.Queries, policy aiusage.Policy) dataloaderLib.BatchFunc[ConversionRulesKey, []*schema.ConversionRule] {
	return func(ctx context.Context, keys []ConversionRulesKey) []*dataloaderLib.Result[[]*schema.ConversionRule] {
		results := make([]*dataloaderLib.Result[[]*schema.ConversionRule], len(keys))
		org, err := getOrganizationID(ctx)
		fail := func(err error) {
			for i := range results {
				results[i] = &dataloaderLib.Result[[]*schema.ConversionRule]{Error: err}
			}
		}
		if err != nil {
			fail(err)
			return results
		}
		if err := policy.RequireEnabled(); err != nil {
			fail(err)
			return results
		}
		ids := make([]uuid.UUID, 0, len(keys))
		seen := map[uuid.UUID]bool{}
		for _, key := range keys {
			if !seen[key.LicenseID] {
				ids = append(ids, key.LicenseID)
				seen[key.LicenseID] = true
			}
		}
		// One organization-scoped query for the whole batch; filter each cache key
		// afterwards. No per-license query loop and no hidden pagination truncation.
		rows, err := q.ListConversionRules(ctx, db.ListConversionRulesParams{OrganizationID: org, LicenseIds: ids, RuleID: nil, Status: nil, EntitlementSlug: nil, ModelSlug: nil})
		if err != nil {
			fail(err)
			return results
		}
		byLicense := map[uuid.UUID][]*schema.ConversionRule{}
		for _, row := range rows {
			byLicense[row.LicenseID] = append(byLicense[row.LicenseID], conversionrules.Present(row))
		}
		for i, key := range keys {
			rules := make([]*schema.ConversionRule, 0)
			for _, rule := range byLicense[key.LicenseID] {
				if key.Status == "" || rule.Status == key.Status {
					rules = append(rules, rule)
				}
			}
			results[i] = &dataloaderLib.Result[[]*schema.ConversionRule]{Data: rules}
		}
		return results
	}
}

func GetLicenseConversionRulesLoader(ctx context.Context) (*dataloaderLib.Loader[ConversionRulesKey, []*schema.ConversionRule], error) {
	return dataloader.GetLoader[ConversionRulesKey, []*schema.ConversionRule](dataloader.LoadersFromContext(ctx), LicenseConversionRulesLoaderName)
}

func LoadConversionRules(ctx context.Context, id uuid.UUID, status *schema.ConversionRuleStatus) ([]*schema.ConversionRule, error) {
	loader, err := GetLicenseConversionRulesLoader(ctx)
	if err != nil {
		return nil, err
	}
	key := ConversionRulesKey{LicenseID: id}
	if status != nil {
		key.Status = *status
	}
	return loader.Load(ctx, key)()
}
