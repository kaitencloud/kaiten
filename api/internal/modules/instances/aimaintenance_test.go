package instances

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
)

type organizationRows struct {
	organizations []uuid.UUID
	next          int
	closed        bool
}

func (r *organizationRows) Close()                                       { r.closed = true }
func (r *organizationRows) Err() error                                   { return nil }
func (r *organizationRows) CommandTag() pgconn.CommandTag                { return pgconn.CommandTag{} }
func (r *organizationRows) FieldDescriptions() []pgconn.FieldDescription { return nil }
func (r *organizationRows) RawValues() [][]byte                          { return nil }
func (r *organizationRows) Values() ([]any, error)                       { return []any{r.organizations[r.next-1]}, nil }
func (r *organizationRows) Conn() *pgx.Conn                              { return nil }
func (r *organizationRows) Next() bool                                   { r.next++; return r.next <= len(r.organizations) }

func (r *organizationRows) Scan(dest ...any) error {
	*dest[0].(*uuid.UUID) = r.organizations[r.next-1]
	return nil
}

type organizationStore struct{ rows *organizationRows }

func (s organizationStore) Query(context.Context, string, ...any) (pgx.Rows, error) {
	return s.rows, nil
}

type maintenanceFlags func(context.Context, uuid.UUID, string) (bool, error)

func (f maintenanceFlags) BooleanValue(ctx context.Context, org uuid.UUID, key string) (bool, error) {
	return f(ctx, org, key)
}

func TestAIMaintenanceChecksLiveFlagPerOrganizationBeforeWork(t *testing.T) {
	t.Parallel()
	allowed, denied, unknown := uuid.New(), uuid.New(), uuid.New()
	organizations := []uuid.UUID{allowed, denied, unknown}
	enabled := true
	calls := map[uuid.UUID]int{}
	var rows *organizationRows
	policy := aiusage.Policy{Flags: maintenanceFlags(func(_ context.Context, org uuid.UUID, key string) (bool, error) {
		require.True(t, rows.closed, "flag reads must not retain the enumeration connection")
		require.Equal(t, "ai-credits", key)
		calls[org]++
		if org == unknown {
			return true, errors.New("source unready")
		}
		return enabled && org == allowed, nil
	})}
	for pass := range 2 {
		rows = &organizationRows{organizations: organizations}
		var work []uuid.UUID
		err := enabledAIOrganizations(t.Context(), organizationStore{rows}, policy, func(ctx context.Context, org uuid.UUID) error {
			require.True(t, policy.Enabled(policy.ForOrganization(ctx, org)))
			require.False(t, policy.Enabled(policy.ForOrganization(ctx, denied)))
			work = append(work, org)
			return nil
		})
		require.NoError(t, err)
		if pass == 0 {
			require.Equal(t, []uuid.UUID{allowed}, work)
		} else {
			require.Empty(t, work, "a later pass must not reuse a positive flag")
		}
		enabled = false
	}
	for _, org := range organizations {
		require.Equal(t, 2, calls[org], "one evaluation per org per sweep, not per row/helper")
	}
}
