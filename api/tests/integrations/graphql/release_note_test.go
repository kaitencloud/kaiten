package graphql_test

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"
)

// TestGraphQL_ReleaseNoteIsNotExposed pins that a release's notes stay off
// GraphQL: the REST single-release read is the one surface that returns them,
// so a page of releases stays small on every surface. The Release type does
// not declare releaseNote, so asking for it fails validation, on the list and
// on the single read alike, before any resolver runs.
func TestGraphQL_ReleaseNoteIsNotExposed(t *testing.T) {
	for name, query := range map[string]string{
		"releases": `query { releases { items { id releaseNote } } }`,
		"release":  `query { release(slug: "any") { id releaseNote } }`,
	} {
		t.Run(name, func(t *testing.T) {
			body, err := json.Marshal(graphQLRequest{Query: query})
			require.NoError(t, err)

			req := httptest.NewRequest(http.MethodPost, "/api/graphql", strings.NewReader(string(body)))
			req.Header.Set("Content-Type", "application/json")
			resp, err := testServer.App.Test(req, fiber.TestConfig{})
			require.NoError(t, err)
			defer resp.Body.Close()

			raw, err := io.ReadAll(resp.Body)
			require.NoError(t, err)

			var gqlResp graphQLResponse
			require.NoError(t, json.Unmarshal(raw, &gqlResp), string(raw))
			require.NotEmpty(t, gqlResp.Errors, string(raw))
			require.Contains(t, gqlResp.Errors[0].Message, `Cannot query field "releaseNote" on type "Release"`)
		})
	}
}
