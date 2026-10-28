package dogfooding

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	ofsdk "github.com/open-feature/go-sdk/openfeature"
)

// This is the OFREP wire key emitted by evaluator.BrokenRulesMetadataKey. Keep
// the remote reader independent of the local feature-flag evaluation module.
const brokenTargetingRulesMetadataKey = "kaiten.brokenTargetingRules"

// BooleanValue reads a trusted platform flag about organizationID, not the
// organization authenticating the provider request. Every call evaluates anew;
// metering exemptions and last-known CONFIG values cannot authorize a flag.
func (r *Reporter) BooleanValue(ctx context.Context, organizationID uuid.UUID, flagKey string) (bool, error) {
	if r == nil || organizationID == uuid.Nil || strings.TrimSpace(flagKey) == "" {
		return false, fmt.Errorf("platform flag requires a reporter, organization and key")
	}

	evalCtx, cancel := context.WithTimeout(ctx, evaluationTimeout)
	defer cancel()
	if err := evalCtx.Err(); err != nil {
		return false, err
	}

	client, err := r.clientNow(evalCtx)
	if err != nil {
		return false, err
	}
	if client.ofClient == nil || !r.flagClientReady(client) || client.ofClient.State() != ofsdk.ReadyState {
		return false, errNotReady
	}

	// Details preserve DISABLED even if a provider returns its configured true
	// default. OFREP v0.1.7 itself substitutes the false fallback in that case.
	details, err := client.ofClient.BooleanValueDetails(evalCtx, flagKey, false, newInternalEvaluationContext(organizationID))
	if ctxErr := evalCtx.Err(); ctxErr != nil {
		return false, ctxErr
	}
	if err != nil {
		return false, fmt.Errorf("evaluate platform flag %q: %w", flagKey, err)
	}
	// Do not accept a positive response that arrived after closure, a failed
	// credential read, rotation, or a provider readiness change.
	if !r.flagClientReady(client) || client.ofClient.State() != ofsdk.ReadyState {
		return false, errNotReady
	}
	if details.Reason == ofsdk.DisabledReason {
		return false, nil
	}
	if details.Reason == ofsdk.ErrorReason || details.ErrorCode != "" {
		return false, fmt.Errorf("platform flag %q evaluation failed", flagKey)
	}
	switch details.Reason {
	case ofsdk.StaticReason, ofsdk.DefaultReason, ofsdk.TargetingMatchReason, ofsdk.SplitReason:
		// These are current successful resolutions from Kaiten's evaluator.
	default:
		return false, fmt.Errorf("platform flag %q has no current resolution", flagKey)
	}
	if _, broken := details.FlagMetadata[brokenTargetingRulesMetadataKey]; broken {
		return false, fmt.Errorf("platform flag %q has broken targeting rules", flagKey)
	}
	return details.Value, nil
}

func (r *Reporter) flagClientReady(client *client) bool {
	select {
	case <-r.closed:
		return false
	default:
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.flagSourceReady && r.client == client
}
