package apierrors

import (
	"errors"

	"github.com/jackc/pgx/v5/pgconn"
)

const (
	pgUniqueViolation     = "23505"
	pgForeignKeyViolation = "23503"
	pgRestrictViolation   = "23001"
	pgCheckViolation      = "23514"
)

// IsUniqueViolation returns true if the error is a PostgreSQL unique constraint violation.
func IsUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == pgUniqueViolation
	}
	return false
}

// IsUniqueViolationOnConstraint returns true if err is a PostgreSQL unique
// constraint violation on the specific named constraint (or unique index).
// Use this instead of IsUniqueViolation whenever a table carries more than
// one UNIQUE constraint -- e.g. a slug uniqueness index alongside a
// separate uniqueness rule on other columns -- so a caller doesn't mislabel
// one kind of conflict as the other.
func IsUniqueViolationOnConstraint(err error, constraintName string) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == pgUniqueViolation && pgErr.ConstraintName == constraintName
	}
	return false
}

// IsCheckViolationOnConstraint returns true if err is a PostgreSQL
// check_violation on the specific named CHECK constraint.
//
// Always constraint-scoped, with no unnamed variant: a table's CHECKs each
// state a different rule, so "some check failed" is never a message a caller
// can act on -- unlike a unique violation, where the conflicting value is
// usually enough. Reporting the wrong rule is worse than reporting none, which
// is why callers name the one they expect and let anything else fall through to
// a 500.
func IsCheckViolationOnConstraint(err error, constraintName string) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == pgCheckViolation && pgErr.ConstraintName == constraintName
	}
	return false
}

// IsRestrictViolation returns true if the error is a PostgreSQL
// restrict_violation. In this codebase that is raised deliberately by the
// triggers protecting the system:kaiten platform identity and its memberships:
// the database is the invariant, and a handler that sees this code is being told
// "this row is permanent", not "something went wrong".
//
// Handlers translate it rather than checking first, which is what keeps the
// guarantee race-free -- a check-then-delete could be overtaken between the two
// statements, and the trigger cannot be.
func IsRestrictViolation(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == pgRestrictViolation
	}
	return false
}

// IsForeignKeyViolation returns true if the error is a PostgreSQL foreign key
// constraint violation. In practice this is a delete refused by an ON DELETE
// RESTRICT reference from another table -- "this row is still in use" -- which
// is a caller-actionable conflict, not a server fault, so it belongs on the
// Conflict branch rather than falling through to a 500.
func IsForeignKeyViolation(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == pgForeignKeyViolation
	}
	return false
}

// IsMissingPartition returns true if err is PostgreSQL refusing a row that no
// partition of the partitioned table accepts ("no partition of relation ...
// found for row"). That error is a check_violation too, but it names no
// constraint, only the table, which is what tells the two apart without
// reading a message that a server locale could translate.
func IsMissingPartition(err error, table string) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == pgCheckViolation && pgErr.ConstraintName == "" && pgErr.TableName == table
	}
	return false
}
