package getlicensefamily

// includeVersions is the only value the include list accepts today. The
// endpoint's enum tag spells it again, since a tag cannot name a constant; the
// HTTP tests exercise both, through a list that repeats it and one that adds a
// value the enum refuses.
const includeVersions = "versions"

// Query carries what the caller asked for beyond the family itself.
//
// Version is nil for the ordinary read, which resolves the current version.
// Set, it means the caller is addressing one version deliberately and wants it
// whatever its lifecycle state -- so the resolution rule, and the
// NoPublishedVersion failure that goes with it, do not apply.
type Query struct {
	Version         *int32
	IncludeVersions bool
}
