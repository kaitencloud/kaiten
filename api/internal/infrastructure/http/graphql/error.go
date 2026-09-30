package graphql

import (
	"context"
	"errors"
	"log/slog"
	"strings"

	"github.com/99designs/gqlgen/graphql"
	"github.com/google/uuid"
	"github.com/vektah/gqlparser/v2/ast"
	"github.com/vektah/gqlparser/v2/gqlerror"

	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// errOperationTimeout is the code a caller sees when its operation outran
// operationTimeout. It follows gqlgen's own extension vocabulary
// (COMPLEXITY_LIMIT_EXCEEDED and friends) rather than apierrors' kinds,
// because like those it describes the request rather than the domain.
const errOperationTimeout = "OPERATION_TIMEOUT"

// presentError is the GraphQL counterpart of the Huma error factory.
//
// Without it gqlgen falls back to DefaultErrorPresenter, which puts
// err.Error() straight into the response — and because GraphQL answers 200,
// a client's error handling does not even flag it. The JS SDK then
// concatenates those messages into an Error the browser reports, so a pgx
// failure ends up in a customer's telemetry.
//
// Resolvers return raw repository errors today, so the rule here is the
// same as on the REST side: a typed *apierrors.Error is client-safe and
// keeps its message and code; everything else is replaced by a generic
// message and logged behind a correlation id.
func presentError(ctx context.Context, err error) *gqlerror.Error {
	presented := graphql.DefaultErrorPresenter(ctx, err)

	var appErr *apierrors.Error
	if errors.As(err, &appErr) {
		presented.Message = appErr.Message
		setExtension(presented, "code", appErr.ErrorCode())
		setExtension(presented, "status", appErr.HTTPStatus())
		return presented
	}

	if isFrameworkError(presented) {
		return presented
	}

	// The operation ran past operationTimeout (see handler.go). It reaches here
	// as an ordinary resolver error -- pgx wraps the cancelled context -- and
	// the branch below would answer "An unexpected error occurred" and log a
	// correlation id for something that is neither unexpected nor a fault to
	// correlate. Naming it is also the only way a caller learns the difference
	// between a query that failed and one that was too slow to finish, which is
	// the difference between retrying and asking for less.
	if errors.Is(err, context.DeadlineExceeded) {
		presented.Message = "The operation exceeded the time it is allowed to run"
		setExtension(presented, "code", errOperationTimeout)
		return presented
	}

	errorID := uuid.NewString()
	slog.ErrorContext(
		ctx, "untyped error withheld from graphql response",
		slog.String("error_id", errorID),
		slog.String("path", presented.Path.String()),
		slog.String("error", err.Error()),
	)

	presented.Message = "An unexpected error occurred"
	setExtension(presented, "code", apierrors.KindInternal.String())
	setExtension(presented, "errorId", errorID)
	return presented
}

// isFrameworkError reports whether gqlgen raised this itself, rather than a
// resolver of ours.
//
// Those errors describe the *request* — it was too complex, it failed
// validation, it named a persisted query we do not hold, it asked for
// introspection we do not serve. None can carry a repository failure or a
// connection string, and withholding them is actively harmful: a client told
// only "An unexpected error occurred" cannot learn to send a smaller query.
//
// Two shapes, because gqlgen produces them two ways. Its handler extensions
// call errcode.Set, which lands a code in the extensions. Introspection
// instead fails inside the generated executor, so it arrives looking like any
// resolver error — but on the meta-schema fields, which are gqlgen's and never
// reach our code.
func isFrameworkError(presented *gqlerror.Error) bool {
	if presented.Extensions["code"] != nil {
		return true
	}

	if len(presented.Path) == 0 {
		return false
	}

	root, ok := presented.Path[0].(ast.PathName)
	return ok && strings.HasPrefix(string(root), "__")
}

func setExtension(err *gqlerror.Error, key string, value any) {
	if err.Extensions == nil {
		err.Extensions = map[string]any{}
	}
	err.Extensions[key] = value
}
