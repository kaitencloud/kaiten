package graphql

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
)

func TestDisabledAIQueriesUseGraphQLErrorPresenterIncludingAliasesAndFragments(t *testing.T) {
	t.Parallel()
	app := newTestAppWithPrincipal(t, Config{}, &principal.Principal{Kind: principal.KindOrganization, UserID: uuid.New(), OrganizationID: uuid.New(), Scopes: []string{"read:models"}})
	for _, query := range []string{
		`query { catalogue: models { slug } }`,
		`query { ...Catalogue } fragment Catalogue on Query { models { slug } }`,
	} {
		body := postGraphQL(t, app, map[string]any{"query": query})
		var response struct {
			Errors []struct {
				Extensions struct {
					Code   string `json:"code"`
					Status int    `json:"status"`
				} `json:"extensions"`
			} `json:"errors"`
		}
		require.NoError(t, json.Unmarshal([]byte(body), &response))
		require.NotEmpty(t, response.Errors)
		for _, problem := range response.Errors {
			require.Equal(t, "AIUsage.Disabled", problem.Extensions.Code)
			require.Equal(t, 403, problem.Extensions.Status)
		}
	}
}
