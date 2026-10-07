package attachinstanceaddon

import "context"

// AttachForSubscription attaches an add-on as part of a subscribe, inside its
// transaction (§9.1 step 2.3): the subscription row is already written, so the
// attach runs every rule a live subscription imposes, and the ACTIVATION
// invoice composed next bills it.
func (u *UseCase) AttachForSubscription(ctx context.Context, instanceSlug, addonSlug string, quantity int32) error {
	_, err := u.Execute(ctx, instanceSlug, NewInstanceAddon{AddonSlug: addonSlug, Quantity: quantity})
	return err
}
