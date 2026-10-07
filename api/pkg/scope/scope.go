package scope

import (
	"fmt"
	"slices"
	"strings"
)

// Module represents a resource module
type Module string

// Valid modules - add new modules here
const (
	FeatureFlags    Module = "feature_flags"
	Instances       Module = "instances"
	Licenses        Module = "licenses"
	Entitlements    Module = "entitlements"
	Components      Module = "components"
	Customers       Module = "customers"
	DeploymentZones Module = "deployment_zones"
	// MetadataFields gates the typed-metadata schema CRUD.
	//
	// SECURITY NOTE: the spec calls this gate "organization admin
	// only", but Kaiten has no first-class role concept today — so this is
	// enforced purely at the SCOPE level. Whoever holds `write:metadata_fields`
	// can mutate the schema, regardless of which end-user owns the token.
	// In practice this means "admin only" reduces to a token-attribution
	// policy: don't grant this scope to non-admin tokens.
	// TODO(roles): once a role concept lands, the facade method for each
	// metadata-fields write should require an org-admin role alongside the scope,
	// as defense in depth — the scope check stays for API-token callers. It goes
	// there rather than in a middleware so a non-HTTP driver cannot miss it.
	MetadataFields Module = "metadata_fields"
	Releases       Module = "releases"
	Users          Module = "users"
	Organizations  Module = "organizations"
	Tokens         Module = "tokens"
	// Webhooks gates outbound webhook subscriptions. No Core operation enforces
	// it: the outbound webhooks service does, on the same organization
	// credentials, because it talks to Svix directly instead of forwarding to
	// this API. It is an organization scope all the same (see
	// OrganizationScopes).
	Webhooks Module = "webhooks"
	// Memberships gates delete:memberships only — removing a single user's
	// membership on an organization is a narrower, separately-grantable
	// privilege from delete:organizations (whole org) or delete:users
	// (the user account itself).
	Memberships Module = "memberships"
	// Notifications gates a person's own notification feed and preferences.
	//
	// Every operation under it reads or writes only the caller's own rows, so it
	// is narrower than the other modules here: holding it grants nothing about
	// anybody else's data. It is still a scope rather than "any authenticated
	// caller", because the scope claim is how this API decides what a credential
	// may do, and an API token minted for a robot should not carry a human's
	// unread state by default.
	//
	// DEPLOYMENT NOTE: the `scopes` claim of an end-user JWT is produced by the
	// identity provider's template, so read:notifications
	// and write:notifications have to be added there before a signed-in user can
	// reach the feed -- otherwise the endpoints answer 403 and the bell stays
	// empty with nothing in the logs to explain it.
	Notifications Module = "notifications"
	// Billing gates subscriptions, invoices, the invoice handoff queue and their
	// exports, and the organization's billing settings. Licence prices and the
	// invoice preview stay on Licenses: they describe the catalogue, not what an
	// organization's customers owe.
	//
	// DEPLOYMENT NOTE: like Notifications, read:billing and write:billing have to
	// be added to the identity provider's JWT template before a signed-in user
	// can reach a billing screen.
	Billing Module = "billing"
	// Addons gates the add-on catalogue: families, versions, their prices,
	// grants and compatible licence families. Attaching an add-on to an
	// instance stays on Instances: it changes what the instance is entitled
	// to, like changing its licence.
	//
	// DEPLOYMENT NOTE: like Billing, read:addons and write:addons have to be
	// added to the identity provider's JWT template.
	Addons Module = "addons"
	// Vouchers gates the voucher catalogue, the listing of redemptions and
	// their revocation.
	Vouchers Module = "vouchers"
	// VoucherRedemptions gates validating and redeeming a code, and reading an
	// instance's redemptions: a backend that redeems codes for its customers
	// does not need to be able to create them.
	//
	// DEPLOYMENT NOTE: like Billing, the read: and write: scopes of Vouchers
	// and VoucherRedemptions have to be added to the identity provider's JWT
	// template.
	VoucherRedemptions Module = "voucher_redemptions"
	// PublishableKeys gates issuing, listing, editing and revoking the pk_
	// keys a vendor's web pages use to read its public catalogue. Reading the
	// catalogue with one needs no scope: a key authorizes that one route and
	// nothing else.
	//
	// DEPLOYMENT NOTE: like Billing, read:publishable_keys and
	// write:publishable_keys have to be added to the identity provider's JWT
	// template before the console can manage keys.
	PublishableKeys Module = "publishable_keys"
	// CustomerSessions gates minting and revoking the kst_ sessions a vendor's
	// backend hands to its customers' browsers. Only write: is used -- a
	// session is never listed. What a session may do needs no scope: it is
	// bound to its customer, and to the /api/public/session routes.
	//
	// DEPLOYMENT NOTE: a vendor backend mints sessions with a ksh_ token, so
	// write:customer_sessions must be granted to that token; add it to the
	// identity provider's JWT template too for the console to revoke one.
	CustomerSessions Module = "customer_sessions"
)

// allModules is the single source of truth for valid modules
var allModules = []Module{
	FeatureFlags,
	Instances,
	Licenses,
	Entitlements,
	Components,
	Customers,
	DeploymentZones,
	MetadataFields,
	Releases,
	Users,
	Organizations,
	Tokens,
	Webhooks,
	Memberships,
	Notifications,
	Billing,
	Addons,
	Vouchers,
	VoucherRedemptions,
	PublishableKeys,
	CustomerSessions,
}

// Error codes a scope refusal answers with. They live here, next to the scopes
// themselves, because the refusal and the scope it is about are one decision:
// internal/platform/caller.Require is the only thing that makes it now, but these
// codes predate it, when the same condition was decided by one middleware per
// router and the two disagreed on both the code and the status.
//
// That history is the reason they are still constants rather than literals in
// caller.Require. A code is a wire contract -- clients branch on it, and
// tests/integrations pins it -- so it outlives whichever layer produces it, and
// the next driver to need one should find it here rather than write a fourth
// spelling.
const (
	// ErrCodeNoIdentity is returned when the request carries no usable
	// principal at all. That is an AUTHENTICATION failure, so it answers
	// 401: a client that sees 403 does not refresh its token.
	ErrCodeNoIdentity = "Auth.NoIdentity"
	// ErrCodeMissingScope is returned when the principal is valid but the
	// token does not carry the scope the operation requires.
	ErrCodeMissingScope = "Auth.MissingScope"
	// ErrMsgNoIdentity accompanies ErrCodeNoIdentity. It lives here for the same
	// reason the codes do: it is answered from two places that have no layer in
	// common -- caller.Require, for a zero-value caller that holds no credential,
	// and caller.Organization/caller.Platform, for a request that carries no
	// principal at all -- and a message that is a literal in each of them is a
	// message that eventually differs between them.
	ErrMsgNoIdentity = "no identity found in context"
)

// MissingScopeMessage is the message accompanying ErrCodeMissingScope. A
// function rather than a prefix constant, so a caller cannot assemble it
// slightly differently.
func MissingScopeMessage(required string) string {
	return "missing required scope: " + required
}

// Read, Write and Delete compose a scope from an action and a module.
//
// Composition is a function call rather than a set of exported prefix constants,
// for the same reason MissingScopeMessage is a function: a caller that assembles
// "action:module" itself is a caller that can assemble it slightly differently.
//
// Each operation names the result once, in a RequiredScope declared in its own use
// case package, which the endpoint registrar and the facade both reference. That
// declaration is a var and not a const because a function call is not a constant
// expression in Go -- and the way to make it one would be to export the prefixes,
// which puts the composition back in a hundred places to save a keyword. The
// OFREP endpoints have declared theirs this way since they were written; the rest
// followed.

// Read returns a read scope for the given module (e.g., "read:licenses")
func Read(module Module) string {
	return "read:" + string(module)
}

// Write returns a write scope for the given module (e.g., "write:licenses")
func Write(module Module) string {
	return "write:" + string(module)
}

// Delete returns a delete scope for the given module (e.g., "delete:organizations").
// Deliberately NOT implied by write:<module> (unlike read, which write implies) —
// see HasScope. A token needs delete:<module> explicitly; holding write:<module>
// alone is not enough. write:* (WriteAll) still grants it, same as everything else.
func Delete(module Module) string {
	return "delete:" + string(module)
}

// validActions returns all valid actions
func validActions() []string {
	return []string{"read", "write", "delete"}
}

// validModules returns all valid modules
func validModules() []Module {
	return allModules
}

// AllScopes returns all valid scope combinations
func AllScopes() []string {
	var scopes []string
	for _, action := range validActions() {
		for _, module := range validModules() {
			scopes = append(scopes, action+":"+string(module))
		}
	}
	return scopes
}

// platformOnlyModules are the modules an organization credential can never use:
// only Platform API operations enforce them, and that surface answers a `ksm_`
// platform token alone. A service-account token granted one of them would carry a
// right that nothing it can reach ever checks.
var platformOnlyModules = []Module{Users, Memberships}

// OrganizationModules returns the modules an organization credential -- a user's
// JWT, or a service account's `ksh_` token -- can be granted, in declaration
// order: every module but the platform-only ones.
func OrganizationModules() []Module {
	modules := make([]Module, 0, len(allModules))
	for _, module := range allModules {
		if !slices.Contains(platformOnlyModules, module) {
			modules = append(modules, module)
		}
	}
	return modules
}

// OrganizationScopes returns every scope an organization credential can usefully
// carry, sorted: read and write on each of OrganizationModules. Delete is left
// out, because every operation that requires a delete scope is a Platform one.
//
// This list, and not the scopes the Core operations declare, is what a token
// picker has to offer. A scope can be enforced outside this API -- the outbound
// webhooks service checks read:/write:webhooks on the `ksh_` tokens it
// receives, and no Core operation does -- but never outside this package, since
// a token is minted only with scopes ValidateScopes accepts. The Core document
// publishes the list on its security scheme, as x-kaiten-scopes, for clients to
// build on.
func OrganizationScopes() []string {
	modules := OrganizationModules()
	scopes := make([]string, 0, 2*len(modules))
	for _, module := range modules {
		scopes = append(scopes, Read(module), Write(module))
	}
	slices.Sort(scopes)
	return scopes
}

// wildcard represents all modules
const wildcard = "*"

// ReadAll returns a read scope for all modules (e.g., "read:*")
func ReadAll() string {
	return "read:" + wildcard
}

// WriteAll returns a write scope for all modules (e.g., "write:*")
func WriteAll() string {
	return "write:" + wildcard
}

// IsValidScope validates a single scope string (e.g., "read:licenses" or "read:*")
func IsValidScope(s string) bool {
	// Check for empty string
	if s == "" {
		return false
	}

	parts := strings.Split(s, ":")
	if len(parts) != 2 {
		return false
	}

	// Explicitly check for empty parts
	action := strings.TrimSpace(parts[0])
	module := strings.TrimSpace(parts[1])

	if action == "" || module == "" {
		return false
	}

	if !isValidAction(action) {
		return false
	}

	if module == wildcard {
		return true
	}

	return isValidModule(Module(module))
}

func isValidAction(action string) bool {
	for _, a := range validActions() {
		if a == action {
			return true
		}
	}
	return false
}

func isValidModule(module Module) bool {
	for _, m := range allModules {
		if m == module {
			return true
		}
	}
	return false
}

// ValidateScopes validates an array of scopes and returns an error with invalid ones
func ValidateScopes(scopes []string) error {
	var invalid []string
	for _, s := range scopes {
		if !IsValidScope(s) {
			invalid = append(invalid, s)
		}
	}
	if len(invalid) > 0 {
		return fmt.Errorf("invalid scopes: %v. Valid format is <action>:<module> where action is [%s] and module is [%s, %s]",
			invalid,
			strings.Join(validActions(), ", "),
			modulesToString(validModules()),
			wildcard)
	}
	return nil
}

func modulesToString(modules []Module) string {
	strs := make([]string, len(modules))
	for i, m := range modules {
		strs[i] = string(m)
	}
	return strings.Join(strs, ", ")
}

// HasScope checks if a user's scopes include the required scope.
// Rules:
// - write:* grants all read and write permissions
// - read:* grants all read permissions
// - write:<module> implies read:<module> (write grants read access)
func HasScope(userScopes []string, required string) bool {
	for _, scope := range userScopes {
		if scope == required {
			return true
		}

		// Check for wildcard permissions
		if scope == WriteAll() {
			// write:* grants all read and write permissions
			return true
		}
		if scope == ReadAll() && strings.HasPrefix(required, "read:") {
			// read:* grants all read permissions
			return true
		}

		// write implies read: if we have write:X and need read:X, it's allowed
		if strings.HasPrefix(required, "read:") {
			module := strings.TrimPrefix(required, "read:")
			if scope == "write:"+module {
				return true
			}
		}
	}
	return false
}

// HasAllScopes checks if a user's scopes include ALL the required scopes
func HasAllScopes(userScopes []string, required []string) bool {
	for _, scope := range required {
		if !HasScope(userScopes, scope) {
			return false
		}
	}
	return true
}
