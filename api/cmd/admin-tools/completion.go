// Shell completion for the values this CLI's flags actually take.
//
// It matters more here than on an ordinary CLI because the values are neither
// guessable nor safe to guess at: a scope is one of a closed set whose spelling
// the API rejects if it is off by a character, an organization is addressed by an
// identity provider's opaque external id (`org_2abcXYZ...`), and the destructive
// commands take those ids as their only argument. Completion turns "find the id in
// psql, paste it, hope" into pressing Tab, and it is the same closed set the
// server validates against rather than a list restated here.
//
// Cobra already registers a `completion` subcommand on every root command, so
// `kaiten-admin-tools completion bash|zsh|fish|powershell` needs nothing added.
//
// Every completer that reads the database fails SILENTLY -- an empty list and
// ShellCompDirectiveNoFileComp. A completer runs on a keystroke, in a shell,
// against whatever KAITEN_DATABASE_CONNECTION_STRING happens to be set to; a
// database that is unreachable or a schema that is behind must produce no
// suggestions, not an error message pasted into the middle of the line the
// operator is typing.
//
// The three database completers read through k.InProcess, the same three use cases
// their commands run on. Nothing here holds a query: the reads are the ones the
// domain published for the credential-free surface, so a completion can never offer
// a value the command it completes would then refuse to resolve.
package main

import (
	"strings"

	"github.com/spf13/cobra"

	"github.com/kaitencloud/kaiten/api/pkg/scope"
)

// completer is cobra's flag-completion signature.
type completer func(cmd *cobra.Command, args []string, toComplete string) ([]cobra.Completion, cobra.ShellCompDirective)

// mustCompleteFlag wires a completer and panics if the flag does not exist.
//
// A panic is right for this: it can only fire on a typo in a flag name in this
// file, it fires the first time the command tree is built -- which every test and
// every invocation does -- and the alternative is completion that silently stops
// working for one flag with nothing to notice it by.
func mustCompleteFlag(cmd *cobra.Command, flag string, fn completer) {
	if err := cmd.RegisterFlagCompletionFunc(flag, fn); err != nil {
		panic("admin-tools: cannot complete --" + flag + " on " + cmd.Name() + ": " + err.Error())
	}
}

// completeScopes completes a comma-separated scope list from pkg/scope, the same
// closed set ValidateScopes accepts.
//
// The list is generated, never restated: scope.AllScopes() is derived from the
// module and action constants, so a module added there shows up here without this
// file changing -- and a scope this completes is a scope the API will accept.
//
// It completes the LAST element of the CSV and carries the prefix through, so
// `--scopes read:customers,wr<Tab>` offers `read:customers,write:...`.
// ShellCompDirectiveNoSpace keeps the cursor on the value so another `,scope` can
// follow.
func completeScopes(_ *cobra.Command, _ []string, toComplete string) ([]cobra.Completion, cobra.ShellCompDirective) {
	prefix, partial := splitCSVTail(toComplete)

	already := make(map[string]bool)
	for _, chosen := range strings.Split(prefix, ",") {
		if trimmed := strings.TrimSpace(chosen); trimmed != "" {
			already[trimmed] = true
		}
	}

	var completions []cobra.Completion
	for _, candidate := range scope.AllScopes() {
		if already[candidate] || !strings.HasPrefix(candidate, partial) {
			continue
		}
		completions = append(completions, prefix+candidate)
	}

	return completions, cobra.ShellCompDirectiveNoSpace | cobra.ShellCompDirectiveNoFileComp
}

// splitCSVTail splits "a,b,pa" into ("a,b,", "pa"): everything already committed,
// and the element being typed.
func splitCSVTail(value string) (prefix, partial string) {
	if index := strings.LastIndex(value, ","); index >= 0 {
		return value[:index+1], value[index+1:]
	}
	return "", value
}

// completeOrganizationExternalIDs completes the id every organization-facing flag
// takes. The name is offered as the completion's description, because an external
// id is opaque and "org_2abcXYZ (TMNT HQ)" is the difference between confirming a
// destructive command and guessing at it.
//
// The same cross-tenant list `organization list` prints and resolveOrganizationID
// scans, filtered here by the prefix rather than in SQL: a completer that offered a
// tenant the command could not then resolve would be worse than one that offers
// nothing.
func completeOrganizationExternalIDs(cmd *cobra.Command, _ []string, toComplete string) ([]cobra.Completion, cobra.ShellCompDirective) {
	app, cleanup, err := openApplication(cmd.Context())
	if err != nil {
		return nil, cobra.ShellCompDirectiveNoFileComp
	}
	defer cleanup()

	organizations, err := app.InProcess().ListOrganizations(cmd.Context())
	if err != nil {
		return nil, cobra.ShellCompDirectiveNoFileComp
	}

	var completions []cobra.Completion
	for _, organization := range organizations {
		if !strings.HasPrefix(organization.ExternalID, toComplete) {
			continue
		}
		completions = append(completions, cobra.CompletionWithDesc(organization.ExternalID, organization.Name))
	}

	return completions, cobra.ShellCompDirectiveNoFileComp
}

// completeUserExternalIDs completes a user's external id, described by name and
// email so the operator can tell two support tickets apart.
//
// Prefix-filtered and capped in SQL rather than here, unlike the organization
// completer above: there is one row per person who has ever signed in, and a
// deployment can have far more of those than it has tenants. The cap lives with the
// query in the suggestusers package, which is also where the reasoning for its size
// is.
//
// system:kaiten is offered like any other user rather than filtered out: it is a
// real row an operator may be asking about, and the commands that must refuse it
// refuse it at the database, where the rule lives -- hiding it from completion
// would be a second, weaker copy of that rule.
func completeUserExternalIDs(cmd *cobra.Command, _ []string, toComplete string) ([]cobra.Completion, cobra.ShellCompDirective) {
	app, cleanup, err := openApplication(cmd.Context())
	if err != nil {
		return nil, cobra.ShellCompDirectiveNoFileComp
	}
	defer cleanup()

	candidates, err := app.InProcess().SuggestUsers(cmd.Context(), toComplete)
	if err != nil {
		return nil, cobra.ShellCompDirectiveNoFileComp
	}

	completions := make([]cobra.Completion, 0, len(candidates))
	for _, candidate := range candidates {
		completions = append(completions,
			cobra.CompletionWithDesc(candidate.ExternalID, describeUser(candidate.Name, candidate.Email)))
	}

	return completions, cobra.ShellCompDirectiveNoFileComp
}

// describeUser renders the one-line description beside a completed external id.
//
// The email is optional in the schema and appended only when it is actually there,
// so a user without one reads as "First Name" rather than "First Name <>".
func describeUser(name string, email *string) string {
	if email == nil || *email == "" {
		return name
	}

	return name + " <" + *email + ">"
}

// completeActivePlatformTokenNamesFlag is completeActivePlatformTokenNames as a
// FLAG completer, for `platform-token create --name`.
func completeActivePlatformTokenNamesFlag(cmd *cobra.Command, _ []string, toComplete string) ([]cobra.Completion, cobra.ShellCompDirective) {
	return completeActivePlatformTokenNames(cmd, nil, toComplete)
}

// completeActivePlatformTokenNames completes the argument `platform-token revoke`
// takes.
//
// Only ACTIVE credentials, and that is the point rather than a filter for
// tidiness: revoking a revoked credential is an error, and offering its name would
// walk the operator into it. `platform-token list` is where the retired ones are.
//
// "Active" is read as an absent RevokedAt, which is what the list use case reports
// and what the revoke use case looks for -- the two agree because there is one
// query behind both.
func completeActivePlatformTokenNames(cmd *cobra.Command, args []string, toComplete string) ([]cobra.Completion, cobra.ShellCompDirective) {
	if len(args) > 0 {
		// revoke takes exactly one name; a second word is not a name.
		return nil, cobra.ShellCompDirectiveNoFileComp
	}

	app, cleanup, err := openApplication(cmd.Context())
	if err != nil {
		return nil, cobra.ShellCompDirectiveNoFileComp
	}
	defer cleanup()

	tokens, err := app.InProcess().ListPlatformTokens(cmd.Context())
	if err != nil {
		return nil, cobra.ShellCompDirectiveNoFileComp
	}

	var completions []cobra.Completion
	for _, row := range tokens {
		if row.RevokedAt != nil || !strings.HasPrefix(row.Name, toComplete) {
			continue
		}
		completions = append(completions, cobra.CompletionWithDesc(row.Name, strings.Join(row.Scopes, ",")))
	}

	return completions, cobra.ShellCompDirectiveNoFileComp
}
