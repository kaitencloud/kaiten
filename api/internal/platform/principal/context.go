package principal

import "context"

type key struct{}

// ContextWithPrincipal returns a new Context that carries the principal.
func ContextWithPrincipal(ctx context.Context, p *Principal) context.Context {
	if ctx == nil {
		return nil
	}

	if p == nil {
		return ctx
	}

	return context.WithValue(ctx, key{}, p)
}

// FromContext returns the Principal value stored in ctx, if any.
func FromContext(ctx context.Context) (*Principal, bool) {
	if ctx == nil {
		return nil, false
	}

	p, ok := ctx.Value(key{}).(*Principal)

	return p, ok
}
