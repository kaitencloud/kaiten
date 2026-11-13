package getentitlementusagemetrics

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage/aitest"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type rowFunc func(...any) error

func (f rowFunc) Scan(dest ...any) error { return f(dest...) }

type usageReadStore struct {
	classification  error
	ai              bool
	instancePresent bool
	fallbackCalls   int
}

func (*usageReadStore) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	panic("read must not write")
}

func (*usageReadStore) Query(context.Context, string, ...any) (pgx.Rows, error) {
	panic("unexpected query")
}

func (f *usageReadStore) QueryRow(_ context.Context, sql string, _ ...any) pgx.Row {
	if strings.Contains(sql, "-- name: GetEntitlementContextBySlug") {
		return rowFunc(func(dest ...any) error {
			if f.classification != nil {
				return f.classification
			}
			kind := db.EntitlementTypeNUMBER
			if f.ai {
				kind = db.EntitlementTypeNUMBERAICREDIT
			}
			*dest[5].(*db.EntitlementType) = kind
			return nil
		})
	}
	if !strings.Contains(sql, "-- name: GetEntitlementUsageForInstanceOrDefault") {
		panic("unexpected query")
	}
	f.fallbackCalls++
	return rowFunc(func(dest ...any) error {
		if f.instancePresent {
			*dest[0].(**uuid.UUID) = new(uuid.New())
		}
		return nil
	})
}

func TestAIClassificationPreservesOrdinaryMissingTarget404(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name    string
		present bool
		code    string
	}{
		{"missing instance", false, "GetEntitlementUsageMetrics.InstanceNotFound"},
		{"missing or deleted entitlement", true, "GetEntitlementUsageMetrics.EntitlementNotFound"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			store := &usageReadStore{classification: pgx.ErrNoRows, instancePresent: tc.present}
			_, err := NewQueryRepository(db.New(store)).GetEntitlementUsageMetrics(t.Context(), "instance", "entitlement", uuid.New())
			require.Equal(t, tc.code, apierrors.GetCode(err))
			var problem *apierrors.Error
			require.ErrorAs(t, err, &problem)
			require.Equal(t, 404, problem.HTTPStatus())
			require.Equal(t, 1, store.fallbackCalls)
		})
	}
}

func TestAIClassificationDeniesBeforeOperationalUsageRead(t *testing.T) {
	t.Parallel()
	store := &usageReadStore{ai: true}
	_, err := NewQueryRepository(db.New(store)).GetEntitlementUsageMetrics(t.Context(), "instance", "ai-pool", uuid.New())
	require.Equal(t, "AIUsage.Disabled", apierrors.GetCode(err))
	require.Zero(t, store.fallbackCalls)
	unavailable := errors.New("classification unavailable")
	store = &usageReadStore{classification: unavailable}
	_, err = NewQueryRepository(db.New(store)).GetEntitlementUsageMetrics(t.Context(), "instance", "pool", uuid.New())
	require.ErrorIs(t, err, unavailable)
	require.Zero(t, store.fallbackCalls)
}

func TestOperationalReadCannotBorrowAnotherOrganizationSnapshot(t *testing.T) {
	t.Parallel()
	sourceOrg, targetOrg := uuid.New(), uuid.New()
	policy := aiusage.Policy{Flags: aitest.Flags(true)}
	ctx := policy.Resolve(t.Context(), sourceOrg)
	store := &usageReadStore{ai: true}
	_, err := NewQueryRepository(db.New(store), policy).GetEntitlementUsageMetrics(ctx, "instance", "pool", targetOrg)
	require.Equal(t, "AIUsage.Disabled", apierrors.GetCode(err))
	require.Zero(t, store.fallbackCalls)
}
