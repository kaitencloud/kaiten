package main

import (
	"github.com/stretchr/testify/require"
	"testing"
)

func TestMigrateRejectsInvalidCapabilityPolicyBeforeDatabase(t *testing.T) {
	t.Setenv("KAITEN_LICENSE_CAPABILITY_REVISIONS", `{"organizationId":"not-an-id","families":[]}`)
	result := runAdminTools(t, "postgres://must-not-connect", "migrate", "up")
	require.ErrorContains(t, result.Err, "invalid license capability revision policy")
	require.Empty(t, result.Stdout)
	require.NotContains(t, result.Logs, "must-not-connect")
}
