package token

// The two credential families Kaiten issues, and the reason they are spelled out
// in one place rather than inline at each comparison.
//
// They are siblings, not nested: they diverge at character 3, before any random
// body begins, so no organization token can ever be mistaken for a platform one
// or the reverse. That matters because the random body is base64url, whose
// alphabet includes '_' -- an earlier draft used the nested "ksh_adm_", where an
// ordinary "ksh_" token could legitimately begin with "adm_" and then
// authenticate on the wrong surface. With disjoint prefixes there is nothing to
// mitigate and no regeneration guard to write.
//
// The gateway matches these too (^Bearer ks[hm]_.* on the /api credential
// route), so a change here is a change there.
const (
	// PrefixOrganization marks a credential that carries an organization
	// execution context: a service-account access token.
	PrefixOrganization = "ksh_"

	// PrefixPlatform marks a platform credential -- Kaiten system machine. It
	// authenticates the platform identity and carries no organization context.
	// Deliberately says nothing about privilege: a leaked prefix should not
	// advertise what the credential can do.
	PrefixPlatform = "ksm_"

	// PrefixPublishableKey marks a publishable key: the credential a vendor's web
	// page sends, in X-Kaiten-Publishable-Key and never as a bearer token, to read
	// its public catalogue. It is not a secret. It diverges from the k-family at
	// character 0, and it is the documented exception to their equal length,
	// because the public @kaitencloud/client already fixes "pk_".
	PrefixPublishableKey = "pk_"

	// PrefixCustomerSession marks a customer session: minted by a vendor's
	// backend for one of its customers, presented by the browser as a bearer
	// token on /api/public/session/* and nowhere else. A k-family sibling of
	// equal length, diverging from ksh_ and ksm_ at character 2.
	PrefixCustomerSession = "kst_"
)
