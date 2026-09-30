package kaiten

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/featureflag"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/openfeature"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/createfeatureflag"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/deletefeatureflag"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/getfeatureflag"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/getfeatureflags"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/gettargetingcontext"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/linttargetingrule"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/openfeature/manifest/getmanifest"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/openfeature/ofrep"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/openfeature/ofrep/bulkevaluateflags"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/openfeature/ofrep/evaluateflag"
	flagschema "github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/testtargetingrule"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/updatefeatureflag"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

// FeatureFlags is the featureflags module's eight operations: five that manage a
// flag, and three that read one the way a client SDK does.
//
// The three reads are the module's reason for existing, and they are what makes
// this surface worth having: Evaluate and EvaluateAll answer OpenFeature's OFREP
// protocol on raw Fiber routes rather than through huma, and Manifest answers a
// huma operation. Three transports' worth of shape, one place that decides whether
// the caller may evaluate anything -- which is precisely what was not true while
// each route carried its own middleware and called Execute itself.
//
// Evaluate and EvaluateAll are the only methods on any surface whose use case
// cannot fail: an evaluation that goes wrong resolves to an error *variant*, which
// is a value OFREP defines and a client is expected to handle, not a transport
// error. They still return an error, because this surface can refuse the call
// before the use case runs -- so the error means "you were not allowed to ask",
// never "the flag could not be resolved".
//
// See Customers for the naming and argument-order convention.
type FeatureFlags struct {
	uc *featureflags.UseCases
}

// FeatureFlags returns the feature flags surface.
func (k *Kaiten) FeatureFlags() FeatureFlags {
	return FeatureFlags{uc: k.modules.FeatureFlags}
}

func (f FeatureFlags) Create(
	ctx context.Context, cl caller.OrganizationCaller, flag *flagschema.FeatureFlag,
) (*flagschema.FeatureFlag, error) {
	if err := cl.Require(createfeatureflag.RequiredScope); err != nil {
		return nil, err
	}

	return f.uc.CreateFeatureFlag.Execute(bindOrganization(ctx, cl), flag)
}

func (f FeatureFlags) List(
	ctx context.Context, cl caller.OrganizationCaller, limit int32, cursor *string,
) (pagination.Page[flagschema.FeatureFlag], error) {
	if err := cl.Require(getfeatureflags.RequiredScope); err != nil {
		return pagination.Page[flagschema.FeatureFlag]{}, err
	}

	return f.uc.GetFeatureFlags.Execute(bindOrganization(ctx, cl), limit, cursor)
}

func (f FeatureFlags) Get(
	ctx context.Context, cl caller.OrganizationCaller, slug string,
) (*flagschema.FeatureFlag, error) {
	if err := cl.Require(getfeatureflag.RequiredScope); err != nil {
		return nil, err
	}

	return f.uc.GetFeatureFlag.Execute(bindOrganization(ctx, cl), slug)
}

// Update takes the slug twice over, in effect: once as the flag to write and once
// inside flag, where a different value renames it. That is the operation's own
// contract rather than this surface's -- see updatefeatureflag's request body.
func (f FeatureFlags) Update(
	ctx context.Context, cl caller.OrganizationCaller, slug string, flag *flagschema.FeatureFlag,
) error {
	if err := cl.Require(updatefeatureflag.RequiredScope); err != nil {
		return err
	}

	return f.uc.UpdateFeatureFlag.Execute(bindOrganization(ctx, cl), slug, flag)
}

func (f FeatureFlags) Delete(ctx context.Context, cl caller.OrganizationCaller, slug string) error {
	if err := cl.Require(deletefeatureflag.RequiredScope); err != nil {
		return err
	}

	return f.uc.DeleteFeatureFlag.Execute(bindOrganization(ctx, cl), slug)
}

// Manifest is the OpenFeature manifest: every flag carrying a fallback value, so
// an SDK can resolve locally when it cannot reach us.
func (f FeatureFlags) Manifest(
	ctx context.Context, cl caller.OrganizationCaller,
) (*getmanifest.ManifestEnvelope, error) {
	if err := cl.Require(getmanifest.RequiredScope); err != nil {
		return nil, err
	}

	return f.uc.GetManifest.Execute(bindOrganization(ctx, cl))
}

// TargetingContext is what a targeting rule may read in this organization: the
// facts the server guarantees, plus the organization's entitlement slugs. It
// describes what the console completes against, and is not a closed set -- a
// host targets on its own attributes too.
func (f FeatureFlags) TargetingContext(
	ctx context.Context, cl caller.OrganizationCaller,
) ([]featureflag.TargetingContextNode, error) {
	if err := cl.Require(gettargetingcontext.RequiredScope); err != nil {
		return nil, err
	}

	return f.uc.GetTargetingContext.Execute(bindOrganization(ctx, cl))
}

// LintTargetingRule reports what is wrong with a rule without writing it. The
// error is the refusal to run the check; a rule the check rejects comes back as
// a populated list of issues, which is an answer rather than a failure -- see
// linttargetingrule.Verdict.
func (f FeatureFlags) LintTargetingRule(
	ctx context.Context, cl caller.OrganizationCaller, rule string,
) ([]featureflag.TargetingRuleIssue, error) {
	if err := cl.Require(linttargetingrule.RequiredScope); err != nil {
		return nil, err
	}

	return f.uc.LintTargetingRule.Execute(bindOrganization(ctx, cl), rule)
}

// TestTargetingRule rehearses a rule against a context, enriching it exactly
// the way an evaluation would, without a flag and without writing anything.
// The error is the refusal to rehearse; every outcome of the rehearsal itself
// — lint issues, no match, an evaluation error — is data in the Rehearsal.
func (f FeatureFlags) TestTargetingRule(
	ctx context.Context, cl caller.OrganizationCaller,
	rule, targetingKey string, contextInputs map[string]any,
) (*testtargetingrule.Rehearsal, error) {
	if err := cl.Require(testtargetingrule.RequiredScope); err != nil {
		return nil, err
	}

	return f.uc.TestTargetingRule.Execute(bindOrganization(ctx, cl), rule, targetingKey, contextInputs)
}

// Evaluate resolves one flag for the given evaluation context. The error is the
// refusal to evaluate, not a failed evaluation -- see the type doc.
func (f FeatureFlags) Evaluate(
	ctx context.Context, cl caller.OrganizationCaller,
	name string, evaluationContext ofrep.Context,
) (*openfeature.ResolutionDetails, error) {
	if err := cl.Require(evaluateflag.RequiredScope); err != nil {
		return nil, err
	}

	return f.uc.EvaluateFlag.Execute(bindOrganization(ctx, cl), name, evaluationContext), nil
}

// EvaluateAll resolves every flag the organization has for the given evaluation
// context, which is how an SDK primes its cache on start-up.
func (f FeatureFlags) EvaluateAll(
	ctx context.Context, cl caller.OrganizationCaller, evaluationContext ofrep.Context,
) ([]bulkevaluateflags.FlagEvaluation, error) {
	if err := cl.Require(bulkevaluateflags.RequiredScope); err != nil {
		return nil, err
	}

	return f.uc.BulkEvaluateFlags.Execute(bindOrganization(ctx, cl), evaluationContext), nil
}
