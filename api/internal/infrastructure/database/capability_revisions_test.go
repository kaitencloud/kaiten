package database

import (
	"fmt"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestCapabilityRevisionPolicyIsExplicitAndStrict(t *testing.T) {
	org, family := uuid.New(), uuid.New()
	valid := fmt.Sprintf(`{"organizationId":%q,"families":[{"familyId":%q,"vouchers":false,"addons":true}]}`, org, family)
	plan, err := ParseCapabilityRevisionPlan(valid)
	require.NoError(t, err)
	require.Equal(t, org, plan.OrganizationID)
	require.Equal(t, family, plan.Families[0].FamilyID)
	require.False(t, *plan.Families[0].Vouchers)
	require.True(t, *plan.Families[0].Addons)
	disabled, err := ParseCapabilityRevisionPlan(" ")
	require.NoError(t, err)
	require.Nil(t, disabled)
	for _, raw := range []string{
		"null", "[]", "{}", valid + " {}",
		fmt.Sprintf(`{"organizationId":%q,"families":[]}`, org),
		fmt.Sprintf(`{"organizationId":%q,"families":[{"familyId":%q,"vouchers":true}]}`, org, family),
		fmt.Sprintf(`{"organizationId":%q,"families":[{"familyId":%q,"vouchers":true,"addons":null}]}`, org, family),
		fmt.Sprintf(`{"organizationId":%q,"families":[{"familyId":%q,"vouchers":true,"addons":true,"edition":"growth"}]}`, org, family),
		fmt.Sprintf(`{"organizationId":%q,"families":[{"familyId":%q,"vouchers":true,"addons":true},{"familyId":%q,"vouchers":false,"addons":false}]}`, org, family, family),
		`{"organizationId":"not-a-uuid","families":[]}`,
	} {
		_, err := ParseCapabilityRevisionPlan(raw)
		require.Error(t, err, raw)
	}
}

func TestInvalidCapabilityPolicyDoesNotOpenDatabase(t *testing.T) {
	require.Error(t, RunMigrations("must-not-connect", CapabilityRevisionPlan{}))
	require.Error(t, RunMigrations("must-not-connect", CapabilityRevisionPlan{}, CapabilityRevisionPlan{}))
}
