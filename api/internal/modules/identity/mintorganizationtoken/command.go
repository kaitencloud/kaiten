package mintorganizationtoken

// Command is what a caller asks for, as opposed to MintOrganizationTokenBody,
// which is what an HTTP client sends.
//
// They carried the same three fields when this split was made, and were already
// two types then, because they answer to different things. MintOrganizationTokenBody
// is a published component in app/platform-openapi.yaml: its field names, its
// validation tags and its own name are a contract, and renaming it would move the
// document. Command is the use case's input, shared by every driver -- the HTTP
// endpoint, and kaiten-admin-tools, which reaches this operation through the facade
// with no request to parse.
//
// Replace is what that split was for: a field the operator's driver needs and the
// wire deliberately does not publish. Had these been one type, adding it would have
// added a property to a published component.
//
// Carrying no struct tags is deliberate: nothing serializes this type, and a json
// tag on it would be the first step toward a second, contradictable spelling of
// the wire contract.
type Command struct {
	// Name is the human-readable label. Unique per organization among the
	// platform identity's live credentials there, enforced by the token_name
	// constraint rather than by a read-then-write.
	Name string

	// Scopes narrow, never widen: empty inherits the calling credential's scopes,
	// and anything listed must be a subset of them. See resolveScopes.
	Scopes []string

	// TTL is a Go duration string ("15m", "24h"); empty mints a non-expiring
	// credential. It is a string rather than a time.Duration because the wire
	// contract is a string and the parse failure is a 422 the caller must see --
	// converting it here would move that error out of the use case that owns its
	// message.
	TTL string

	// Replace retires the platform identity's active credential of this Name in the
	// target organization, in the same transaction that writes the successor, and
	// succeeds whether or not there was one.
	//
	// Not on MintOrganizationTokenBody, and it must not be added there. What it does
	// on the wire is turn a 409 into a silent revocation: a client that mistyped a
	// name it did not realize was taken would retire a live credential some other
	// integration is authenticating with, and the conflict that would have told it so
	// is exactly what this suppresses. `kaiten-admin-tools service-token mint
	// --replace` is a different situation -- an operator at a shell who typed the
	// word, on a deployment they administer, re-running a bootstrap that is meant to
	// be idempotent.
	Replace bool
}
