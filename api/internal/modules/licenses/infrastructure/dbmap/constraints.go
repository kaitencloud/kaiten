package dbmap

// DefaultMustBePublishedConstraint is the CHECK that keeps a family's
// default resolvable: is_default implies PUBLISHED. It arrives as SQLSTATE
// 23514, and three write paths map it to a 409 -- a version created as a
// draft default, an update claiming the default for an unpublished version,
// and an archive of the default. Declared once so that a typo in one of them
// cannot turn that 409 into a 500.
const DefaultMustBePublishedConstraint = "license_default_must_be_published_check"

// FamilyDefaultKeyConstraint is the partial unique index that allows
// one default per family. It arrives as SQLSTATE 23505 when two writes claim
// a family's default at once, and both the create and the update path map it
// to a 409 the caller can retry. Declared once for the same reason as the
// check above.
const FamilyDefaultKeyConstraint = "license_family_id_is_default_key"
