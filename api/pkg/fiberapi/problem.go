// Package fiberapi provides Fiber v3 HTTP glue for pkg/apierrors: RFC 9457
// Problem Details error responses and a generic body-parse-and-validate
// helper. Under pkg/ so every consumer renders errors identically instead of
// maintaining hand-synchronized copies.
package fiberapi

import (
	"errors"
	"log/slog"
	"strconv"

	"github.com/gofiber/fiber/v3"

	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Problem renders err as an RFC 9457 problem body.
//
// The body is apierrors.Problem — the very same type the Huma router
// publishes and emits — so a client sees one shape and reads the business
// code from one member (`code`) whichever router served the route.
func Problem(ctx fiber.Ctx, err error) error {
	problem := fromError(err, ctx.Path())

	logProblem(ctx, err, problem)

	var appErr *apierrors.Error
	if errors.As(err, &appErr) {
		if seconds := appErr.RetryAfterSeconds(); seconds > 0 {
			ctx.Set(fiber.HeaderRetryAfter, strconv.Itoa(seconds))
		}
	}

	// The content type has to be passed to JSON: setting the header first
	// does not survive, because JSON overwrites it with application/json.
	// That is why these responses were never actually served as
	// problem+json, despite the Set call this replaces.
	return ctx.Status(problem.Status).JSON(problem, problem.ContentType(fiber.MIMEApplicationJSON))
}

func fromError(err error, path string) *apierrors.Problem {
	var appErr *apierrors.Error
	if errors.As(err, &appErr) {
		return apierrors.ProblemFrom(appErr, path)
	}

	var fiberErr *fiber.Error
	if errors.As(err, &fiberErr) {
		return fromFiberError(fiberErr, path)
	}

	return apierrors.ProblemFrom(err, path)
}

// fromFiberError renders the errors Fiber itself raises (404 on an unknown
// route, 405, 413, ...). Their message is produced by the framework from
// the request, never from an internal failure, so it is safe as `detail`.
func fromFiberError(err *fiber.Error, path string) *apierrors.Problem {
	return apierrors.NewProblem(
		err.Code,
		apierrors.KindFromStatus(err.Code).String(),
		err.Message,
		path,
	)
}

func logProblem(ctx fiber.Ctx, err error, problem *apierrors.Problem) {
	attrs := []any{
		slog.String("type", problem.Type),
		slog.String("code", problem.Code),
		slog.Int("status", problem.Status),
		slog.String("path", problem.Instance),
		slog.String("error", err.Error()),
	}

	if problem.Status >= 500 {
		slog.ErrorContext(ctx.Context(), "server error", attrs...)
	} else if problem.Status >= 400 {
		slog.WarnContext(ctx.Context(), "client error", attrs...)
	}
}

// SetErrorHandler returns a Fiber error handler function that returns RFC
// 9457 Problem Details.
func SetErrorHandler() fiber.ErrorHandler {
	return func(ctx fiber.Ctx, err error) error {
		return Problem(ctx, err)
	}
}
