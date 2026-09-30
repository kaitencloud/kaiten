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
)
