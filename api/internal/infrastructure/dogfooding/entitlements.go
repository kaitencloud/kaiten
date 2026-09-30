package dogfooding

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/google/uuid"
	sdk "github.com/kaitencloud/sdk-go"
)

// Entitled reports whether an organization's licence in the Kaiten installation
// this one reports to grants entitlementSlug.
func (r *client) Entitled(ctx context.Context, orgID uuid.UUID, entitlementSlug string) (bool, error) {
	if strings.TrimSpace(entitlementSlug) == "" {
		return true, nil
	}

	if r.isSelf(orgID) {
		return true, nil
	}

	readCtx, cancel := context.WithTimeout(ctx, usageReportTimeout)
	defer cancel()

	usage, err := r.sdkClient.Instances.GetEntitlementUsageMetric(readCtx, orgID.String(), entitlementSlug)
	if err != nil {
		var apiErr *sdk.Error
		if errors.As(err, &apiErr) && apiErr.StatusCode == http.StatusNotFound {
			return false, nil
		}
		return false, fmt.Errorf("read %q entitlement: %w", entitlementSlug, err)
	}

	// A non-BOOLEAN entitlement under a slug a connector named is a catalogue
	// mistake, and it is refused rather than coerced: reading a numeric quota as a
	// yes/no would answer confidently with something nobody configured.
	value, err := usage.Value.AsBooleanEntitlementValue()
	if err != nil {
		return false, fmt.Errorf("entitlement %q is not a BOOLEAN entitlement: %w", entitlementSlug, err)
	}

	return value.Value, nil
}

// Entitled resolves the lazily-loaded client and asks it.
//
// A reporter that has no client yet cannot answer, and says so rather than defaulting.
// The credential arrives from a file the platform writes after this process starts, so
// "not ready" is an ordinary early-life state -- and the difference between it and "not
// entitled" is exactly the difference the callers fail closed on.
func (r *Reporter) Entitled(ctx context.Context, orgID uuid.UUID, entitlementSlug string) (bool, error) {
	client, err := r.awaitClient(ctx)
	if err != nil {
		return false, err
	}

	return client.Entitled(ctx, orgID, entitlementSlug)
}
