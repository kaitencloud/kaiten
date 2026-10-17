package graphql

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	dataloaderLib "github.com/graph-gophers/dataloader/v7"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/gate"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/http/graphql/dataloader"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// fakeDBTX is a minimal db.DBTX fake: the reads here only ever call Query, so
// Exec/QueryRow are unused but required by the interface. It records every
// Query's arguments, so that a test can assert what the resolver asked the
// database for -- how many round-trips, for which versions.
type fakeDBTX struct {
	mu   sync.Mutex
	rows func() *fakeRows
	args [][]any
}

func (f *fakeDBTX) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, errors.New("fakeDBTX: Exec not supported")
}

func (f *fakeDBTX) Query(_ context.Context, _ string, args ...any) (pgx.Rows, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.args = append(f.args, args)
	return f.rows(), nil
}

func (f *fakeDBTX) QueryRow(context.Context, string, ...any) pgx.Row { return nil }

func (f *fakeDBTX) queries() [][]any {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.args
}

// fakeRows serves count rows, each filled in by fill from the destinations the
// generated Scan hands over.
type fakeRows struct {
	count int
	next  int
	fill  func(row int, dest []any)
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

func (r *fakeRows) Scan(dest ...any) error {
	r.fill(r.next-1, dest)
	return nil
}

var at = time.Date(2026, 10, 12, 9, 0, 0, 0, time.UTC)

// priceRow is one row of ListAddonPrices, in the order its Scan reads the columns:
// the price id (0), the version it belongs to (1), the amount (5), the currency
// (6), the status (16) and the creation instant (18).
type priceRow struct {
	id, addonID uuid.UUID
	status      db.PriceStatus
}

func pricesFake(rows ...priceRow) *fakeDBTX {
	return &fakeDBTX{rows: func() *fakeRows {
		return &fakeRows{count: len(rows), fill: func(i int, dest []any) {
			row := rows[i]
			*dest[0].(*uuid.UUID) = row.id
			*dest[1].(*uuid.UUID) = row.addonID
			*dest[5].(*string) = "2900"
			*dest[6].(*string) = "EUR"
			*dest[16].(*db.PriceStatus) = row.status
			*dest[18].(*pgtype.Timestamp) = pgtype.Timestamp{Time: at, Valid: true}
			*dest[19].(*pgtype.Timestamp) = pgtype.Timestamp{Time: at, Valid: true}
		}}
	}}
}

// contextWithLoaders carries the prices loader of a request for the organization. It
// dispatches a batch when `batch` versions have asked, and no sooner than a second
// otherwise: the batch a test means is then the one it gets, whatever the machine does.
func contextWithLoaders(t *testing.T, organizationID uuid.UUID, fake *fakeDBTX, batch int) context.Context {
	t.Helper()

	loaders := dataloader.NewLoaders()
	loaders.Register(AddonPricesLoaderName, dataloaderLib.NewBatchedLoader(
		newAddonPricesBatchFn(db.New(fake)),
		dataloaderLib.WithBatchCapacity[uuid.UUID, []prices.Price](batch),
		dataloaderLib.WithWait[uuid.UUID, []prices.Price](time.Second),
	))
	ctx := principal.ContextWithPrincipal(t.Context(), &principal.Principal{OrganizationID: organizationID})

	return dataloader.ContextWithLoaders(ctx, loaders)
}

// loadPrices loads the prices of each version at once, from as many goroutines as
// there are versions: what a page of versions does, resolving Addon.prices for
// every item of it.
func loadPrices(ctx context.Context, status *string, addonIDs ...uuid.UUID) ([][]string, []error) {
	prices := make([][]string, len(addonIDs))
	errs := make([]error, len(addonIDs))

	var wg sync.WaitGroup
	for i, id := range addonIDs {
		wg.Go(func() {
			list, err := LoadAddonPrices(ctx, id, status)
			errs[i] = err
			prices[i] = make([]string, len(list))
			for n, price := range list {
				prices[i][n] = price.ID.String()
			}
		})
	}
	wg.Wait()

	return prices, errs
}

// TestAddonPricesOfAPageAreOneStatement is the point of the loader: a page of
// versions asks for the prices of each, and the database is asked once for all
// of them, not once per version.
func TestAddonPricesOfAPageAreOneStatement(t *testing.T) {
	organizationID := uuid.New()
	seats, storage, support := uuid.New(), uuid.New(), uuid.New()
	monthly, annual, storageMonthly := uuid.New(), uuid.New(), uuid.New()
	fake := pricesFake(
		priceRow{id: monthly, addonID: seats, status: db.PriceStatusACTIVE},
		priceRow{id: storageMonthly, addonID: storage, status: db.PriceStatusACTIVE},
		priceRow{id: annual, addonID: seats, status: db.PriceStatusDEPRECATED},
	)

	prices, errs := loadPrices(contextWithLoaders(t, organizationID, fake, 3), nil, seats, storage, support)

	for _, err := range errs {
		require.NoError(t, err)
	}
	require.Len(t, fake.queries(), 1, "one statement for the prices of every version of the page")
	// Asked for the organization's versions, whatever their status. The versions come in
	// the order the goroutines reached the loader, which is no order at all.
	query := fake.queries()[0]
	require.Len(t, query, 3)
	assert.Equal(t, organizationID, query[0])
	assert.ElementsMatch(t, []uuid.UUID{seats, storage, support}, query[1])
	assert.Equal(t, (*db.PriceStatus)(nil), query[2])
	// Each version has its own prices, in the order the statement returned them, and the
	// one with no price has an empty list, never a missing one.
	assert.Equal(t, [][]string{
		{monthly.String(), annual.String()},
		{storageMonthly.String()},
		{},
	}, prices)
}

func TestAddonPricesAreNarrowedToAStatusAfterTheyAreRead(t *testing.T) {
	seats := uuid.New()
	monthly, annual := uuid.New(), uuid.New()
	fake := pricesFake(
		priceRow{id: monthly, addonID: seats, status: db.PriceStatusACTIVE},
		priceRow{id: annual, addonID: seats, status: db.PriceStatusDEPRECATED},
	)
	ctx := contextWithLoaders(t, uuid.New(), fake, 1)
	deprecated := "DEPRECATED"

	prices, errs := loadPrices(ctx, &deprecated, seats)

	require.NoError(t, errs[0])
	assert.Equal(t, [][]string{{annual.String()}}, prices)
	// The loader holds the version's prices of every status, so the same version asked
	// for another status in the same request is not read again.
	active := "ACTIVE"
	prices, errs = loadPrices(ctx, &active, seats)
	require.NoError(t, errs[0])
	assert.Equal(t, [][]string{{monthly.String()}}, prices)
	assert.Len(t, fake.queries(), 1)
}

func TestAddonPricesNeedAnIdentity(t *testing.T) {
	fake := pricesFake()
	loaders := dataloader.NewLoaders()
	loaders.Register(AddonPricesLoaderName, dataloaderLib.NewBatchedLoader(
		newAddonPricesBatchFn(db.New(fake)),
		dataloaderLib.WithBatchCapacity[uuid.UUID, []prices.Price](1),
	))

	_, errs := loadPrices(dataloader.ContextWithLoaders(t.Context(), loaders), nil, uuid.New())

	require.ErrorIs(t, errs[0], dataloader.ErrMissingIdentity)
	assert.Empty(t, fake.queries(), "nothing is read for a request with no organization")
}

// addonsFake serves count versions, newest first, as ListAddons does. A row of it is
// filled in the order its Scan reads the columns: the id (0), the slug (4), the
// creation instant (12) and the family slug (16).
func addonsFake(count int) *fakeDBTX {
	return &fakeDBTX{rows: func() *fakeRows {
		return &fakeRows{count: count, fill: func(i int, dest []any) {
			*dest[0].(*uuid.UUID) = uuid.New()
			*dest[4].(*string) = fmt.Sprintf("extra-seats-v%d", i)
			*dest[12].(*pgtype.Timestamp) = pgtype.Timestamp{Time: at.Add(-time.Duration(i) * time.Hour), Valid: true}
			*dest[16].(*string) = "extra-seats"
		}}
	}}
}

func contextWithOrganization(t *testing.T, organizationID uuid.UUID) context.Context {
	t.Helper()

	return principal.ContextWithPrincipal(t.Context(), &principal.Principal{OrganizationID: organizationID})
}

var openGate = gate.New(true, nil)

func TestGetAddonsPagesTheVersionsInOneQuery(t *testing.T) {
	organizationID := uuid.New()
	// Three rows for a limit of two: the third is the probe row that says another page follows.
	fake := addonsFake(3)

	page, err := GetAddons(contextWithOrganization(t, organizationID), db.New(fake), openGate, 2, nil)

	require.NoError(t, err)
	require.Len(t, page.Items, 2)
	assert.Equal(t, "extra-seats-v0", page.Items[0].Slug)
	assert.Equal(t, "extra-seats", page.Items[0].FamilySlug)
	assert.True(t, page.HasMore)
	require.NotNil(t, page.NextCursor)
	require.Len(t, fake.queries(), 1)
	three := int32(3)
	assert.Equal(t, []any{organizationID, (*db.LicenseLifecycleState)(nil), (*string)(nil), pgtype.Timestamp{}, (*uuid.UUID)(nil), &three},
		fake.queries()[0], "every version of the organization, newest first, one more than the page")
}

func TestGetAddonsReportsTheLastPageWithoutACursor(t *testing.T) {
	page, err := GetAddons(contextWithOrganization(t, uuid.New()), db.New(addonsFake(2)), openGate, 2, nil)

	require.NoError(t, err)
	require.Len(t, page.Items, 2)
	assert.False(t, page.HasMore)
	assert.Nil(t, page.NextCursor)
}

func TestGetAddonsFollowsTheCursorOfThePageBefore(t *testing.T) {
	organizationID := uuid.New()
	first, err := GetAddons(contextWithOrganization(t, organizationID), db.New(addonsFake(3)), openGate, 2, nil)
	require.NoError(t, err)
	require.NotNil(t, first.NextCursor)
	fake := addonsFake(1)

	_, err = GetAddons(contextWithOrganization(t, organizationID), db.New(fake), openGate, 2, first.NextCursor)

	require.NoError(t, err)
	require.Len(t, fake.queries(), 1)
	cursorAt, ok := fake.queries()[0][3].(pgtype.Timestamp)
	require.True(t, ok)
	assert.True(t, cursorAt.Valid, "the page starts after the last version of the one before")
	assert.NotNil(t, fake.queries()[0][4])
}

func TestGetAddonsClampsTheLimit(t *testing.T) {
	for name, tc := range map[string]struct {
		limit int32
		want  int32
	}{
		"an unset limit is the default page":    {limit: 0, want: pagination.DefaultLimit + 1},
		"an oversized limit is capped":          {limit: 10_000, want: pagination.MaxLimit + 1},
		"a limit within the bounds is honoured": {limit: 7, want: 8},
	} {
		t.Run(name, func(t *testing.T) {
			fake := addonsFake(0)

			_, err := GetAddons(contextWithOrganization(t, uuid.New()), db.New(fake), openGate, tc.limit, nil)

			require.NoError(t, err)
			require.Len(t, fake.queries(), 1)
			rowLimit, ok := fake.queries()[0][5].(*int32)
			require.True(t, ok)
			assert.Equal(t, tc.want, *rowLimit)
		})
	}
}

// The catalogue sits behind the billing switch, as GET /addons does: where an
// organization may not reach billing, nothing of it is read.
func TestGetAddonsIsRefusedWhereBillingIsOff(t *testing.T) {
	fake := addonsFake(2)

	_, err := GetAddons(contextWithOrganization(t, uuid.New()), db.New(fake), gate.Gate{}, 2, nil)

	var refusal *apierrors.Error
	require.ErrorAs(t, err, &refusal)
	assert.Equal(t, gate.CodeDisabled, refusal.ErrorCode())
	assert.Empty(t, fake.queries(), "a refused request reads nothing")
}

func TestGetAddonsRefusesACursorThatIsNotOne(t *testing.T) {
	fake := addonsFake(2)
	cursor := "not-a-cursor"

	_, err := GetAddons(contextWithOrganization(t, uuid.New()), db.New(fake), openGate, 2, &cursor)

	var refusal *apierrors.Error
	require.ErrorAs(t, err, &refusal)
	assert.Equal(t, "Addons.InvalidCursor", refusal.ErrorCode())
	assert.Empty(t, fake.queries())
}

// GET .../prices answers 422 for a status that is not one; an empty list would read as
// "this version has no such price".
func TestAddonPricesRefuseAStatusThatIsNotOne(t *testing.T) {
	seats := uuid.New()
	fake := pricesFake()
	bogus := "BOGUS"

	_, errs := loadPrices(contextWithLoaders(t, uuid.New(), fake, 1), &bogus, seats)

	var refusal *apierrors.Error
	require.ErrorAs(t, errs[0], &refusal)
	assert.Equal(t, "Prices.InvalidStatus", refusal.ErrorCode())
	assert.Equal(t, 422, refusal.HTTPStatus())
	assert.Empty(t, fake.queries(), "a refused request reads nothing")
}

func TestGetAddonsNeedsAnIdentity(t *testing.T) {
	fake := addonsFake(2)

	_, err := GetAddons(t.Context(), db.New(fake), openGate, 2, nil)

	require.ErrorIs(t, err, dataloader.ErrMissingIdentity)
	assert.Empty(t, fake.queries())
}
