// Package dogfoodingctx builds the OFREP evaluation-context attributes
// kaiten uses for its own platform-internal flag checks -- the ones
// authenticated with a Dogfooding-org-scoped service token and evaluated
// about an arbitrary target org, rather than the org actually calling in.
// Every emitter of such a check needs the identical shape: same reserved
// namespace key, same targetingKey/organizationId/instanceSlug convention.
// It lives under pkg/ because a consumer outside this module cannot import
// internal packages -- see pkg/externalid for the same convention.
package dogfoodingctx

import (
	"github.com/google/uuid"
)

// KaitenInputKey is the caller-facing OFREP evaluation-context namespace
// kaiten reserves for its own routing hints (see
// internal/modules/featureflags/openfeature/ofrep.KaitenInput, which aliases
// this constant).
const KaitenInputKey = "kaiten"

// InternalEvaluationContextKey used to be how an evaluation announced itself
// as platform-internal. Nothing sends it any more -- it travelled in the
// request body, so any holder of read:feature_flags could set it and have its
// own evaluations skip both metering and the audit stream. The key stays named
// because a caller can still put it there and it must never reach a targeting
// rule: ofrep.ResetKaitenFacts deletes it from every inbound context, the same
// way it drops a caller-supplied "__kaiten" namespace. Internal-ness is now
// IsInternal's answer, read off the caller.
const InternalEvaluationContextKey = "__kaiten_dogfooding_internal"

// BuildContext returns the evaluation-context attributes every
// platform-internal flag check must send identically: targetingKey and
// organizationId set to orgID, and kaiten.instanceSlug set to the same value
// (the convention the dogfooding-config seeding uses for a tracked org's
// instance slug).
func BuildContext(orgID uuid.UUID) map[string]any {
	return map[string]any{
		"targetingKey":   orgID.String(),
		"organizationId": orgID.String(),
		KaitenInputKey: map[string]any{
			"instanceSlug": orgID.String(),
		},
	}
}

// IsInternal reports whether an evaluation run by callerOrgID is
// platform-internal -- that is, whether the caller IS the platform
// organization (config.Config.Metered.ResolvePlatformOrgID), which both legitimate
// emitters are, holding a Dogfooding-org-scoped service token.
func IsInternal(callerOrgID, platformOrgID uuid.UUID) bool {
	return platformOrgID != uuid.Nil && callerOrgID == platformOrgID
}
