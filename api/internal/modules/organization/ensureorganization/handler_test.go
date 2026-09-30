package ensureorganization

import (
	"context"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"

	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// TestExecuteRejectsAnExternalIDThatTrimsToEmpty is the guard on the one input that
// cannot be caught downstream.
//
// externalid.DeriveOrganizationID("") returns a perfectly valid uuid, so the upsert
// would succeed and leave a nameless tenant that every later empty call converges on
// -- one row, shared, belonging to nobody. The endpoint's minLength:"1" refuses the
// empty string but not " ", and the two in-process drivers each check emptiness for
// their own reasons rather than for this one, so the check that has to hold for every
// caller lives here.
//
// The use case is built with a nil repository on purpose: reaching Postgres at all
// would panic, which is what proves the guard runs before the write rather than
// alongside it.
func TestExecuteRejectsAnExternalIDThatTrimsToEmpty(t *testing.T) {
	t.Parallel()

	useCase := &UseCase{}

	for name, externalID := range map[string]string{
		"empty":      "",
		"one space":  " ",
		"whitespace": " \t\n ",
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			organization, err := useCase.Execute(
				context.Background(), &Command{ExternalID: externalID, Name: "Kaiten"})

			require.Nil(t, organization)
			require.Error(t, err)
			require.Equal(t, ErrCodeMissingExternalID, kaitenerrors.GetCode(err))
			require.True(t, kaitenerrors.IsValidation(err))
			require.Equal(t, http.StatusBadRequest, kaitenerrors.GetHTTPStatus(err))
		})
	}
}
