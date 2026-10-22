package main

import (
	"slices"
	"strings"

	"github.com/spf13/cobra"

	"github.com/kaitencloud/kaiten/api/pkg/scope"
)

// completeUserPermissions omits the platform-only/delete scopes that the older
// credential completer deliberately includes. Assignment and role permissions
// must come from OrganizationScopes, just like their module validation.
func completeUserPermissions(_ *cobra.Command, _ []string, toComplete string) ([]cobra.Completion, cobra.ShellCompDirective) {
	prefix, partial := splitCSVTail(toComplete)
	chosen := parseUserCSV(prefix)
	var completions []cobra.Completion
	for _, candidate := range scope.OrganizationScopes() {
		if strings.HasPrefix(candidate, partial) && !slices.Contains(chosen, candidate) {
			completions = append(completions, prefix+candidate)
		}
	}
	return completions, cobra.ShellCompDirectiveNoSpace | cobra.ShellCompDirectiveNoFileComp
}
