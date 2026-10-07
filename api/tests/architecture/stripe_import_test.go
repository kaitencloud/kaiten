package architecture_test

import (
	"sort"
	"strings"
	"testing"
)

// stripeAdapter is the one package tree that may talk to Stripe: everything
// else reaches the provider through the provider.Adapter boundary, so that a
// new provider is a new adapter and Stripe's semantics never leak into
// billing (ADR §1, D-57(5)).
const stripeAdapter = "github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/stripe"

const stripeFake = stripeAdapter + "/stripefake"

func TestStripeGoIsImportedOnlyByTheStripeAdapter(t *testing.T) {
	var offenders []string
	for _, pkg := range loadModule(t) {
		if pkg.PkgPath == stripeAdapter || strings.HasPrefix(pkg.PkgPath, stripeAdapter+"/") {
			continue
		}
		for path := range pkg.Imports {
			if strings.HasPrefix(path, "github.com/stripe/stripe-go") {
				offenders = append(offenders, repoRelative(pkg.PkgPath)+" imports "+path)
			}
		}
	}
	sort.Strings(offenders)
	for _, o := range offenders {
		t.Errorf("%s: only %s may import stripe-go; go through provider.Adapter", o, repoRelative(stripeAdapter))
	}
}

// The fake Stripe answers whatever it is asked with Stripe's shapes: in a
// production binary it would be a payment provider that never collects.
func TestTheFakeStripeIsImportedByTestsOnly(t *testing.T) {
	for _, pkg := range loadModule(t) {
		if pkg.PkgPath == stripeFake {
			continue
		}
		if _, ok := pkg.Imports[stripeFake]; ok {
			t.Errorf("%s imports %s; only _test.go files may", repoRelative(pkg.PkgPath), repoRelative(stripeFake))
		}
	}
}
