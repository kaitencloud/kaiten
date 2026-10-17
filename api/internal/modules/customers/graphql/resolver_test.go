package graphql

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/customers/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

// fakeDBTX is a minimal db.DBTX fake: GetCustomers only ever calls Query,
// so Exec/QueryRow are unused but required by the interface. It records
// every Query's arguments so a test can assert what the resolver asked the
// database for -- how many round-trips, with which limit and which filter.
type fakeDBTX struct {
	rows *fakeRows
	args [][]any
}

func (f *fakeDBTX) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, errors.New("fakeDBTX: Exec not supported")
}

func (f *fakeDBTX) Query(_ context.Context, _ string, args ...any) (pgx.Rows, error) {
	f.args = append(f.args, args)
	return f.rows, nil
}

func (f *fakeDBTX) QueryRow(context.Context, string, ...any) pgx.Row {
	return nil
}

// fakeRows returns count customer rows, ordered created_at DESC like the
// cursor query is, so BuildPage's trimming and cursor encoding see the
// shape they would see in production.
type fakeRows struct {
	count int
	next  int
}

func (r *fakeRows) Close()                                       {}
func (r *fakeRows) Err() error                                   { return nil }
func (r *fakeRows) CommandTag() pgconn.CommandTag                { return pgconn.CommandTag{} }
func (r *fakeRows) FieldDescriptions() []pgconn.FieldDescription { return nil }
func (r *fakeRows) Values() ([]any, error)                       { return nil, nil }
func (r *fakeRows) RawValues() [][]byte                          { return nil }
func (r *fakeRows) Conn() *pgx.Conn                              { return nil }

func (r *fakeRows) Next() bool {
	r.next++
	return r.next <= r.count
}

// Scan fills only the two columns the page cursor is built from -- id
// (first) and created_at (ninth) in GetCustomers' select list -- and
// leaves the rest of the row at its zero value.
func (r *fakeRows) Scan(dest ...any) error {
	id, ok := dest[0].(*uuid.UUID)
	if !ok {
		return fmt.Errorf("fakeRows: expected *uuid.UUID at column 1, got %T", dest[0])
	}
	createdAt, ok := dest[8].(*pgtype.Timestamp)
	if !ok {
		return fmt.Errorf("fakeRows: expected *pgtype.Timestamp at column 9, got %T", dest[8])
	}

	*id = uuid.New()
	*createdAt = pgtype.Timestamp{Time: time.Date(2026, 6, 16, 12, 0, 0, 0, time.UTC).Add(-time.Duration(r.next) * time.Hour), Valid: true}
	return nil
}

// queryLimit reports the limit_plus_one the resolver passed on its only
// query, failing the test if it issued anything other than exactly one.
func queryLimit(t *testing.T, fake *fakeDBTX) int32 {
	t.Helper()

	require.Len(t, fake.args, 1, "the resolver should page with a single query")
	limit, ok := fake.args[0][len(fake.args[0])-1].(int32)
	require.True(t, ok, "last query argument should be limit_plus_one")
	return limit
}

func contextWithOrganization(t *testing.T, organizationID uuid.UUID) context.Context {
	t.Helper()

	return principal.ContextWithPrincipal(t.Context(), &principal.Principal{OrganizationID: organizationID})
}

// TestGetCustomersWithIntegrationPaginates tests that the hasIntegration
// filter pages like every other list: the adapter is pushed into the
// keyset query, only limit rows come back, and HasMore/NextCursor report
// the further page that exists.
func TestGetCustomersWithIntegrationPaginates(t *testing.T) {
	organizationID := uuid.New()
	adapter := "kaiten.integration.crm.attio"
	// Three matching rows for a limit of two: the third is the limit+1
	// probe row that tells the resolver a further page exists.
	fake := &fakeDBTX{rows: &fakeRows{count: 3}}

	page, err := GetCustomers(contextWithOrganization(t, organizationID), db.New(fake), &adapter, 2, nil)

	require.NoError(t, err)
	require.Len(t, page.Items, 2)
	assert.True(t, page.HasMore, "a third matching row exists, so hasMore must be true")
	require.NotNil(t, page.NextCursor)
	require.Len(t, fake.args, 1, "the adapter filter should be a predicate of the page query, not a second query")
	assert.Equal(t, []any{organizationID, &adapter, pgtype.Timestamp{}, (*uuid.UUID)(nil), int32(3)}, fake.args[0])
}

// TestGetCustomersWithIntegrationReportsNoFurtherPage tests the other side
// of the same contract: when the query returns no probe row, the page is
// final and carries no cursor.
func TestGetCustomersWithIntegrationReportsNoFurtherPage(t *testing.T) {
	adapter := "kaiten.integration.crm.attio"
	fake := &fakeDBTX{rows: &fakeRows{count: 2}}

	page, err := GetCustomers(contextWithOrganization(t, uuid.New()), db.New(fake), &adapter, 2, nil)

	require.NoError(t, err)
	require.Len(t, page.Items, 2)
	assert.False(t, page.HasMore)
	assert.Nil(t, page.NextCursor)
}

// TestGetCustomersWithIntegrationClampsLimit tests that a hasIntegration
// request goes through pagination.ClampLimit like the unfiltered path, so
// neither an unset nor an oversized limit reaches the database unbounded.
func TestGetCustomersWithIntegrationClampsLimit(t *testing.T) {
	tests := []struct {
		name             string
		limit            int32
		wantLimitPlusOne int32
	}{
		{name: "UnsetLimitBecomesDefault", limit: 0, wantLimitPlusOne: pagination.DefaultLimit + 1},
		{name: "NegativeLimitBecomesDefault", limit: -1, wantLimitPlusOne: pagination.DefaultLimit + 1},
		{name: "OversizedLimitIsCapped", limit: 10_000, wantLimitPlusOne: pagination.MaxLimit + 1},
		{name: "LimitWithinBoundsIsHonoured", limit: 7, wantLimitPlusOne: 8},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			adapter := "kaiten.integration.crm.attio"
			fake := &fakeDBTX{rows: &fakeRows{count: 0}}

			_, err := GetCustomers(contextWithOrganization(t, uuid.New()), db.New(fake), &adapter, tt.limit, nil)

			require.NoError(t, err)
			assert.Equal(t, tt.wantLimitPlusOne, queryLimit(t, fake))
		})
	}
}

// TestGetCustomersWithoutIntegrationPassesNoAdapter tests that an
// unfiltered request leaves the adapter predicate NULL, so sharing the
// query with the filter did not narrow the default listing.
func TestGetCustomersWithoutIntegrationPassesNoAdapter(t *testing.T) {
	organizationID := uuid.New()
	fake := &fakeDBTX{rows: &fakeRows{count: 1}}

	page, err := GetCustomers(contextWithOrganization(t, organizationID), db.New(fake), nil, 2, nil)

	require.NoError(t, err)
	require.Len(t, page.Items, 1)
	assert.Equal(t, []any{organizationID, (*string)(nil), pgtype.Timestamp{}, (*uuid.UUID)(nil), int32(3)}, fake.args[0])
}

// TestGetCustomersWithIntegrationFollowsCursor tests that the cursor a
// filtered page hands back is decoded and keyset-filtered on for the next
// page, instead of being ignored.
func TestGetCustomersWithIntegrationFollowsCursor(t *testing.T) {
	organizationID := uuid.New()
	adapter := "kaiten.integration.crm.attio"
	lastSeen := pagination.CreatedAtCursor{CreatedAt: time.Date(2026, 6, 16, 11, 0, 0, 0, time.UTC), ID: uuid.New()}
	cursor, err := pagination.Encode(lastSeen)
	require.NoError(t, err)
	fake := &fakeDBTX{rows: &fakeRows{count: 1}}

	_, err = GetCustomers(contextWithOrganization(t, organizationID), db.New(fake), &adapter, 2, &cursor)

	require.NoError(t, err)
	require.Len(t, fake.args, 1)
	assert.Equal(t, []any{
		organizationID,
		&adapter,
		pgtype.Timestamp{Time: lastSeen.CreatedAt, Valid: true},
		&lastSeen.ID,
		int32(3),
	}, fake.args[0])
}
