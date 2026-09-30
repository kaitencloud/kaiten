// Package secretfile reads a secret (a bearer token, a signing key, a
// service-account JWT) from a mounted file -- the standard shape for a
// Kubernetes-mounted Secret volume, for every plain-text credential not read
// from Vault directly.
package secretfile

import (
	"os"
	"strings"
)

// Read reads the file at path and returns its contents with surrounding
// whitespace trimmed. Returns the *os.ReadFile* error unwrapped (including
// a missing file) so callers that care can still use os.IsNotExist/
// errors.Is(err, os.ErrNotExist) on it.
func Read(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}

	return strings.TrimSpace(string(data)), nil
}
