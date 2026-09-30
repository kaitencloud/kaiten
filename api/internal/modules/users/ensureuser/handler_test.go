package ensureuser

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

// newClaims is where the fallbacks and the trimming that used to live in
// internal/platform/jit ended up, so this is that package's firstNonEmpty test
// following the behaviour down rather than being deleted with it.
func TestNewClaims(t *testing.T) {
	t.Parallel()

	for name, tt := range map[string]struct {
		cmd  *Command
		want claims
	}{
		"provider claimed nothing": {
			cmd: &Command{Subject: "user_splinter", Email: "", Name: "", OrganizationID: uuid.Nil},
			want: claims{
				subject: "user_splinter",
				// Defaults for the insert path only...
				email: "user_splinter@jit.internal",
				name:  "user_splinter",
				// ...and empty claims, so an existing row keeps whatever a human set.
				emailClaim: "",
				nameClaim:  "",
			},
		},
		"whitespace is not a claim": {
			cmd: &Command{Subject: " user_splinter ", Email: "   ", Name: "\t", OrganizationID: uuid.Nil},
			want: claims{
				subject:    "user_splinter",
				email:      "user_splinter@jit.internal",
				name:       "user_splinter",
				emailClaim: "",
				nameClaim:  "",
			},
		},
		"provider claimed both": {
			cmd: &Command{
				Subject:        " user_splinter ",
				Email:          " splinter@tmnt.example ",
				Name:           " Master Splinter ",
				OrganizationID: uuid.Nil,
			},
			want: claims{
				subject:    "user_splinter",
				email:      "splinter@tmnt.example",
				name:       "Master Splinter",
				emailClaim: "splinter@tmnt.example",
				nameClaim:  "Master Splinter",
			},
		},
		"one claim does not default the other": {
			cmd: &Command{Subject: "user_splinter", Email: "splinter@tmnt.example", Name: "", OrganizationID: uuid.Nil},
			want: claims{
				subject:    "user_splinter",
				email:      "splinter@tmnt.example",
				name:       "user_splinter",
				emailClaim: "splinter@tmnt.example",
				nameClaim:  "",
			},
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tt.want, newClaims(tt.cmd))
		})
	}
}

// The synthetic domain is not a knob, and the test says so where the constant is
// read rather than where it is declared: rows already carry addresses under it, so
// changing it would give a user who logs in without an email claim a second,
// different synthetic address.
func TestProvisionedEmailDomainIsFrozen(t *testing.T) {
	t.Parallel()

	assert.Equal(t, "@jit.internal", provisionedEmailDomain)
}
