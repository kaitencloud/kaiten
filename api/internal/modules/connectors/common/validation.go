package common

import (
	"regexp"
	"strings"

	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

var connectorNamePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$`)

func ValidateConnectorName(connectorName, code string) (string, error) {
	normalized := strings.ToLower(strings.TrimSpace(connectorName))
	if normalized == "" {
		return "", kaitenerrors.Validation(code, "Connector name cannot be empty")
	}

	if !strings.HasPrefix(normalized, "kaiten.") || !connectorNamePattern.MatchString(normalized) {
		return "", kaitenerrors.Validation(
			code,
			"Connector name must use lowercase reverse-DNS format and start with \"kaiten.\"",
		)
	}

	return normalized, nil
}
