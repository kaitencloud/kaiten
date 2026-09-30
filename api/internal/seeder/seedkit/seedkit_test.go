package seedkit

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"

	"github.com/google/uuid"

	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
)

func TestForEachRunsAllItems(t *testing.T) {
	var count atomic.Int64
	items := []int{1, 2, 3, 4, 5, 6, 7}
	err := ForEach(context.Background(), 3, items, func(_ context.Context, _ int, item int) error {
		count.Add(int64(item))
		return nil
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got, want := count.Load(), int64(28); got != want {
		t.Fatalf("sum = %d, want %d", got, want)
	}
}

func TestForEachPropagatesError(t *testing.T) {
	sentinel := errors.New("boom")
	err := ForEach(context.Background(), 2, []int{1, 2, 3}, func(_ context.Context, _ int, item int) error {
		if item == 2 {
			return sentinel
		}
		return nil
	})
	if !errors.Is(err, sentinel) {
		t.Fatalf("error = %v, want %v", err, sentinel)
	}
}

func TestForEachNonPositiveLimitUsesDefault(t *testing.T) {
	var count atomic.Int64
	if err := ForEach(context.Background(), 0, []int{1, 1, 1}, func(_ context.Context, _ int, item int) error {
		count.Add(int64(item))
		return nil
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := count.Load(); got != 3 {
		t.Fatalf("count = %d, want 3", got)
	}
}

func TestResolveMembershipIDs(t *testing.T) {
	requestedOrganizationID := uuid.New()
	actualOrganizationID := uuid.New()
	requestedUserID := uuid.New()
	actualUserID := uuid.New()

	membership := resolveMembershipIDs(Membership{
		OrganizationID: requestedOrganizationID,
		UserID:         requestedUserID,
	}, map[uuid.UUID]uuid.UUID{
		requestedOrganizationID: actualOrganizationID,
	}, map[uuid.UUID]uuid.UUID{
		requestedUserID: actualUserID,
	})

	if membership.OrganizationID != actualOrganizationID {
		t.Fatalf("organization id = %s, want %s", membership.OrganizationID, actualOrganizationID)
	}
	if membership.UserID != actualUserID {
		t.Fatalf("user id = %s, want %s", membership.UserID, actualUserID)
	}
}

// TestLicenseCreationStateNeverAsksForArchived pins the mapping the profiles
// create their versions through: create-license refuses ARCHIVED, so a version
// meant to end archived is created PUBLISHED and archived afterwards, and every
// other state is created as it is.
func TestLicenseCreationStateNeverAsksForArchived(t *testing.T) {
	tests := []struct {
		final licenseschema.LifecycleState
		want  licenseschema.LifecycleState
	}{
		{final: "", want: ""},
		{final: licenseschema.Draft, want: licenseschema.Draft},
		{final: licenseschema.Published, want: licenseschema.Published},
		{final: licenseschema.Archived, want: licenseschema.Published},
	}
	for _, tc := range tests {
		if got := LicenseCreationState(tc.final); got != tc.want {
			t.Errorf("LicenseCreationState(%q) = %q, want %q", tc.final, got, tc.want)
		}
	}
}
