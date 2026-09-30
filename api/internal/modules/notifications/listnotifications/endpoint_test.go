package listnotifications

import (
	"context"
	"net/http"
	"testing"

	"github.com/danielgtaylor/huma/v2/humatest"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
)

// stubLister records the query the registrar built: the mapping from the query
// string to Query is what this file covers, the feed is tested where it lives.
type stubLister struct {
	got    *Query
	called int
}

func (s *stubLister) ListNotifications(_ context.Context, _ caller.OrganizationCaller, query Query) (schema.List, error) {
	s.got = &query
	s.called++

	return schema.List{Data: []schema.Notification{}, NextCursor: nil, UnreadCount: 0}, nil
}

func organizationContext() context.Context {
	return principal.ContextWithPrincipal(context.Background(), &principal.Principal{
		Kind:           principal.KindOrganization,
		UserID:         uuid.New(),
		OrganizationID: uuid.New(),
		Scopes:         []string{RequiredScope},
	})
}

func TestEndpointReadsRepeatedObjectTypes(t *testing.T) {
	t.Parallel()

	app := &stubLister{}
	_, api := humatest.New(t)
	RegisterEndpoint(api, app)

	// Repeated keys, the way a generated client sends an array.
	resp := api.GetCtx(organizationContext(), "/v1/notifications?objectType=instance&objectType=customer")

	require.Equal(t, http.StatusOK, resp.Code, resp.Body.String())
	require.NotNil(t, app.got)
	require.Equal(t, []catalogue.Object{catalogue.ObjectInstance, catalogue.ObjectCustomer}, app.got.Objects)
}

func TestEndpointWithoutObjectTypesFiltersNothing(t *testing.T) {
	t.Parallel()

	app := &stubLister{}
	_, api := humatest.New(t)
	RegisterEndpoint(api, app)

	resp := api.GetCtx(organizationContext(), "/v1/notifications")

	require.Equal(t, http.StatusOK, resp.Code, resp.Body.String())
	require.NotNil(t, app.got)
	require.Empty(t, app.got.Objects)
}

func TestEndpointRejectsAnObjectTypeItDoesNotKnow(t *testing.T) {
	t.Parallel()

	// A typo must not read as "no such notifications": an empty page would look
	// like a filter that worked.
	app := &stubLister{}
	_, api := humatest.New(t)
	RegisterEndpoint(api, app)

	resp := api.GetCtx(organizationContext(), "/v1/notifications?objectType=instances")

	require.GreaterOrEqual(t, resp.Code, http.StatusBadRequest, resp.Body.String())
	require.Less(t, resp.Code, http.StatusInternalServerError, resp.Body.String())
	require.Zero(t, app.called, "an invalid filter never reaches the feed")
}
