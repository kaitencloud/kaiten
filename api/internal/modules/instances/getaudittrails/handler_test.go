package getaudittrails

// White-box unit tests for UseCase.Execute — exercising timestamp parsing,
// nil-filter handling, cursor decoding, pagination defaults, and error
// propagation without a real database.

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// staticUserProvider returns a fixed user for tests.
type staticUserProvider struct {
	userID uuid.UUID
	orgID  uuid.UUID
}

func (s *staticUserProvider) GetUser(_ context.Context) (*currentuser.User, error) {
	return &currentuser.User{ID: s.userID, OrganizationID: s.orgID}, nil
}

// errUserProvider always fails.
type errUserProvider struct{}

func (e *errUserProvider) GetUser(_ context.Context) (*currentuser.User, error) {
	return nil, errors.New("auth error")
}

// captureRepository records what arguments were passed to List.
type captureRepository struct {
	trails       []*schema.AuditTrail
	err          error
	instanceSlug string
	orgID        uuid.UUID
	eventName    *string
	after        *time.Time
	before       *time.Time
	limitPlusOne int32
	cursor       *pagination.CreatedAtCursor
}

func (r *captureRepository) List(_ context.Context, instanceSlug string, orgID uuid.UUID, eventName *string, after, before *time.Time, limitPlusOne int32, cursor *pagination.CreatedAtCursor) ([]*schema.AuditTrail, error) {
	r.instanceSlug = instanceSlug
	r.orgID = orgID
	r.eventName = eventName
	r.after = after
	r.before = before
	r.limitPlusOne = limitPlusOne
	r.cursor = cursor
	return r.trails, r.err
}

var (
	testOrgID  = uuid.MustParse("11111111-1111-1111-1111-111111111111")
	testUserID = uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
)

func newTestHandler(provider currentuser.Provider, repo Repository) *UseCase {
	return &UseCase{
		deps:       Deps{UserProvider: provider},
		repository: repo,
	}
}

func okProvider() *staticUserProvider {
	return &staticUserProvider{userID: testUserID, orgID: testOrgID}
}

func TestHandler_Handle_PropagatesAuthError(t *testing.T) {
	repo := &captureRepository{}
	h := newTestHandler(&errUserProvider{}, repo)

	_, err := h.Execute(context.Background(), "my-instance", nil, nil, nil, 0, nil)

	require.EqualError(t, err, "auth error")
}

func TestHandler_Handle_PropagatesRepositoryError(t *testing.T) {
	repo := &captureRepository{err: errors.New("db down")}
	h := newTestHandler(okProvider(), repo)

	_, err := h.Execute(context.Background(), "my-instance", nil, nil, nil, 0, nil)

	require.EqualError(t, err, "db down")
}

func TestHandler_Handle_NilFiltersWhenStringsAreNil(t *testing.T) {
	repo := &captureRepository{trails: []*schema.AuditTrail{}}
	h := newTestHandler(okProvider(), repo)

	_, err := h.Execute(context.Background(), "my-instance", nil, nil, nil, 0, nil)

	require.NoError(t, err)
	require.Nil(t, repo.eventName)
	require.Nil(t, repo.after)
	require.Nil(t, repo.before)
	require.Nil(t, repo.cursor)
	require.Equal(t, "my-instance", repo.instanceSlug)
	require.Equal(t, testOrgID, repo.orgID)
}

func TestHandler_Handle_PassesEventNameFilter(t *testing.T) {
	repo := &captureRepository{trails: []*schema.AuditTrail{}}
	h := newTestHandler(okProvider(), repo)
	event := "kaiten.v1.entitlement.value.get"

	_, err := h.Execute(context.Background(), "my-instance", &event, nil, nil, 0, nil)

	require.NoError(t, err)
	require.NotNil(t, repo.eventName)
	require.Equal(t, event, *repo.eventName)
}

func TestHandler_Handle_ParsesAfterTimestamp(t *testing.T) {
	repo := &captureRepository{trails: []*schema.AuditTrail{}}
	h := newTestHandler(okProvider(), repo)
	ts := "2026-01-15T10:00:00Z"

	_, err := h.Execute(context.Background(), "my-instance", nil, &ts, nil, 0, nil)

	require.NoError(t, err)
	require.NotNil(t, repo.after)
	require.Equal(t, 2026, repo.after.Year())
	require.Equal(t, time.January, repo.after.Month())
	require.Equal(t, 15, repo.after.Day())
}

func TestHandler_Handle_ParsesBeforeTimestamp(t *testing.T) {
	repo := &captureRepository{trails: []*schema.AuditTrail{}}
	h := newTestHandler(okProvider(), repo)
	ts := "2026-03-01T00:00:00Z"

	_, err := h.Execute(context.Background(), "my-instance", nil, nil, &ts, 0, nil)

	require.NoError(t, err)
	require.NotNil(t, repo.before)
	require.Equal(t, 2026, repo.before.Year())
	require.Equal(t, time.March, repo.before.Month())
}

func TestHandler_Handle_InvalidAfterTimestamp_ReturnsError(t *testing.T) {
	repo := &captureRepository{}
	h := newTestHandler(okProvider(), repo)
	bad := "not-a-timestamp"

	_, err := h.Execute(context.Background(), "my-instance", nil, &bad, nil, 0, nil)

	require.Error(t, err)
}

func TestHandler_Handle_InvalidBeforeTimestamp_ReturnsError(t *testing.T) {
	repo := &captureRepository{}
	h := newTestHandler(okProvider(), repo)
	bad := "2026/01/01"

	_, err := h.Execute(context.Background(), "my-instance", nil, nil, &bad, 0, nil)

	require.Error(t, err)
}

func TestHandler_Handle_DefaultLimitAppliedWhenZero(t *testing.T) {
	repo := &captureRepository{trails: []*schema.AuditTrail{}}
	h := newTestHandler(okProvider(), repo)

	_, err := h.Execute(context.Background(), "my-instance", nil, nil, nil, 0, nil)

	require.NoError(t, err)
	require.Equal(t, pagination.DefaultLimit+1, repo.limitPlusOne)
}

func TestHandler_Handle_LimitCappedAtMax(t *testing.T) {
	repo := &captureRepository{trails: []*schema.AuditTrail{}}
	h := newTestHandler(okProvider(), repo)

	_, err := h.Execute(context.Background(), "my-instance", nil, nil, nil, 999, nil)

	require.NoError(t, err)
	require.Equal(t, pagination.MaxLimit+1, repo.limitPlusOne)
}

func TestHandler_Handle_ExplicitLimitForwardedAsLimitPlusOne(t *testing.T) {
	repo := &captureRepository{trails: []*schema.AuditTrail{}}
	h := newTestHandler(okProvider(), repo)

	_, err := h.Execute(context.Background(), "my-instance", nil, nil, nil, 10, nil)

	require.NoError(t, err)
	require.Equal(t, int32(11), repo.limitPlusOne)
}

func TestHandler_Handle_DecodesCursorAndForwardsToRepository(t *testing.T) {
	repo := &captureRepository{trails: []*schema.AuditTrail{}}
	h := newTestHandler(okProvider(), repo)
	want := pagination.CreatedAtCursor{CreatedAt: time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC), ID: uuid.New()}
	token, err := pagination.Encode(want)
	require.NoError(t, err)

	_, err = h.Execute(context.Background(), "my-instance", nil, nil, nil, 0, &token)

	require.NoError(t, err)
	require.NotNil(t, repo.cursor)
	require.True(t, want.CreatedAt.Equal(repo.cursor.CreatedAt))
	require.Equal(t, want.ID, repo.cursor.ID)
}

func TestHandler_Handle_InvalidCursor_ReturnsValidationError(t *testing.T) {
	repo := &captureRepository{}
	h := newTestHandler(okProvider(), repo)
	bad := "not-a-valid-cursor"

	_, err := h.Execute(context.Background(), "my-instance", nil, nil, nil, 0, &bad)

	require.Error(t, err)
	require.True(t, apierrors.IsValidation(err))
}

func TestHandler_Handle_ReturnsRepositoryResultsAsPage(t *testing.T) {
	expected := []*schema.AuditTrail{
		{ID: uuid.MustParse("00000000-0000-0000-0000-000000000001"), EventName: "kaiten.v1.entitlement.value.get"},
		{ID: uuid.MustParse("00000000-0000-0000-0000-000000000002"), EventName: "kaiten.v1.entitlement.value.get"},
	}
	repo := &captureRepository{trails: expected}
	h := newTestHandler(okProvider(), repo)

	result, err := h.Execute(context.Background(), "my-instance", nil, nil, nil, 0, nil)

	require.NoError(t, err)
	require.Equal(t, expected, result.Items)
	require.False(t, result.HasMore)
	require.Nil(t, result.NextCursor)
}

func TestHandler_Handle_MoreRowsThanLimit_ReportsHasMoreAndTrims(t *testing.T) {
	t1 := time.Date(2026, time.January, 3, 0, 0, 0, 0, time.UTC)
	t2 := time.Date(2026, time.January, 2, 0, 0, 0, 0, time.UTC)
	t3 := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)
	rows := []*schema.AuditTrail{
		{ID: uuid.MustParse("00000000-0000-0000-0000-000000000001"), Timestamp: t1},
		{ID: uuid.MustParse("00000000-0000-0000-0000-000000000002"), Timestamp: t2},
		{ID: uuid.MustParse("00000000-0000-0000-0000-000000000003"), Timestamp: t3}, // the limit+1 lookahead row
	}
	repo := &captureRepository{trails: rows}
	h := newTestHandler(okProvider(), repo)

	result, err := h.Execute(context.Background(), "my-instance", nil, nil, nil, 2, nil)

	require.NoError(t, err)
	require.Equal(t, rows[:2], result.Items)
	require.True(t, result.HasMore)
	require.NotNil(t, result.NextCursor)

	gotKey, err := pagination.Decode[pagination.CreatedAtCursor](*result.NextCursor)
	require.NoError(t, err)
	require.Equal(t, rows[1].ID, gotKey.ID)
}
