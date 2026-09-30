package jwtutil

import (
	"testing"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/require"
)

func TestSignHS256(t *testing.T) {
	secret := []byte("secret")
	signed, err := SignHS256(secret, jwt.MapClaims{"sub": "subject"})
	require.NoError(t, err)

	token, err := jwt.Parse(signed, func(token *jwt.Token) (any, error) {
		require.Equal(t, jwt.SigningMethodHS256.Alg(), token.Method.Alg())
		return secret, nil
	})
	require.NoError(t, err)
	require.True(t, token.Valid)
}

func TestSignHS256RejectsEmptySecret(t *testing.T) {
	signed, err := SignHS256(nil, jwt.MapClaims{"sub": "subject"})
	require.Error(t, err)
	require.Empty(t, signed)
}

func TestSignUnsigned(t *testing.T) {
	signed, err := SignUnsigned(jwt.MapClaims{"sub": "subject"})
	require.NoError(t, err)

	token, _, err := jwt.NewParser().ParseUnverified(signed, jwt.MapClaims{})
	require.NoError(t, err)
	require.Equal(t, jwt.SigningMethodNone.Alg(), token.Method.Alg())
}

func TestDevClaims(t *testing.T) {
	claims := DevClaims("user_splinter", "user@example.com", "Example User", "org_tmnt_hq", "Example Organization", []string{"read:*", "write:*"})

	require.Equal(t, "user_splinter", claims["sub"])
	require.Equal(t, "org_tmnt_hq", claims["kaiten_external_org_id"])
	require.Equal(t, "Example Organization", claims["kaiten_org_name"])
	require.Equal(t, "user@example.com", claims["email"])
	require.Equal(t, "Example User", claims["name"])
	require.Equal(t, []string{"read:*", "write:*"}, claims["scopes"])
	require.NotContains(t, claims, "kaiten_user_id")
	require.NotContains(t, claims, "kaiten_org_id")
	require.NotContains(t, claims, "org_id")
}
