package catalogue

import (
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/infrastructure/db"
)

type grantWriteProbe struct {
	statements []string
	args       [][]any
}

func (p *grantWriteProbe) Exec(_ context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	p.statements = append(p.statements, sql)
	p.args = append(p.args, args)
	return pgconn.CommandTag{}, nil
}

func (*grantWriteProbe) Query(context.Context, string, ...any) (pgx.Rows, error) {
	panic("unexpected read")
}

func (*grantWriteProbe) QueryRow(context.Context, string, ...any) pgx.Row { panic("unexpected read") }

func TestOrdinaryReplacementPhysicallyLeavesPreservedAIGrantUntouched(t *testing.T) {
	ai, ordinary := uuid.New(), uuid.New()
	grants := []Grant{{EntitlementSlug: "hidden", EntitlementType: "NUMBER_AI_CREDIT", ModifierType: "UNLIMITED"}, {EntitlementSlug: "ordinary", EntitlementType: "NUMBER", ModifierType: "UNLIMITED"}}
	for _, off := range []bool{true, false} {
		probe := &grantWriteProbe{}
		require.NoError(t, WriteOperationalGrants(t.Context(), db.New(probe), "test", uuid.New(), uuid.New(), TypeBoost, grants, []uuid.UUID{ai, ordinary}, off))
		if off {
			require.Len(t, probe.statements, 2)
			require.True(t, strings.Contains(probe.statements[0], "e.type <> 'NUMBER_AI_CREDIT'"), "only ordinary relation rows may be replaced")
			require.Equal(t, ordinary, probe.args[1][3], "skipping a hidden grant must retain the resolved-ID alignment")
			for _, args := range probe.args[1:] {
				require.NotContains(t, args, ai, "no insert/delete/recreation of the hidden AI grant")
			}
		} else {
			require.Len(t, probe.statements, 3, "enabled replacements keep the original delete-all plus insert flow")
			require.Equal(t, ai, probe.args[1][3])
			require.Equal(t, ordinary, probe.args[2][3])
		}
	}
}
