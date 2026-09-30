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

// DevClaims builds the canonical Kaiten JWT claims for a user+org pair,
// intended for local-dev token generation.
//
// This is the canonical claim contract, uniform across externally issued tokens, local
// HS256 dev tokens, and PAT-minted internal tokens: the API only ever trusts
// external ids and resolves them to internal UUIDs via JIT provisioning.
// `kaiten_user_id`, `kaiten_org_id`, and `org_id` are not part of this
// contract.
//
//	┌───────────┬────────────────────────┬─────────────────┐
//	│  Claim    │        Meaning         │    Required?    │
//	├───────────┼────────────────────────┼─────────────────┤
//	│ sub       │ external user id       │ required        │
//	├───────────┼────────────────────────┼─────────────────┤
//	│ kaiten_   │ external org id        │ required        │
//	│ external_ │                        │                 │
//	│ org_id    │                        │                 │
//	├───────────┼────────────────────────┼─────────────────┤
//	│ scopes    │ []string               │ required        │
//	├───────────┼────────────────────────┼─────────────────┤
//	│ kaiten_   │ org display name       │ optional        │
//	│ org_name  │ (COALESCE; empty never │                 │
//	│           │ clobbers)              │                 │
//	├───────────┼────────────────────────┼─────────────────┤
//	│ email     │ user metadata          │ optional        │
//	│ name      │ (COALESCE)             │                 │
//	└───────────┴────────────────────────┴─────────────────┘
func DevClaims(subject, email, name, externalOrgID, orgName string, scopes []string) jwt.MapClaims {
	return jwt.MapClaims{
		"sub":                    subject,
		"kaiten_external_org_id": externalOrgID,
		"kaiten_org_name":        orgName,
		"name":                   name,
		"email":                  email,
		"scopes":                 scopes,
		"iat":                    time.Now().Unix(),
		"exp":                    time.Now().Add(24 * 365 * time.Hour).Unix(), // 1 year for dev convenience
	}
}
