package random

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"math"
)

func GeneratePrefixed(prefix string, length int) (string, error) {
	if length <= 0 {
		return "", fmt.Errorf("length must be positive")
	}

	// see https://stackoverflow.com/a/31877106
	bytesNeeded := int(math.Ceil(float64(length) * 3.0 / 4.0))

	b := make([]byte, bytesNeeded)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("failed to generate random bytes: %w", err)
	}

	encoded := base64.RawURLEncoding.EncodeToString(b)

	if len(encoded) > length {
		encoded = encoded[:length]
	}

	return prefix + encoded, nil
}
