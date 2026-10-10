package huma

import (
	"errors"
	"log/slog"
	"net/http"
	"sync"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// setErrorHandlerOnce guards the huma.NewError / huma.NewErrorWithContext
// assignments below. They are package-level vars in huma itself — every
// call to SetErrorHandler (server.New runs once per Server, and tests
// construct many Servers, including in parallel) was racing to overwrite
// them. The closures capture no per-call state, so setting them exactly
// once for the process is behaviorally identical to reassigning them every
// time, and removes the race entirely.
var setErrorHandlerOnce sync.Once

// SetErrorHandler installs kaiten's error factory on huma.
//
// Replacing huma.NewError (and not only NewErrorWithContext) is what makes
// apierrors.Problem the error schema huma publishes: huma builds the
// schema for every declared error response from the value NewError returns
// (see defineErrors). One factory therefore fixes the emitted body and the
// documented body at the same time.
func SetErrorHandler() {
	setErrorHandlerOnce.Do(func() {
		huma.NewError = func(status int, msg string, errs ...error) huma.StatusError {
			return newError(nil, status, msg, errs...)
		}
		huma.NewErrorWithContext = newError
	})
}

// ConfigureErrors fills in the RFC 9457 `instance` member (the request
// path) on error bodies.
//
// It has to be a transformer rather than part of the error factory because
// apierrors.Error is a huma.StatusError: huma serializes such an error
// directly, without going through the factory, so the transformer is the
// only hook that sees both the body and the request. pkg/fiberapi sets the
// same member from ctx.Path().
func ConfigureErrors(config huma.Config) huma.Config {
	config.Transformers = append(config.Transformers, addProblemInstance)
	return config
}

func addProblemInstance(ctx huma.Context, _ string, v any) (any, error) {
	url := ctx.URL()
	switch body := v.(type) {
	case *kaitenerrors.Error:
		return kaitenerrors.ProblemFrom(body, url.Path), nil
	case *kaitenerrors.Problem:
		if body.Instance == "" {
			body.Instance = url.Path
		}
	}
	return v, nil
}

// newError renders an RFC 9457 problem body.
//
// Reaching it means the error was NOT already a huma.StatusError —
// apierrors.Error is one (see its GetStatus), so typed errors returned by a
// handler are rendered by huma directly and never come through here. What
// is left is huma's own request-validation failures, the middlewares that
// call huma.WriteErr, and genuinely untyped failures: pgx errors, strconv
// errors, anything a repository forgot to wrap. Their text describes
// internals — column names, constraint names, driver state — so it is
// withheld and logged behind a correlation id instead of echoed back.
func newError(ctx huma.Context, status int, msg string, errs ...error) huma.StatusError {
	instance := ""
	if ctx != nil {
		url := ctx.URL()
		instance = url.Path
	}

	// A typed error anywhere in the chain already carries a public message,
	// a machine-readable code and the real status; prefer it over the
	// status and message huma guessed.
	for _, err := range errs {
		var kaitenErr *kaitenerrors.Error
		if errors.As(err, &kaitenErr) {
			return kaitenerrors.ProblemFrom(kaitenErr, instance)
		}
	}

	model := kaitenerrors.NewProblem(status, kaitenerrors.KindFromStatus(status).String(), msg, instance)

	var withheld []error
	for _, err := range errs {
		// A nil error serializes as `"errors":[null]`, which breaks every client
		// reading errors[0]. Callers should never pass one; the factory must not
		// be able to emit it.
		if err == nil {
			continue
		}

		// huma's own validation details describe the caller's own request
		// ("expected required property id to be present"), so they are safe
		// — and they are the only reason the errors[] list exists.
		var detailer huma.ErrorDetailer
		if errors.As(err, &detailer) {
			detail := detailer.ErrorDetail()
			model.Errors = append(model.Errors, &kaitenerrors.ErrorDetail{
				Message:  detail.Message,
				Location: detail.Location,
				Value:    detail.Value,
			})
			continue
		}

		withheld = append(withheld, err)
	}

	if len(withheld) > 0 {
		model.ErrorID = uuid.NewString()
		logWithheld(ctx, model, withheld)
		return model
	}

	// A bound the schema publishes, for which the operation names its
	// Appendix A code (SchemaCodes).
	if status == http.StatusUnprocessableEntity && len(model.Errors) > 0 {
		return withSchemaCode(ctx, model, instance)
	}
	return model
}

func logWithheld(ctx huma.Context, model *kaitenerrors.Problem, withheld []error) {
	attrs := []any{
		slog.String("error_id", model.ErrorID),
		slog.Int("status", model.Status),
		slog.String("path", model.Instance),
		slog.String("error", errors.Join(withheld...).Error()),
	}

	if ctx == nil {
		slog.Error("untyped error withheld from response", attrs...)
		return
	}
	slog.ErrorContext(ctx.Context(), "untyped error withheld from response", attrs...)
}
