// Package aiusage owns the deployment's startup-fixed AI rollout decision.
// It does not grant scopes or entitlements, and does not gate financial evidence.
package aiusage

import "github.com/kaitencloud/kaiten/api/pkg/apierrors"

// Policy is explicitly wired from configuration into AI operational readers and
// writers. The zero value denies access; there is no permissive missing checker.
type Policy struct {
	Enabled bool
}

// RequireEnabled must run before operational replay, planning or mutation. A
// rollout refusal is never a pricing result or permission for unmetered usage.
func (p Policy) RequireEnabled() error {
	if !p.Enabled {
		return apierrors.Forbidden("AIUsage.Disabled", "AI usage is disabled for this deployment")
	}
	return nil
}

// RequireType guards an operational target by its original catalogue type,
// never by the normalized numeric value shared with ordinary NUMBER grants.
func (p Policy) RequireType(kind string) error {
	if kind == "NUMBER_AI_CREDIT" {
		return p.RequireEnabled()
	}
	return nil
}
