package updateaddonfamily

// onlyMakePrivate removes public availability without changing billing terms.
func onlyMakePrivate(isPublic bool, increaseBilling string, cmd Command) bool {
	return isPublic && cmd.IsPublic != nil && !*cmd.IsPublic &&
		(cmd.IncreaseBilling == nil || *cmd.IncreaseBilling == increaseBilling)
}
