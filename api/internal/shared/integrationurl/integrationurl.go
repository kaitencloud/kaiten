// Package integrationurl validates the optional `web_url` carried by
// per-entity integrations: the deep link to the record in the third-party
// system. Centralizing the check keeps the contract identical across every
// write path (per-entity upserts, reverse lookups, inline creation inputs).
package integrationurl

import (
	"errors"
	"net/url"
	"strings"
)

// ErrInvalid is returned when the value is not an absolute http(s) URL.
// Call sites wrap it with their operation-specific validation error.
var ErrInvalid = errors.New("web_url must be an absolute http(s) URL")

// Normalize trims an optional integration web URL and ensures it is an
// absolute http(s) URL, so clients can safely render it as a link. Returns
// nil for nil or blank input.
func Normalize(raw *string) (*string, error) {
	if raw == nil {
		return nil, nil
	}

	trimmed := strings.TrimSpace(*raw)
	if trimmed == "" {
		return nil, nil
	}

	parsed, err := url.Parse(trimmed)
	if err != nil {
		return nil, ErrInvalid
	}
	if (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return nil, ErrInvalid
	}

	return &trimmed, nil
}
