package inbox_test

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/inbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/inbox/db"
)

// TestNewInboxMessage tests that the constructor populates every field as given.
func TestNewInboxMessage(t *testing.T) {
	t.Parallel()

	organizationID := uuid.New()
	source := "debezium:outbox_events"
	messageID := uuid.New().String()
	consumer := "audit-trail"

	msg := inbox.NewInboxMessage(organizationID, source, messageID, consumer)

	assert.Equal(t, organizationID, msg.OrganizationID)
	assert.Equal(t, source, msg.Source)
	assert.Equal(t, messageID, msg.MessageID)
	assert.Equal(t, consumer, msg.Consumer)
}

// fakeRow is a minimal pgx.Row fake that either yields a fixed UUID or a
// fixed error from Scan, letting MarkProcessed's two DB outcomes (row
// inserted vs. ON CONFLICT DO NOTHING yielding no row) be exercised without
// a live database.
type fakeRow struct {
	id  uuid.UUID
	err error
}

func (r fakeRow) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}
	id, ok := dest[0].(*uuid.UUID)
	if !ok {
		return errors.New("fakeRow: unsupported scan target")
	}
	*id = r.id
	return nil
}

// fakeDBTX is a minimal db.DBTX fake: MarkInboxEventProcessed only ever
// calls QueryRow, so Exec/Query are unused but required by the interface.
type fakeDBTX struct {
	row pgx.Row
}

func (f fakeDBTX) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, errors.New("fakeDBTX: Exec not supported")
}

func (f fakeDBTX) Query(context.Context, string, ...any) (pgx.Rows, error) {
	return nil, errors.New("fakeDBTX: Query not supported")
}

func (f fakeDBTX) QueryRow(context.Context, string, ...any) pgx.Row {
	return f.row
}

// TestInboxRepository_MarkProcessed_FirstDelivery tests that a fresh insert
// (a row is returned) is reported as "process it" (true, nil).
func TestInboxRepository_MarkProcessed_FirstDelivery(t *testing.T) {
	t.Parallel()

	wantID := uuid.New()
	queries := db.New(fakeDBTX{row: fakeRow{id: wantID}})
	repo := inbox.NewInboxRepository(queries)

	processed, err := repo.MarkProcessed(t.Context(), inbox.NewInboxMessage(uuid.New(), "debezium:outbox_events", wantID.String(), "audit-trail"))

	require.NoError(t, err)
	assert.True(t, processed, "first delivery of a message should be reported as newly processed")
}

// TestInboxRepository_MarkProcessed_DuplicateDelivery tests that a
// duplicate (ON CONFLICT DO NOTHING yields pgx.ErrNoRows) is reported as
// "skip it" (false, nil), not propagated as an error.
func TestInboxRepository_MarkProcessed_DuplicateDelivery(t *testing.T) {
	t.Parallel()

	queries := db.New(fakeDBTX{row: fakeRow{err: pgx.ErrNoRows}})
	repo := inbox.NewInboxRepository(queries)

	processed, err := repo.MarkProcessed(t.Context(), inbox.NewInboxMessage(uuid.New(), "debezium:outbox_events", uuid.New().String(), "audit-trail"))

	require.NoError(t, err)
	assert.False(t, processed, "a duplicate delivery should be reported as already processed, not an error")
}

// TestInboxRepository_MarkProcessed_OtherError tests that a non-ErrNoRows
// failure (e.g. a connection error) is propagated rather than swallowed.
func TestInboxRepository_MarkProcessed_OtherError(t *testing.T) {
	t.Parallel()

	wantErr := errors.New("connection reset")
	queries := db.New(fakeDBTX{row: fakeRow{err: wantErr}})
	repo := inbox.NewInboxRepository(queries)

	processed, err := repo.MarkProcessed(t.Context(), inbox.NewInboxMessage(uuid.New(), "debezium:outbox_events", uuid.New().String(), "audit-trail"))

	require.Error(t, err)
	assert.ErrorIs(t, err, wantErr)
	assert.False(t, processed)
}
