package apierrors

import (
	"errors"
	"fmt"
	"net/http"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
)

func TestIsForeignKeyViolation(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want bool
	}{
		{"Nil", nil, false},
		{"PlainError", errors.New("boom"), false},
		{"ForeignKeyViolation", &pgconn.PgError{Code: "23503"}, true},
		{"WrappedForeignKeyViolation", fmt.Errorf("delete license: %w", &pgconn.PgError{Code: "23503"}), true},
		// The two constraint classes must not be confused: a unique
		// violation is "already exists", a foreign key violation is
		// "still in use", and they carry different messages.
		{"UniqueViolation", &pgconn.PgError{Code: "23505"}, false},
		{"NotNullViolation", &pgconn.PgError{Code: "23502"}, false},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := IsForeignKeyViolation(c.err); got != c.want {
				t.Errorf("IsForeignKeyViolation(%v) = %t, want %t", c.err, got, c.want)
			}
			if got := IsUniqueViolation(c.err); c.want && got {
				t.Errorf("IsUniqueViolation(%v) = true, want false for a foreign key violation", c.err)
			}
		})
	}
}

// A foreign key violation reaches the client as 409, not the 500 an unmapped
// pgconn error falls through to.
func TestForeignKeyViolationMapsToConflict(t *testing.T) {
	err := fmt.Errorf("delete license: %w", &pgconn.PgError{
		Code:           "23503",
		ConstraintName: "instance_license_id_fkey",
	})

	if !IsForeignKeyViolation(err) {
		t.Fatalf("IsForeignKeyViolation(%v) = false, want true", err)
	}

	mapped := Conflict("DeleteLicense.InUseConflict", "License is still in use")
	if got := GetHTTPStatus(mapped); got != http.StatusConflict {
		t.Errorf("GetHTTPStatus(mapped) = %d, want %d", got, http.StatusConflict)
	}
	if got := GetCode(mapped); got != "DeleteLicense.InUseConflict" {
		t.Errorf("GetCode(mapped) = %q, want %q", got, "DeleteLicense.InUseConflict")
	}
	if got := GetHTTPStatus(err); got != http.StatusInternalServerError {
		t.Errorf("GetHTTPStatus(unmapped) = %d, want %d -- the 500 this mapping exists to avoid", got, http.StatusInternalServerError)
	}
}
