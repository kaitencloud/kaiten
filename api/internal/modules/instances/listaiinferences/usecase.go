package listaiinferences

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/aihistory"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
)

var RequiredScope = scope.Read(scope.Instances)

type UseCase struct{ Reader aihistory.Reader }

func (u UseCase) Execute(ctx context.Context, instance, pool string, filter aihistory.Filter) (schema.AiInferencePage, error) {
	return u.Reader.Inferences(ctx, instance, pool, filter)
}
