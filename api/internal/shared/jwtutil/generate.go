package jwtutil

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// SignHS256 signs claims with the local reverse proxy's development secret.
func SignHS256(secret []byte, claims jwt.MapClaims) (string, error) {
	if len(secret) == 0 {
		return "", fmt.Errorf("jwtutil: hs256 secret is empty")
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(secret)
}

// SignUnsigned creates an internal identity JWT for trusted ForwardAuth output.
// It must never be accepted from an untrusted client or used without a
// validating reverse proxy in front of the API.
func SignUnsigned(claims jwt.MapClaims) (string, error) {
	return jwt.NewWithClaims(jwt.SigningMethodNone, claims).SignedString(jwt.UnsafeAllowNoneSignatureType)
}

// DevClaims builds identity-only claims for local development. Authorization is
// stored in Core, exactly as it is for externally authenticated users.
func DevClaims(subject, email, name, externalOrgID, orgName string) jwt.MapClaims {
	return jwt.MapClaims{
		"sub":                    subject,
		"kaiten_external_org_id": externalOrgID,
		"kaiten_org_name":        orgName,
		"name":                   name,
		"email":                  email,
		"iat":                    time.Now().Unix(),
		"exp":                    time.Now().Add(24 * 365 * time.Hour).Unix(), // 1 year for dev convenience
	}
}
