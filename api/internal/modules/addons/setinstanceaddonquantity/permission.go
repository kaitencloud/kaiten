package setinstanceaddonquantity

// requireIncrease uses the already-read permission against the locked current
// quantity. It performs no network calls and keeps retirement available.
func requireIncrease(current, quantity int32, permission error) error {
	if quantity <= current {
		return nil
	}
	return permission
}
