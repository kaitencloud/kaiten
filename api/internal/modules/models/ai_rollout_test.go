package models_test

import (
	"context"
	"errors"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/archiveconversionrule"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/createconversionrule"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/getconversionrule"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/listconversionrules"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/updateconversionrule"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/createmodel"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/deletemodel"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/getmodel"
	modelsgraphql "github.com/kaitencloud/kaiten/api/internal/modules/models/graphql"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/listmodels"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/updatemodel"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage/aitest"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Nil repositories/transactions and commands are deliberate tripwires: an off
// request cannot read even a catalogue row, prepare pricing or emit an event.
func TestOmittedPoliciesDenyOwningAIOperationsBeforeDependencies(t *testing.T) {
	t.Parallel()
	user := &currentuser.StaticUserProvider{UserID: uuid.New(), OrganizationID: uuid.New()}
	cases := map[string]func(context.Context) error{
		"create model": func(ctx context.Context) error {
			_, err := createmodel.NewUseCase(createmodel.Deps{UserProvider: user}).Execute(ctx, nil)
			return err
		},
		"get model": func(ctx context.Context) error {
			_, err := getmodel.NewUseCase(getmodel.Deps{UserProvider: user}).Execute(ctx, "pool")
			return err
		},
		"list models": func(ctx context.Context) error {
			_, err := listmodels.NewUseCase(listmodels.Deps{UserProvider: user}).Execute(ctx, listmodels.Filter{}, 1, nil)
			return err
		},
		"update model": func(ctx context.Context) error {
			_, err := updatemodel.NewUseCase(updatemodel.Deps{UserProvider: user}).Execute(ctx, "pool", nil)
			return err
		},
		"delete model": func(ctx context.Context) error {
			return deletemodel.NewUseCase(deletemodel.Deps{UserProvider: user}).Execute(ctx, "pool")
		},
		"create rule": func(ctx context.Context) error {
			_, err := createconversionrule.NewUseCase(createconversionrule.Deps{UserProvider: user}).Execute(ctx, "license", nil)
			return err
		},
		"get rule": func(ctx context.Context) error {
			_, err := getconversionrule.NewUseCase(getconversionrule.Deps{UserProvider: user}).Execute(ctx, "license", uuid.New())
			return err
		},
		"list rules": func(ctx context.Context) error {
			_, err := listconversionrules.NewUseCase(listconversionrules.Deps{UserProvider: user}).Execute(ctx, "license", listconversionrules.Filter{})
			return err
		},
		"update rule": func(ctx context.Context) error {
			_, err := updateconversionrule.NewUseCase(updateconversionrule.Deps{UserProvider: user}).Execute(ctx, "license", uuid.New(), nil)
			return err
		},
		"archive rule": func(ctx context.Context) error {
			return archiveconversionrule.NewUseCase(archiveconversionrule.Deps{UserProvider: user}).Execute(ctx, "license", uuid.New())
		},
	}
	for name, run := range cases {
		t.Run(name, func(t *testing.T) {
			err := run(t.Context())
			var problem *apierrors.Error
			require.ErrorAs(t, err, &problem)
			require.Equal(t, "AIUsage.Disabled", problem.Code)
			require.Equal(t, http.StatusForbidden, problem.HTTPStatus())
		})
	}
	ctx := principal.ContextWithPrincipal(t.Context(), &principal.Principal{Kind: principal.KindOrganization, OrganizationID: user.OrganizationID, UserID: user.UserID})
	_, err := modelsgraphql.Models(ctx, nil, aiusage.Policy{}, nil)
	require.Equal(t, "AIUsage.Disabled", apierrors.GetCode(err))
}

type refusedIdentity struct{ err error }

func (p refusedIdentity) GetUser(context.Context) (*currentuser.User, error) { return nil, p.err }

func TestIdentityRefusalIsNotReplacedByRolloutReadiness(t *testing.T) {
	t.Parallel()
	refusal := errors.New("identity refused")
	for _, enabled := range []bool{false, true} {
		_, err := getmodel.NewUseCase(getmodel.Deps{UserProvider: refusedIdentity{refusal}, AIPolicy: aiusage.Policy{Flags: aitest.Flags(enabled)}}).Execute(t.Context(), "model")
		require.ErrorIs(t, err, refusal)
	}
}
