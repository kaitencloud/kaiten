package deletevoucher_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/gate"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/deletevoucher"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/tests"
)

var testDB *tests.TestDatabase

func TestMain(m *testing.M) {
	var err error
	testDB, err = tests.NewTestDatabase()
	if err != nil {
		panic("failed to setup test database: " + err.Error())
	}
	defer testDB.TearDown()

	m.Run()
}

type member struct{ user currentuser.User }

func (m member) GetUser(context.Context) (*currentuser.User, error) { return &m.user, nil }

// deleteAsDefaultOrganization runs the use case for the seeded organization's
// user, billing on.
func deleteAsDefaultOrganization(t *testing.T, voucherID uuid.UUID) error {
	t.Helper()
	return deletevoucher.NewUseCase(catalogue.Deps{
		UserProvider: member{currentuser.User{ID: testDB.DefaultData.UserID, OrganizationID: testDB.DefaultData.OrganizationID}},
		Uof:          uow.NewUnitOfWork(testDB.DbPool),
		Gate:         gate.New(true, nil),
	}).Execute(t.Context(), voucherID)
}

// newVoucher stores a PRICE voucher of the organization, in status, whose
// count says it was redeemed redemptions times.
func newVoucher(t *testing.T, organizationID uuid.UUID, status string, redemptions int32) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	require.NoError(t, testDB.DbPool.QueryRow(t.Context(), `
		INSERT INTO voucher (organization_id, code, name, voucher_type, status, duration, redemptions_count,
		                     price_discount_type, price_discount_value, price_applies_to, created_by_id, updated_by_id)
		VALUES ($1, 'CODE-' || substr(md5(random()::text), 1, 12), 'Launch', 'PRICE', $2, 'FOREVER', $3,
		        'PERCENTAGE', 10, 'LICENSE_BASE', $4, $4)
		RETURNING id`, organizationID, status, redemptions, testDB.DefaultData.UserID).Scan(&id))
	return id
}

func stored(t *testing.T, id uuid.UUID) bool {
	t.Helper()
	var found bool
	require.NoError(t, testDB.DbPool.QueryRow(t.Context(), `SELECT EXISTS (SELECT 1 FROM voucher WHERE id = $1)`, id).Scan(&found))
	return found
}

func requireRefused(t *testing.T, err error, status int, code string) {
	t.Helper()
	require.Error(t, err)
	require.Equal(t, status, kaitenerrors.GetHTTPStatus(err))
	require.Equal(t, code, kaitenerrors.GetCode(err))
}

func TestDeleteVoucher(t *testing.T) {
	organizationID := testDB.DefaultData.OrganizationID

	t.Run("ANeverRedeemedVoucherGoes_WhateverItsStatus", func(t *testing.T) {
		for _, status := range []string{"DRAFT", "ACTIVE", "EXPIRED", "ARCHIVED"} {
			id := newVoucher(t, organizationID, status, 0)
			require.NoError(t, deleteAsDefaultOrganization(t, id), status)
			require.False(t, stored(t, id), status)
		}
	})

	// The count, not the redemption rows: an instance's deletion takes its
	// redemptions with it, and the voucher it redeemed is still history.
	t.Run("ARedeemedVoucherStays_WhateverItsStatus", func(t *testing.T) {
		for _, status := range []string{"ACTIVE", "EXHAUSTED", "ARCHIVED"} {
			id := newVoucher(t, organizationID, status, 1)
			requireRefused(t, deleteAsDefaultOrganization(t, id), http.StatusConflict, "DeleteVoucher.Redeemed")
			require.True(t, stored(t, id), status)
		}
	})

	t.Run("AnUnknownVoucherIsNotFound", func(t *testing.T) {
		requireRefused(t, deleteAsDefaultOrganization(t, uuid.New()), http.StatusNotFound, "DeleteVoucher.NotFound")
	})

	t.Run("AnotherOrganizationsVoucherIsNotFound_AndStays", func(t *testing.T) {
		var neighbour uuid.UUID
		require.NoError(t, testDB.DbPool.QueryRow(t.Context(),
			`INSERT INTO organization (external_id, name) VALUES ($1, 'Neighbour') RETURNING id`, "org_"+uuid.NewString()).Scan(&neighbour))
		id := newVoucher(t, neighbour, "DRAFT", 0)

		requireRefused(t, deleteAsDefaultOrganization(t, id), http.StatusNotFound, "DeleteVoucher.NotFound")
		require.True(t, stored(t, id))
	})
}
