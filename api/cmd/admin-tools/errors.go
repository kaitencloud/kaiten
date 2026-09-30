// Driver-side error translation: what the domain refused, said in terms of what
// the operator in front of this shell typed and can do about it.
//
// A use case states a refusal in its own terms, and is right to. It knows the
// internal uuid it was handed, not the Clerk external id the operator wrote on the
// command line; and it cannot offer remediation that names a binary, because
// "run `kaiten-admin-tools migrate up`" is advice a module has no way to know is
// true -- createplatformtoken's own comment says so and leaves the advice to
// whoever wraps it. This file is that wrapper, for the six refusals where the
// difference is worth a different sentence, and nothing else: every other error
// reaches the operator exactly as the use case worded it.
//
// Keyed on the code, never on the message. apierrors.Error carries a Code
// precisely so a driver can branch without depending on prose, and the prose here
// is the half that is allowed to change. Kind would not do: the three
// CreatePlatformToken failures a caller can act on are all KindConflict, so
// IsConflict cannot tell "the platform identity is missing" from "that name is
// taken".
package main

import (
	"errors"
	"fmt"

	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// hasCode reports whether err, or anything it wraps, is an *apierrors.Error whose
// Code is code.
//
// errors.As rather than a type assertion because a use case may have wrapped its
// own refusal on the way out, and a driver that only recognised the outermost error
// would fall back to the domain's wording for reasons that have nothing to do with
// the domain. pkg/apierrors offers predicates for Kind and for the Postgres
// violations, but none for Code -- see the file comment on why Kind is too coarse
// for what this file does.
func hasCode(err error, code string) bool {
	var apiErr *apierrors.Error
	return errors.As(err, &apiErr) && apiErr.Code == code
}

// remapOrganizationDelete restates "no such organization row" as the outcome the
// operator was after.
//
// The use case reports a 404 naming the uuid, which is right on the wire and wrong
// here twice over: the operator named the tenant by external id, and this command
// resolved that id a moment ago, so a missing row means a concurrent delete rather
// than a typo -- which is the outcome they wanted either way.
func remapOrganizationDelete(err error, externalID string) error {
	if hasCode(err, "DeleteOrganization.NotFound") {
		return fmt.Errorf("organization %q was already deleted", externalID)
	}

	return err
}

// remapMembershipDelete restates "no such membership" in the two external ids the
// operator supplied, since the use case's message carries two uuids they never
// typed.
//
// The system:kaiten refusal is deliberately NOT remapped: deletemembership already
// words it as "the system:kaiten membership cannot be removed; delete the
// organization instead", which is the remediation this binary would have added.
func remapMembershipDelete(err error, organizationExternalID, userExternalID string) error {
	if hasCode(err, "DeleteMembership.NotFound") {
		return fmt.Errorf("user %q has no active membership in organization %q",
			userExternalID, organizationExternalID)
	}

	return err
}

// remapUserDelete restates "no such user row" the way remapOrganizationDelete does,
// and for the same reason: the id was resolved a moment ago, so this is a race whose
// outcome is the one that was asked for.
//
// deleteuser's system:kaiten refusal passes through untouched -- it already reads
// "the system:kaiten platform identity cannot be deleted".
func remapUserDelete(err error, externalID string) error {
	if hasCode(err, "DeleteUser.NotFound") {
		return fmt.Errorf("user %q was already deleted", externalID)
	}

	return err
}

// remapPlatformTokenCreate adds the two things a module cannot say.
//
// PlatformIdentityMissing means the row the insert resolves its owner from is not
// there, which from inside the module could be a rename or an unapplied migration.
// From here it is neither ambiguous nor merely informational: this binary ships
// those migrations, so it can name the command that fixes it.
//
// NameConflict already lists the three ways out, but spells the third as "replace
// it" because a use case cannot know what its driver calls the option. Here it has
// a name, and it is a flag rather than a suggestion.
// remapOrganizationTokenMint names the way out that only this driver has.
//
// MintOrganizationToken's NameConflict offers nothing, which is right on the
// wire: Replace is deliberately absent from MintOrganizationTokenBody, so
// pointing a client at it would name a field its published component does not
// carry. Here it is a flag, and an operator re-running a bootstrap meant to be
// idempotent is who should be told it exists.
//
// The tenant is named too, because this command takes --org and the operator
// may be looping over several.
//
// SystemMembershipMissing is deliberately NOT remapped: the use case logs the
// invariant breach with the organization id and main.go points slog at stderr,
// so the explanation already reaches this terminal from the code that knows it
// is true.
func remapOrganizationTokenMint(err error, name, organizationExternalID string) error {
	if hasCode(err, "MintOrganizationToken.NameConflict") {
		return fmt.Errorf(
			"a system:kaiten token named %q is already active in organization %q; "+
				"revoke it, choose another name, or pass --replace",
			name, organizationExternalID,
		)
	}

	return err
}

func remapPlatformTokenCreate(err error, name string) error {
	switch {
	case hasCode(err, "CreatePlatformToken.PlatformIdentityMissing"):
		return errors.New(
			"the system:kaiten platform identity does not exist - " +
				"run `kaiten-admin-tools migrate up` first",
		)

	case hasCode(err, "CreatePlatformToken.NameConflict"):
		return fmt.Errorf(
			"platform token %q already exists and is active; "+
				"revoke it, choose another name, or pass --replace", name,
		)

	default:
		return err
	}
}
