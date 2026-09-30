package token

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"

	"golang.org/x/crypto/bcrypt"
)

func Hash(plainToken string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(plainToken), bcrypt.DefaultCost)
	if err != nil {
		return "", fmt.Errorf("failed to hash token: %w", err)
	}
	return string(hash), nil
}

func LookupHash(plainToken string) string {
	hash := sha256.Sum256([]byte(plainToken))
	return hex.EncodeToString(hash[:])
}

func Compare(hashedToken, plainToken string) error {
	return bcrypt.CompareHashAndPassword([]byte(hashedToken), []byte(plainToken))
}
