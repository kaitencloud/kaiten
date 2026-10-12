package graphql

import (
	"context"
	"errors"
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

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/http/graphql/dataloader"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
)

// fakeDBTX is a minimal db.DBTX fake: the prices are only ever read with Query. It
// records every statement's arguments, so that a test can assert how many round
// trips a page of versions makes.
type fakeDBTX struct {
	mu   sync.Mutex
	rows []pricesRow
	args [][]any
}

func (f *fakeDBTX) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, errors.New("fakeDBTX: Exec not supported")
}

func (f *fakeDBTX) Query(_ context.Context, _ string, args ...any) (pgx.Rows, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.args = append(f.args, args)
	return &fakeRows{rows: f.rows}, nil
}

func (f *fakeDBTX) QueryRow(context.Context, string, ...any) pgx.Row { return nil }

func (f *fakeDBTX) queries() [][]any {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.args
}

// pricesRow is a row of ListLicensePricesByLicenses, with what the tests read back.
type pricesRow struct {
	licenseID, id uuid.UUID
	status        db.PriceStatus
	// meters is the entitlement a metered price measures; empty on a flat fee.
	meters string
}

type fakeRows struct {
	rows []pricesRow
	next int
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
	return r.next <= len(r.rows)
}

// Scan fills the columns in the order ListLicensePricesByLicenses selects them.
func (r *fakeRows) Scan(dest ...any) error {
	row := r.rows[r.next-1]
	at := pgtype.Timestamp{Time: time.Date(2026, 10, 12, 9, 0, 0, 0, time.UTC), Valid: true}
	*dest[0].(*uuid.UUID) = row.licenseID
	*dest[1].(*uuid.UUID) = row.id
	*dest[2].(*db.BillingModel) = db.BillingModelFLATFEE
	*dest[3].(*db.BillingTiming) = db.BillingTimingADVANCE
	*dest[5].(*string) = "2900"
	*dest[6].(*string) = "EUR"
	*dest[8].(*string) = ""
	*dest[15].(*db.PriceStatus) = row.status
	*dest[17].(*pgtype.Timestamp) = at
	*dest[18].(*pgtype.Timestamp) = at
	if row.meters != "" {
		metered := uuid.New()
		factor := "1000"
		*dest[2].(*db.BillingModel) = db.BillingModelUSAGEBASED
		*dest[3].(*db.BillingTiming) = db.BillingTimingARREARS
		*dest[7].(**uuid.UUID) = &metered
		*dest[8].(*string) = factor
		*dest[9].(**string) = &row.meters
	}
	if row.status == db.PriceStatusDEPRECATED {
		*dest[16].(*pgtype.Timestamp) = at
	}
	return nil
}

func contextWithLoaders(t *testing.T, fake *fakeDBTX, organizationID uuid.UUID, batch int) context.Context {
	t.Helper()

	loaders := dataloader.NewLoaders(nil)
	loaders.Register(LicensePricesLoaderName, dataloaderLib.NewBatchedLoader(
		newLicensePricesBatchFn(db.New(fake)),
		dataloaderLib.WithBatchCapacity[uuid.UUID, []prices.Price](batch),
		dataloaderLib.WithWait[uuid.UUID, []prices.Price](time.Second),
	))
	ctx := principal.ContextWithPrincipal(t.Context(), &principal.Principal{OrganizationID: organizationID})

	return dataloader.ContextWithLoaders(ctx, loaders)
}

// TestLicensePricesOfAPageAreOneStatement is what a page of 200 versions asking for
// its prices costs: one statement, where the loader used to run one for each version.
func TestLicensePricesOfAPageAreOneStatement(t *testing.T) {
	organizationID := uuid.New()
	pro, enterprise, starter := uuid.New(), uuid.New(), uuid.New()
	monthly, tokens, retired := uuid.New(), uuid.New(), uuid.New()
	fake := &fakeDBTX{rows: []pricesRow{
		{licenseID: pro, id: monthly, status: db.PriceStatusACTIVE},
		{licenseID: pro, id: tokens, status: db.PriceStatusACTIVE, meters: "tokens"},
		{licenseID: enterprise, id: retired, status: db.PriceStatusDEPRECATED},
	}}
	ctx := contextWithLoaders(t, fake, organizationID, 3)

	byLicense := map[uuid.UUID][]prices.Price{}
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, id := range []uuid.UUID{pro, enterprise, starter} {
		wg.Go(func() {
			list, err := LoadLicensePrices(ctx, id, nil)
			require.NoError(t, err)
			mu.Lock()
			byLicense[id] = list
			mu.Unlock()
		})
	}
	wg.Wait()

	require.Len(t, fake.queries(), 1, "one statement for the prices of every version of the page")
	query := fake.queries()[0]
	assert.Equal(t, organizationID, query[0])
	assert.ElementsMatch(t, []uuid.UUID{pro, enterprise, starter}, query[1])

	require.Len(t, byLicense[pro], 2)
	assert.Equal(t, monthly, byLicense[pro][0].ID)
	assert.Equal(t, prices.ModelFlatFee, byLicense[pro][0].BillingModel)
	assert.Nil(t, byLicense[pro][0].Metered)
	assert.Equal(t, tokens, byLicense[pro][1].ID)
	require.NotNil(t, byLicense[pro][1].Metered, "a metered price keeps the entitlement it measures")
	assert.Equal(t, "tokens", byLicense[pro][1].Metered.EntitlementSlug)
	assert.Equal(t, "1000", byLicense[pro][1].Metered.SaleUnitFactor)

	require.Len(t, byLicense[enterprise], 1)
	assert.Equal(t, prices.StatusDeprecated, byLicense[enterprise][0].Status)
	assert.NotNil(t, byLicense[enterprise][0].DeprecatedAt)

	// A version nobody priced has an empty list of prices, never a missing one.
	assert.NotNil(t, byLicense[starter])
	assert.Empty(t, byLicense[starter])
}

func TestLicensePricesAreNarrowedToAStatusAfterTheyAreRead(t *testing.T) {
	pro := uuid.New()
	active, retired := uuid.New(), uuid.New()
	fake := &fakeDBTX{rows: []pricesRow{
		{licenseID: pro, id: active, status: db.PriceStatusACTIVE},
		{licenseID: pro, id: retired, status: db.PriceStatusDEPRECATED},
	}}
	ctx := contextWithLoaders(t, fake, uuid.New(), 1)
	deprecated, onSale := "DEPRECATED", "ACTIVE"

	list, err := LoadLicensePrices(ctx, pro, &deprecated)
	require.NoError(t, err)
	require.Len(t, list, 1)
	assert.Equal(t, retired, list[0].ID)

	list, err = LoadLicensePrices(ctx, pro, &onSale)
	require.NoError(t, err)
	require.Len(t, list, 1)
	assert.Equal(t, active, list[0].ID)
	assert.Len(t, fake.queries(), 1, "the version's prices of every status are read once")
}

func TestLicensePricesNeedAnIdentity(t *testing.T) {
	fake := &fakeDBTX{}
	loaders := dataloader.NewLoaders(nil)
	loaders.Register(LicensePricesLoaderName, dataloaderLib.NewBatchedLoader(
		newLicensePricesBatchFn(db.New(fake)),
		dataloaderLib.WithBatchCapacity[uuid.UUID, []prices.Price](1),
	))

	_, err := LoadLicensePrices(dataloader.ContextWithLoaders(t.Context(), loaders), uuid.New(), nil)

	require.ErrorIs(t, err, dataloader.ErrMissingIdentity)
	assert.Empty(t, fake.queries(), "nothing is read for a request with no organization")
}
