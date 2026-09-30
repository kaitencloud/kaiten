package ensureorganization

// Command is the organization to converge on, as an identity provider describes
// it.
//
// Carrying no struct tags is deliberate, for the same reason
// mintorganizationtoken.Command carries none: nothing serializes this type. The
// wire contract belongs to EnsureOrganizationBody in endpoint.go, which the
// registrar maps into this struct -- so the request document can name its fields
// the way JSON does and describe them for the schema, while the two in-process
// callers keep constructing a plain Go value.
type Command struct {
	// ExternalID is the identity provider's id for the organization, and the only
	// thing that identifies it here. The row's primary key is derived from this
	// value (externalid.DeriveOrganizationID), so the same external id always
	// converges on the same organization rather than creating a second one.
	ExternalID string

	// Name is the display name to give a newly created organization. It never
	// replaces an existing one's: empty means "the provider said nothing", which
	// leaves alone whatever name is stored -- including one a human set. Empty on
	// the insert path names the organization after its external id.
	Name string
}
