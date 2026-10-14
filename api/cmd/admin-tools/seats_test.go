package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// usageSink is the Kaiten a metered deployment reports to: it records every usage
// report, as "<instance> <entitlement> <delta>".
type usageSink struct {
	mu      sync.Mutex
	reports []string
}

func (s *usageSink) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Value struct {
			Value float64 `json:"value"`
		} `json:"value"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	// /api/instances/{instance}/entitlements/{entitlement}/usage
	if parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/"); len(parts) == 6 && parts[1] == "instances" {
		s.mu.Lock()
		s.reports = append(s.reports, parts[2]+" "+parts[4]+" "+strconv.FormatFloat(body.Value.Value, 'f', -1, 64))
		s.mu.Unlock()
	}

	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"entitlementSlug":"seats","value":{"type":"number","value":0}}`))
}

func (s *usageSink) seen() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]string(nil), s.reports...)
}

// The command runs the use case the Platform API runs, so it gives the seats back
// the way the endpoint does -- and before the process ends, which is the part the
// asynchronous report could otherwise lose.
func TestUserDeleteReleasesTheSeatsWhenMetered(t *testing.T) {
	dsn := requireTestDB(t).ConnectionString
	organization, externalID := memberOfANewOrganization(t)

	sink := &usageSink{}
	server := httptest.NewServer(sink)
	t.Cleanup(server.Close)

	tokenFile := filepath.Join(t.TempDir(), "token")
	require.NoError(t, os.WriteFile(tokenFile, []byte("ksh_test"), 0o600))
	t.Setenv("KAITEN_METERED_ENABLED", "true")
	t.Setenv("KAITEN_METERED_API_URL", server.URL)
	t.Setenv("KAITEN_METERED_TOKEN_FILE", tokenFile)

	result := runAdminTools(t, dsn, "user", "delete", "--external-id", externalID, "--yes")

	require.NoError(t, result.Err)
	assert.Equal(t, []string{organization.String() + " seats -1"}, sink.seen(),
		"the seat report must have left before the command returned")
	assert.NotContains(t, result.Logs, "were not released")
}

// Without metering the user is still deleted, and the command says the seats were
// not released rather than leaving an operator to find out from a count.
func TestUserDeleteSaysWhenItCannotReleaseTheSeats(t *testing.T) {
	dsn := requireTestDB(t).ConnectionString
	_, externalID := memberOfANewOrganization(t)
	t.Setenv("KAITEN_METERED_ENABLED", "")

	result := runAdminTools(t, dsn, "user", "delete", "--external-id", externalID, "--yes")

	require.NoError(t, result.Err)
	assert.Contains(t, result.Logs, "were not released")
}

// memberOfANewOrganization creates a user who is a live member of a new
// organization, and returns that organization and the user's external id.
func memberOfANewOrganization(t *testing.T) (uuid.UUID, string) {
	t.Helper()
	pool := requireTestDB(t).DbPool
	ctx := context.Background()

	organization, user := uuid.New(), uuid.New()
	externalID := "user_seat_" + user.String()
	_, err := pool.Exec(ctx, `INSERT INTO organization (id, external_id, name) VALUES ($1, $2, 'Seat org')`,
		organization, "org_seat_"+organization.String())
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO "user" (id, external_id, email, name) VALUES ($1, $2, $3, 'Seat user')`,
		user, externalID, externalID+"@example.com")
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO user_on_organization (user_id, organization_id) VALUES ($1, $2)`, user, organization)
	require.NoError(t, err)

	return organization, externalID
}
