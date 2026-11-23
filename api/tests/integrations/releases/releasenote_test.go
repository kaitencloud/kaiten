package releases_test

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/createrelease"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// releaseNoteMaxLength is the maxLength the Release schema declares on
// releaseNote, and the bound of the release_release_note_length_check
// constraint. Both count characters, not bytes.
const releaseNoteMaxLength = 62000

const sampleReleaseNote = "## Fixes\n\n- Faster start-up\n- See the [changelog](https://example.com/changelog)"

// postRelease creates a release through POST /api/releases and returns the
// response, which the caller closes.
func postRelease(t *testing.T, payload schema.Release) *http.Response {
	t.Helper()

	req := commonfixture.NewJSONRequest(t, http.MethodPost, "/api/releases", payload)
	resp, err := testServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	t.Cleanup(func() { _ = resp.Body.Close() })

	return resp
}

// getRaw issues a GET and returns the status and the raw body, so that a test
// can tell an absent key from a null one.
func getRaw(t *testing.T, path string) (int, []byte) {
	t.Helper()

	resp, err := testServer.App.Test(httptest.NewRequest(http.MethodGet, path, nil), fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)

	return resp.StatusCode, body
}

// jsonKeys decodes a JSON object's top-level keys.
func jsonKeys(t *testing.T, body []byte) map[string]json.RawMessage {
	t.Helper()

	var keys map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(body, &keys))

	return keys
}

func TestCreateRelease_ReleaseNote(t *testing.T) {
	resetDB := func() {
		require.NoError(t, testDb.Reset())
	}

	t.Run("WhenReleaseNoteIsGiven_StoresAndReturnsIt", func(t *testing.T) {
		t.Cleanup(resetDB)

		resp := postRelease(t, schema.Release{Version: "v1.0.0", ReleaseNote: ptr.To(sampleReleaseNote)})
		created := commonfixture.AssertJSONResponse[schema.Release](t, resp, fiber.StatusCreated)
		require.Equal(t, ptr.To(sampleReleaseNote), created.ReleaseNote)

		status, body := getRaw(t, "/api/releases/"+created.Slug)
		require.Equal(t, fiber.StatusOK, status)
		var fetched schema.Release
		require.NoError(t, json.Unmarshal(body, &fetched))
		require.Equal(t, ptr.To(sampleReleaseNote), fetched.ReleaseNote)

		var stored *string
		require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(),
			`SELECT release_note FROM release WHERE id = $1`, created.ID).Scan(&stored))
		require.Equal(t, ptr.To(sampleReleaseNote), stored)
	})

	t.Run("WhenReleaseNoteIsAbsent_OmitsItFromTheResponses", func(t *testing.T) {
		t.Cleanup(resetDB)

		resp := postRelease(t, schema.Release{Version: "v1.0.0"})
		body, err := io.ReadAll(resp.Body)
		require.NoError(t, err)
		require.Equal(t, fiber.StatusCreated, resp.StatusCode, string(body))
		require.NotContains(t, jsonKeys(t, body), "releaseNote")

		var created schema.Release
		require.NoError(t, json.Unmarshal(body, &created))

		status, fetched := getRaw(t, "/api/releases/"+created.Slug)
		require.Equal(t, fiber.StatusOK, status)
		require.NotContains(t, jsonKeys(t, fetched), "releaseNote")

		var stored *string
		require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(),
			`SELECT release_note FROM release WHERE id = $1`, created.ID).Scan(&stored))
		require.Nil(t, stored)
	})

	t.Run("WhenReleaseNoteIsAtTheLimit_AcceptsIt", func(t *testing.T) {
		t.Cleanup(resetDB)

		// Two-byte characters: the API and the database both count
		// characters, so a note at the limit passes both, though it is
		// twice as many bytes.
		note := strings.Repeat("é", releaseNoteMaxLength)

		resp := postRelease(t, schema.Release{Version: "v1.0.0", ReleaseNote: ptr.To(note)})
		created := commonfixture.AssertJSONResponse[schema.Release](t, resp, fiber.StatusCreated)
		require.Equal(t, ptr.To(note), created.ReleaseNote)
	})

	t.Run("WhenReleaseNoteIsLongerThanTheLimit_Returns422AndStoresNothing", func(t *testing.T) {
		t.Cleanup(resetDB)

		note := strings.Repeat("a", releaseNoteMaxLength+1)

		resp := postRelease(t, schema.Release{Version: "v1.0.0", ReleaseNote: ptr.To(note)})
		problem := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, resp, fiber.StatusUnprocessableEntity)

		locations := make([]string, 0, len(problem.Errors))
		for _, detail := range problem.Errors {
			locations = append(locations, detail.Location)
		}
		require.Contains(t, locations, "body.releaseNote")

		var count int
		require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(),
			`SELECT COUNT(*) FROM release WHERE organization_id = $1`, testDb.DefaultData.OrganizationID).Scan(&count))
		require.Zero(t, count, "a refused release must not be written")
	})

	t.Run("WhenTheDatabaseIsHandedALongerNote_TheConstraintRefusesIt", func(t *testing.T) {
		t.Cleanup(resetDB)

		// Below the API: the CHECK holds the same bound for any writer that
		// does not go through the request validation.
		repo := createrelease.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
		_, err := repo.CreateRelease(t.Context(), "v1.0.0", "v1-0-0", nil,
			ptr.To(strings.Repeat("a", releaseNoteMaxLength+1)),
			testDb.DefaultData.OrganizationID, testDb.DefaultData.UserID)

		var pgErr *pgconn.PgError
		require.ErrorAs(t, err, &pgErr)
		require.Equal(t, "23514", pgErr.Code, "check_violation")
		require.Equal(t, "release_release_note_length_check", pgErr.ConstraintName)
	})
}

func TestGetReleases_OmitsReleaseNote(t *testing.T) {
	t.Run("WhenAReleaseHasANote_TheListLeavesItOut", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		resp := postRelease(t, schema.Release{Version: "v1.0.0", ReleaseNote: ptr.To(sampleReleaseNote)})
		created := commonfixture.AssertJSONResponse[schema.Release](t, resp, fiber.StatusCreated)
		require.NotNil(t, created.ReleaseNote)

		status, body := getRaw(t, "/api/releases")
		require.Equal(t, fiber.StatusOK, status)

		var page pagination.Page[json.RawMessage]
		require.NoError(t, json.Unmarshal(body, &page))
		require.Len(t, page.Items, 1)
		item := jsonKeys(t, page.Items[0])
		require.Equal(t, `"`+created.Slug+`"`, string(item["slug"]))
		require.NotContains(t, item, "releaseNote")

		// The single read still carries it.
		status, single := getRaw(t, "/api/releases/"+created.Slug)
		require.Equal(t, fiber.StatusOK, status)
		require.Contains(t, jsonKeys(t, single), "releaseNote")
	})
}
