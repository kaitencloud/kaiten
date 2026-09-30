package main

import (
	"errors"
	"fmt"
	"io"
	"log/slog"
	"strings"
	"time"

	"github.com/kaitencloud/kaiten/api/internal/shared/atomicfile"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
)

// What is left in this file is the part of credential handling that belongs to a
// CLI rather than to the domain: reading a lifetime off two flags, validating a CSV
// so it can say which entry was wrong, and getting the plaintext out of the process
// exactly once.

// emitCredential is the single place a plaintext credential leaves this process,
// and the reason main() points slog at stderr.
func emitCredential(out io.Writer, plaintext, outputFile string) error {
	if outputFile == "" {
		_, err := fmt.Fprintln(out, plaintext)
		return err
	}

	// The trailing newline is for the operator's benefit (`cat` of the file, a
	// `docker compose exec` shell reading it); pkg/secretfile.Read trims, so it
	// never reaches a comparison.
	if err := atomicfile.Write(outputFile, []byte(plaintext+"\n"), 0o600); err != nil {
		return fmt.Errorf("error writing the credential to %s: %w", outputFile, err)
	}

	// The path, never the value.
	slog.Info("credential written", "file", outputFile)
	return nil
}

// parseScopes validates the --scopes CSV. Required everywhere, with no implicit
// default: a credential whose scopes were chosen by a tool rather than by an
// operator is a credential nobody has decided the blast radius of.
//
// This is where scope validation happens for the credential commands, and it is the
// only place it happens for them: createplatformtoken takes its scopes as given and
// says why -- whoever splits the CSV is the only party that can report *which* entry
// was wrong, and a second check downstream would be a duplicate policy that never
// fires until the day the two disagree. mintorganizationtoken does re-validate,
// because it must also subset them against the caller's.
func parseScopes(csv string) ([]string, error) {
	fields := strings.Split(csv, ",")
	scopes := make([]string, 0, len(fields))
	for _, field := range fields {
		if trimmed := strings.TrimSpace(field); trimmed != "" {
			scopes = append(scopes, trimmed)
		}
	}

	if len(scopes) == 0 {
		return nil, errors.New("--scopes is required and must name at least one scope")
	}
	if err := scope.ValidateScopes(scopes); err != nil {
		return nil, err
	}

	return scopes, nil
}

// expiresIn converts a TTL into the absolute instant a credential expires at.
//
// UTC because the column behind it is `timestamp` without a zone and every other
// writer of it uses UTC. A *time.Time rather than the column's own pgtype.Timestamp:
// what a use case takes is an instant, and the persistence spelling of "no expiry"
// -- SQL NULL, which is nil here -- stops at the module boundary. That is why there
// is no `never()` left in this file: the absence of an expiry is the absence of a
// value, not a value that has to be constructed.
func expiresIn(ttl time.Duration) (*time.Time, error) {
	if ttl <= 0 {
		return nil, fmt.Errorf("--ttl must be a positive duration, got %s", ttl)
	}

	expiresAt := time.Now().UTC().Add(ttl)
	return &expiresAt, nil
}
