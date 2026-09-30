package ensureorganization

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/danielgtaylor/huma/v2/humatest"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/organization/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// stubEnsurer records the command the registrar built, which is the half of this
// operation that nothing else covers: the facade method and the use case are tested
// where they live, and what sits between them is the mapping from a JSON document to
// a tag-free Command.
type stubEnsurer struct {
	got          *Command
	organization *schema.Organization
	err          error
}

func (s *stubEnsurer) EnsureOrganization(
	_ context.Context, _ caller.PlatformCaller, cmd *Command,
) (*schema.Organization, error) {
	s.got = cmd

	return s.organization, s.err
}

// platformContext is a request context carrying an authenticated platform
// credential, because caller.Platform is the first thing the handler does and a
// request without one never reaches the mapping this file is about.
//
// The scope is on the principal only for realism; nothing in the chain under test
// checks it. Publication and enforcement of RequiredScope are asserted in
// tests/architecture, on both surfaces at once, which is the only place they can be
// compared.
func platformContext() context.Context {
	return principal.ContextWithPrincipal(context.Background(), &principal.Principal{
		Kind:            principal.KindPlatform,
		PlatformTokenID: uuid.New(),
		Scopes:          []string{RequiredScope},
	})
}

func TestEndpointMapsTheBodyIntoTheCommandAndReturnsTheOrganization(t *testing.T) {
	t.Parallel()

	stored := &schema.Organization{
		ID:         uuid.New(),
		ExternalID: "org_2abcDEF",
		Name:       "Kaiten",
	}
	app := &stubEnsurer{organization: stored}

	_, api := humatest.New(t)
	RegisterEndpoint(api, app)

	resp := api.PostCtx(platformContext(), "/platform/organizations", map[string]any{
		"externalId": "org_2abcDEF",
		"name":       "Kaiten",
	})

	// 200 on both the insert and the converge path -- see RegisterEndpoint on why
	// the operation does not distinguish them.
	require.Equal(t, http.StatusOK, resp.Code, resp.Body.String())
	require.NotNil(t, app.got)
	require.Equal(t, "org_2abcDEF", app.got.ExternalID)
	require.Equal(t, "Kaiten", app.got.Name)

	var body schema.Organization
	require.NoError(t, json.Unmarshal(resp.Body.Bytes(), &body))
	require.Equal(t, *stored, body)
}

// TestEndpointAcceptsABodyWithNoName pins that a name is optional on the wire, not
// merely tolerated: an omitted name means "the provider said nothing", which the use
// case turns into "keep whatever name is stored". Requiring it would force every
// caller that only wants to converge to send one, and sending one is how an existing
// organization's name gets overwritten by a caller that never meant to rename it.
func TestEndpointAcceptsABodyWithNoName(t *testing.T) {
	t.Parallel()

	app := &stubEnsurer{organization: &schema.Organization{ID: uuid.New(), ExternalID: "org_2abcDEF"}}

	_, api := humatest.New(t)
	RegisterEndpoint(api, app)

	resp := api.PostCtx(platformContext(), "/platform/organizations", map[string]any{
		"externalId": "org_2abcDEF",
	})

	require.Equal(t, http.StatusOK, resp.Code, resp.Body.String())
	require.NotNil(t, app.got)
	require.Empty(t, app.got.Name)
}

// TestEndpointRefusesABodyWithNoExternalID is the 422 in the operation's declared
// Errors: huma refuses the document before the handler runs, so the external id is
// required by the schema rather than by a check that could be reordered away.
//
// It stops the empty string and an absent field. It does not stop " ", which is why
// the use case carries ErrCodeMissingExternalID as well; the next test is that
// refusal arriving over the wire as the declared 400.
func TestEndpointRefusesABodyWithNoExternalID(t *testing.T) {
	t.Parallel()

	for name, body := range map[string]map[string]any{
		"absent": {"name": "Kaiten"},
		"empty":  {"externalId": ""},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			app := &stubEnsurer{organization: &schema.Organization{}}

			_, api := humatest.New(t)
			RegisterEndpoint(api, app)

			resp := api.PostCtx(platformContext(), "/platform/organizations", body)

			require.Equal(t, http.StatusUnprocessableEntity, resp.Code, resp.Body.String())
			require.Nil(t, app.got, "the request must be refused before it reaches the application")
		})
	}
}

// TestEndpointSurfacesTheUseCasesRefusalAsTheDeclared400 covers the status the
// operation declares for the guard the schema cannot express. A whitespace-only
// external id passes minLength and is refused by the use case, and this asserts the
// refusal arrives as a 400 carrying its code rather than as a 500.
func TestEndpointSurfacesTheUseCasesRefusalAsTheDeclared400(t *testing.T) {
	t.Parallel()

	app := &stubEnsurer{err: kaitenerrors.Validation(
		ErrCodeMissingExternalID, "the organization's external id is required")}

	_, api := humatest.New(t)
	RegisterEndpoint(api, app)

	resp := api.PostCtx(platformContext(), "/platform/organizations", map[string]any{
		"externalId": " ",
	})

	require.Equal(t, http.StatusBadRequest, resp.Code, resp.Body.String())
	require.Contains(t, resp.Body.String(), ErrCodeMissingExternalID)
}
