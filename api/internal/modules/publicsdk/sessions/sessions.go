// Package sessions is what the customer session use cases share.
//
// A customer session (kst_) is minted by a vendor's backend, with a ksh_
// holding write:customer_sessions, for one of its customers -- optionally one
// of that customer's instances -- and handed to the browser, which presents it
// on /api/public/session/* and nowhere else. Like a publishable key, only its
// SHA-256 digest is stored; unlike one, it lives 5 to 60 minutes.
package sessions

import (
	"context"
	"fmt"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/random"
	"github.com/kaitencloud/kaiten/api/internal/shared/token"
)

const (
	// MinTTLSeconds, MaxTTLSeconds and DefaultTTLSeconds bound a session's
	// life, as customer_session_ttl_check does.
	MinTTLSeconds     = 300
	MaxTTLSeconds     = 3600
	DefaultTTLSeconds = 1800

	bodyLength = 43
)

// Deps is what every session use case needs.
type Deps struct {
	UserProvider currentuser.Provider
	Uof          *uow.UnitOfWork
}

// Queries binds to the transaction ctx carries, or the pool.
func (d Deps) Queries(ctx context.Context) *db.Queries {
	return db.New(d.Uof.DBTX(ctx))
}

// Mint returns a new plaintext session token and its lookup digest.
func Mint() (plaintext, lookupHash string, err error) {
	plaintext, err = random.GeneratePrefixed(token.PrefixCustomerSession, bodyLength)
	if err != nil {
		return "", "", fmt.Errorf("customer session: %w", err)
	}
	return plaintext, token.LookupHash(plaintext), nil
}
