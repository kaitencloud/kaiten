package outbox_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
)

func TestNewOutboxMessage(t *testing.T) {
	t.Parallel()

	organizationID := uuid.New()
	payload := map[string]string{"user_id": "user-456"}
	headers := map[string]string{"trace_id": "trace-789"}

	msg := outbox.NewOutboxMessage(organizationID, "USER_CREATED", "com.kaiten.user.v1.created", payload, headers)

	assert.Equal(t, organizationID, msg.OrganizationID)
	assert.Equal(t, "USER_CREATED", msg.EventName)
	assert.Equal(t, "com.kaiten.user.v1.created", msg.EventType)
	assert.Equal(t, payload, msg.Data)
	assert.Equal(t, headers, msg.Headers)
}

// Headers are optional, and the repository turns a nil Headers into SQL NULL
// (see marshalHeaders). The constructor must therefore hand nil through rather
// than substituting an empty map, which would be written as `{}` instead.
func TestNewOutboxMessageKeepsNilHeadersNil(t *testing.T) {
	t.Parallel()

	msg := outbox.NewOutboxMessage(uuid.New(), "USER_DELETED", "com.kaiten.user.v1.deleted", map[string]string{}, nil)

	assert.Nil(t, msg.Headers)
}

// Data is `any` on purpose: producers hand over their own event struct and the
// repository is what marshals it. The constructor must not narrow that -- these
// are the shapes real producers pass.
func TestNewOutboxMessageStoresAnyDataShapeUnchanged(t *testing.T) {
	t.Parallel()

	type event struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}

	tests := []struct {
		name string
		data any
	}{
		{name: "map of strings", data: map[string]string{"key": "value"}},
		{name: "map of mixed scalars", data: map[string]any{"string": "value", "int": 42, "bool": true, "float": 3.14}},
		{name: "nested map", data: map[string]any{"user": map[string]any{"id": "123", "tags": []string{"admin"}}}},
		{name: "producer struct", data: event{ID: "user-123", Name: "Alice"}},
		{name: "slice", data: []string{"item1", "item2"}},
		{name: "bare string", data: "simple string"},
		{name: "bare number", data: 42},
		{name: "bare bool", data: true},
		{name: "empty map", data: map[string]string{}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			msg := outbox.NewOutboxMessage(uuid.New(), "TEST_EVENT", "com.kaiten.test.v1", tt.data, nil)

			assert.Equal(t, tt.data, msg.Data)
		})
	}
}

func TestNewOutboxMessageAcceptsTheZeroOrganization(t *testing.T) {
	t.Parallel()

	msg := outbox.NewOutboxMessage(uuid.Nil, "", "", map[string]string{}, nil)

	assert.Equal(t, uuid.Nil, msg.OrganizationID)
	assert.Empty(t, msg.EventName)
	assert.Empty(t, msg.EventType)
}

// The empty-batch guard returns before the repository touches its queries, so a
// caller whose loop produced nothing does not need to check first. Passing nil
// queries is what proves the guard runs first: anything past it would panic.
func TestCreateOutboxEventsIsANoOpForAnEmptyBatch(t *testing.T) {
	t.Parallel()

	repo := outbox.NewOutboxRepository(nil)

	require.NoError(t, repo.CreateOutboxEvents(t.Context(), nil))
	require.NoError(t, repo.CreateOutboxEvents(t.Context(), []outbox.Outbox{}))
}
