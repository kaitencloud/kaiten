// Package keys is what the publishable key use cases share: the resource
// shape, the rules a key's label and origins must satisfy, minting the
// plaintext, and the dependencies.
//
// A publishable key (pk_) is the credential a vendor's web page sends to read
// its public catalogue. It is not a secret -- it ships in page source -- so it
// is bounded by what it can reach (GET /api/public/catalog and nothing else)
// and by the browser origins allowed to send it. Only its SHA-256 digest is
// stored; the plaintext is returned once, at creation.
package keys

import (
	"context"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/random"
	"github.com/kaitencloud/kaiten/api/internal/shared/token"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const (
	// MaxLabelLength and MaxOrigins mirror the table's CHECK constraints, so a
	// bad request is a 422 naming the member rather than a constraint error.
	MaxLabelLength = 100
	MaxOrigins     = 50

	// bodyLength is 43 base64url characters: 32 random bytes and change.
	bodyLength = 43
	hintLength = 4
)

// PublishableKey is a key as the API returns it. The plaintext never appears
// here: see Created.
type PublishableKey struct {
	ID             uuid.UUID  `json:"id" readOnly:"true" doc:"Unique identifier of the key"`
	Label          string     `json:"label" doc:"What the key is for, to tell keys apart" example:"Marketing site"`
	KeyHint        string     `json:"keyHint" readOnly:"true" doc:"The last four characters of the key" example:"x9Qa"`
	AllowedOrigins []string   `json:"allowedOrigins" nullable:"false" doc:"Browser origins allowed to send the key. Empty: no browser origin may; requests without an Origin header (server-side rendering) still may." example:"[\"https://www.example.com\"]"`
	LastUsedAt     *time.Time `json:"lastUsedAt,omitempty" readOnly:"true" doc:"When the key last authenticated a request, to the minute"`
	CreatedAt      time.Time  `json:"createdAt" readOnly:"true"`
	UpdatedAt      time.Time  `json:"updatedAt" readOnly:"true"`
	RevokedAt      *time.Time `json:"revokedAt,omitempty" readOnly:"true" doc:"When the key was revoked; absent while it is live"`
}

// Created is a key at creation, the one time its plaintext is returned.
type PublishableKeyCreated struct {
	PublishableKey
	Key string `json:"key" readOnly:"true" doc:"The key itself. Shown once: only its digest is stored." example:"pk_3q2-7wEXAMPLEkeyBodyOfFortyThreeCharactersXyz"`
}

// Deps is what every key use case needs.
type Deps struct {
	UserProvider currentuser.Provider
	Uof          *uow.UnitOfWork
}

// Queries binds to the transaction ctx carries, or the pool.
func (d Deps) Queries(ctx context.Context) *db.Queries {
	return db.New(d.Uof.DBTX(ctx))
}

// Mint returns a new plaintext key, its lookup digest and its hint.
func Mint() (plaintext, lookupHash, hint string, err error) {
	plaintext, err = random.GeneratePrefixed(token.PrefixPublishableKey, bodyLength)
	if err != nil {
		return "", "", "", fmt.Errorf("publishable key: %w", err)
	}
	return plaintext, token.LookupHash(plaintext), plaintext[len(plaintext)-hintLength:], nil
}

// ValidateLabel trims and checks a label; <operation>.InvalidLabel otherwise.
func ValidateLabel(operation, label string) (string, error) {
	label = strings.TrimSpace(label)
	if n := len([]rune(label)); n < 1 || n > MaxLabelLength {
		return "", kaitenerrors.UnprocessableEntityf(operation+".InvalidLabel",
			"label must be 1 to %d characters", MaxLabelLength)
	}
	return label, nil
}

// NormalizeOrigins checks each origin is exactly scheme://host[:port] --
// https, or http for localhost -- and returns them lower-cased and without
// duplicates, in the order given. A browser sends its Origin in that exact
// form, which is what the authenticator compares against.
func NormalizeOrigins(operation string, origins []string) ([]string, error) {
	if len(origins) > MaxOrigins {
		return nil, kaitenerrors.UnprocessableEntityf(operation+".TooManyOrigins",
			"at most %d allowed origins", MaxOrigins)
	}
	out := make([]string, 0, len(origins))
	seen := make(map[string]bool, len(origins))
	for _, raw := range origins {
		origin, ok := normalizeOrigin(raw)
		if !ok {
			return nil, kaitenerrors.UnprocessableEntityf(operation+".InvalidOrigin",
				"%q is not an origin: expected https://host[:port], or http://localhost[:port]", raw)
		}
		if !seen[origin] {
			seen[origin] = true
			out = append(out, origin)
		}
	}
	return out, nil
}

func normalizeOrigin(raw string) (string, bool) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" ||
		(u.Path != "" && u.Path != "/") || u.Opaque != "" {
		return "", false
	}
	scheme := strings.ToLower(u.Scheme)
	host := strings.ToLower(u.Hostname())
	switch {
	case scheme == "https":
	case scheme == "http" && (host == "localhost" || host == "127.0.0.1" || host == "[::1]" || host == "::1"):
	default:
		return "", false
	}
	origin := scheme + "://" + strings.ToLower(u.Host)
	return origin, true
}

// NotFound is the answer for a key this organization does not have.
func NotFound(operation string, id uuid.UUID) error {
	return kaitenerrors.NotFoundf(operation+".NotFound", "publishable key %s not found", id)
}

// FromRow maps a stored key.
func FromRow(id uuid.UUID, label, hint string, origins []string, lastUsedAt, createdAt, updatedAt, revokedAt pgtype.Timestamp) PublishableKey {
	if origins == nil {
		origins = []string{}
	}
	return PublishableKey{
		ID:             id,
		Label:          label,
		KeyHint:        hint,
		AllowedOrigins: origins,
		LastUsedAt:     timePtr(lastUsedAt),
		CreatedAt:      createdAt.Time.UTC(),
		UpdatedAt:      updatedAt.Time.UTC(),
		RevokedAt:      timePtr(revokedAt),
	}
}

func timePtr(ts pgtype.Timestamp) *time.Time {
	if !ts.Valid {
		return nil
	}
	t := ts.Time.UTC()
	return &t
}
