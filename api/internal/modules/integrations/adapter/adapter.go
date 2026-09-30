// Package adapter holds the integrations module's adapter-name normalization,
// shared by getintegration and upsertintegration. It has no persistence of
// its own -- both handlers get their customer/instance data from those
// modules' own integrationsync ports instead.
package adapter

import (
	"strings"

	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const prefix = "kaiten.integration."

// Normalize ensures adapter carries the "kaiten.integration." prefix,
// trimming whitespace and rejecting an empty value.
func Normalize(value string) (string, error) {
	normalized := strings.TrimSpace(value)
	if normalized == "" {
		return "", kaitenerrors.Validation("Integration.InvalidAdapter", "Integration adapter cannot be empty")
	}
	if strings.HasPrefix(normalized, prefix) {
		return normalized, nil
	}
	return prefix + normalized, nil
}
