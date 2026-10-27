package demo

import (
	"context"
	"fmt"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/createentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	entitlementschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/reportentitlementusagemetric"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usage/aicredit"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/associateentitlementwithlicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/conversionrules"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/createconversionrule"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/createmodel"
	modelschema "github.com/kaitencloud/kaiten/api/internal/modules/models/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/seeder"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
)

// seedAI writes every consumption through the normal report use case, never a
// second counter writer. Provider usage is synthetic and contains no prompts.
func (p *Profile) seedAI(ctx context.Context, sc *seeder.SeederContext, actor currentuser.Provider, instances []seededInstance) error {
	if !sc.AIPolicy.Enabled {
		return nil
	}
	modelSlug := "sushi-assistant"
	_, err := createmodel.NewUseCase(createmodel.Deps{AIPolicy: sc.AIPolicy, UserProvider: actor, Uof: uow.NewUnitOfWork(sc.Pool())}).Execute(ctx, &createmodel.Command{Name: "Sushi assistant", Slug: modelSlug, Vendor: "synthetic", Modality: modelschema.Text, Status: modelschema.Active, ExternalIDs: []string{"sushi-assistant-v1"}, VendorCosts: modelschema.VendorCosts{Currency: "USD"}})
	if err != nil {
		return fmt.Errorf("seed AI model: %w", err)
	}
	pool := "ai-credits"
	_, err = sc.Entitlements.CreateEntitlement.Execute(ctx, &createentitlement.Command{Name: "AI credits", Slug: &pool, Type: entitlementschema.NumberAICredit, AggregationMethod: ptr.To(entitlementschema.Sum), ResetPeriod: ptr.To(period.Month), ResetAnchor: ptr.To(period.Calendar), UnitSingular: ptr.To("credit"), UnitPlural: ptr.To("credits")})
	if err != nil {
		return err
	}
	seen := map[string]bool{}
	for _, instance := range instances {
		var license string
		if err := sc.Pool().QueryRow(ctx, `SELECT l.slug FROM instance i JOIN license l ON l.id=i.license_id WHERE i.id=$1 AND i.organization_id=$2`, instance.ID, sc.OrganizationID).Scan(&license); err != nil {
			return err
		}
		if !seen[license] {
			seen[license] = true
			if err := sc.Licenses.AssociateEntitlementWithLicense.Execute(ctx, license, &associateentitlementwithlicense.Command{EntitlementSlug: pool, Value: map[string]any{"type": "number", "value": 1000}}); err != nil {
				return err
			}
			_, err = sc.Licenses.CreateConversionRule.Execute(ctx, license, &createconversionrule.Command{EntitlementSlug: pool, ModelSlug: &modelSlug, Pricing: conversionrules.Pricing{Rates: licenseschema.ConversionRates{PerInputToken: ptr.To("0.001"), PerOutputToken: ptr.To("0.003")}, MinimumCreditsPerRequest: "0", ChargeOnError: aicredit.Never}})
			if err != nil {
				return err
			}
		}
		request, status := aicredit.Completion, aicredit.Success
		for turn := range 3 {
			input, output := int64(100+turn*50), int64(50+turn*10)
			_, err = sc.Instances.ReportEntitlementUsageMetric.Execute(ctx, instance.Slug, pool, &reportentitlementusagemetric.Command{AI: &instanceschema.AiUsageValue{Type: "ai_usage", Phase: "commit", TransactionID: fmt.Sprintf("demo:%s:%d", instance.Slug, turn), Model: &modelSlug, RequestType: &request, RequestStatus: &status, Usage: &instanceschema.AiUsage{InputTokens: &input, OutputTokens: &output}}})
			if err != nil {
				return err
			}
		}
	}
	return nil
}
