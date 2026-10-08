package rating

import (
	"encoding/json"
	"math/rand/v2"
	"slices"
	"testing"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

var (
	addonPrice = uuid.MustParse("00000000-0000-0000-0000-0000000000c1")
	otherAddon = uuid.MustParse("00000000-0000-0000-0000-0000000000c2")
)

func testBase(seq int, amount int64) InvoiceLine {
	price := basePrice
	return InvoiceLine{Seq: seq, Type: LineBase, LicensePriceID: &price, Amount: amount, ServiceFrom: next.From, ServiceTo: next.To}
}

func testAddon(seq int, price uuid.UUID, amount int64) InvoiceLine {
	return InvoiceLine{Seq: seq, Type: LineAddon, AddonPriceID: &price, Amount: amount, ServiceFrom: next.From, ServiceTo: next.To}
}

func testUsage(seq int, amount int64) InvoiceLine {
	price := tokenPrice
	return InvoiceLine{Seq: seq, Type: LineUsage, LicensePriceID: &price, Amount: amount, ServiceFrom: elapsed.From, ServiceTo: elapsed.To}
}

func composition(lines ...InvoiceLine) Composition {
	var subtotal int64
	for _, line := range lines {
		subtotal += line.Amount
	}
	return Composition{Lines: lines, Subtotal: subtotal, DiscountTotal: 0, Total: subtotal}
}

func percentOff(name, value, appliesTo string) Discount {
	return Discount{
		InstanceVoucherID: uuid.New(), VoucherID: uuid.New(), Name: name, Type: DiscountPercentage, Value: dec(value),
		AppliesTo: appliesTo,
	}
}

func amountOff(name, minor, appliesTo string) Discount {
	return Discount{
		InstanceVoucherID: uuid.New(), VoucherID: uuid.New(), Name: name, Type: DiscountFixed, Value: dec(minor),
		Currency: "EUR", AppliesTo: appliesTo,
	}
}

func discountLines(t *testing.T, comp Composition, discounts ...Discount) []InvoiceLine {
	t.Helper()
	out, err := ApplyDiscounts(comp, discounts, "EUR")
	if err != nil {
		t.Fatalf("ApplyDiscounts: %v", err)
	}
	var lines []InvoiceLine
	for _, line := range out.Lines {
		if line.Type == LineDiscount {
			lines = append(lines, line)
		}
	}
	return lines
}

func requireAllocations(t *testing.T, line InvoiceLine, amount int64, want ...DiscountAllocation) {
	t.Helper()
	if line.Amount != amount {
		t.Fatalf("seq %d: amount %d, want %d", line.Seq, line.Amount, amount)
	}
	if !slices.Equal(line.Discount.Allocations, want) {
		t.Fatalf("seq %d: allocations %+v, want %+v", line.Seq, line.Discount.Allocations, want)
	}
}

// The worked example of CR-001 §3.4 (the spec's §8.4 example).
func TestDiscountAllocationsWorkedExample(t *testing.T) {
	comp := composition(testUsage(1, 400), testUsage(2, 100), testBase(3, 2900), testAddon(4, addonPrice, 1500))
	lines := discountLines(t, comp, percentOff("LAUNCH20", "20", AppliesLicenseBase), amountOff("WELCOME-5", "500", AppliesBoth))
	if len(lines) != 2 || lines[0].Seq != 5 || lines[1].Seq != 6 {
		t.Fatalf("two DISCOUNT lines, seq 5 and 6: %+v", lines)
	}
	requireAllocations(t, lines[0], -580, DiscountAllocation{TargetSeq: 3, Amount: 580})
	// 5.00 on BOTH comes off the base first, which still has 2 320.
	requireAllocations(t, lines[1], -500, DiscountAllocation{TargetSeq: 3, Amount: 500})
}

func TestDiscountAllocationsLargestRemainder(t *testing.T) {
	// 33 % of 1 001 and 1 002: 330.33 + 330.66 = 660.99, rounded to 661; the
	// unit left after the floors goes to the larger fraction.
	comp := composition(testBase(1, 1001), testAddon(2, addonPrice, 1002))
	lines := discountLines(t, comp, percentOff("THIRD", "33", AppliesBoth))
	requireAllocations(t, lines[0], -661, DiscountAllocation{TargetSeq: 1, Amount: 330}, DiscountAllocation{TargetSeq: 2, Amount: 331})
}

func TestDiscountAllocationsTieGoesToTheLowerSeq(t *testing.T) {
	// 50 % of 1 and 1: 0.5 + 0.5 = 1, one unit for two equal fractions.
	comp := composition(testBase(1, 1), testAddon(2, addonPrice, 1))
	lines := discountLines(t, comp, percentOff("HALF", "50", AppliesBoth))
	requireAllocations(t, lines[0], -1, DiscountAllocation{TargetSeq: 1, Amount: 1})
}

func TestDiscountAllocationsFixedAmountSpansTargets(t *testing.T) {
	// 5.00 over 2.00 and 10.00, in seq order.
	comp := composition(testBase(1, 200), testAddon(2, addonPrice, 1000))
	lines := discountLines(t, comp, amountOff("FIVE", "500", AppliesBoth))
	requireAllocations(t, lines[0], -500, DiscountAllocation{TargetSeq: 1, Amount: 200}, DiscountAllocation{TargetSeq: 2, Amount: 300})
}

func TestDiscountAllocationsSelectedPrices(t *testing.T) {
	comp := composition(testBase(1, 2900), testAddon(2, addonPrice, 1500), testAddon(3, otherAddon, 700))
	selected := percentOff("ADDON10", "10", AppliesSelected)
	selected.AddonPriceIDs = []uuid.UUID{otherAddon}
	lines := discountLines(t, comp, selected)
	requireAllocations(t, lines[0], -70, DiscountAllocation{TargetSeq: 3, Amount: 70})
}

func TestDiscountAllocationsNeverDiscountALineBelowZero(t *testing.T) {
	// 75 % then 100 % of a 2-cent base: 1.5 rounds to 2, and 0.5 to 1, which
	// the base no longer has. The second line is dropped, where the old
	// composition discounted 3 cents off a 2-cent line because the usage line
	// kept the total positive.
	comp := composition(testBase(1, 2), testUsage(2, 1000))
	lines := discountLines(t, comp, percentOff("A", "75", AppliesLicenseBase), percentOff("B", "100", AppliesLicenseBase))
	if len(lines) != 1 {
		t.Fatalf("the second discount has nothing left to take: %+v", lines)
	}
	requireAllocations(t, lines[0], -2, DiscountAllocation{TargetSeq: 1, Amount: 2})
}

func TestDiscountAllocationsCappedUnitMovesToAnotherTarget(t *testing.T) {
	// The first discount takes 0.5 + 0.5 -> 1, from seq 1 (the tie). The
	// second, 100 % of what is left (0.5 + 0.5), rounds to 1: seq 1 has no
	// room left, so the unit goes to seq 2 and the line keeps its amount.
	comp := composition(testBase(1, 1), testAddon(2, addonPrice, 1))
	lines := discountLines(t, comp, percentOff("A", "50", AppliesBoth), percentOff("B", "100", AppliesBoth))
	requireAllocations(t, lines[0], -1, DiscountAllocation{TargetSeq: 1, Amount: 1})
	requireAllocations(t, lines[1], -1, DiscountAllocation{TargetSeq: 2, Amount: 1})
}

func TestTrimTakesFromTheHighestTargetFirst(t *testing.T) {
	got := trim([]DiscountAllocation{{TargetSeq: 1, Amount: 300}, {TargetSeq: 2, Amount: 200}, {TargetSeq: 4, Amount: 50}}, 120)
	want := []DiscountAllocation{{TargetSeq: 1, Amount: 300}, {TargetSeq: 2, Amount: 130}}
	if !slices.Equal(got, want) {
		t.Fatalf("trim: %+v, want %+v", got, want)
	}
}

// L-7 over random compositions: allocations sum to each DISCOUNT line's
// magnitude, are positive, ascend, name only the line's targets, never take a
// target below 0, and do not depend on the order the lines come in.
func TestDiscountAllocationsInvariants(t *testing.T) {
	rng := rand.New(rand.NewPCG(1, 2)) //nolint:gosec // a reproducible property test, not a secret
	scopes := []string{AppliesLicenseBase, AppliesAddons, AppliesBoth, AppliesSelected}
	for round := range 2000 {
		lines := []InvoiceLine{testBase(1, rng.Int64N(5000))}
		addons := []uuid.UUID{addonPrice, otherAddon}
		for i := range rng.IntN(3) {
			lines = append(lines, testAddon(len(lines)+1, addons[i], rng.Int64N(3000)))
		}
		if rng.IntN(2) == 0 {
			lines = append(lines, testUsage(len(lines)+1, rng.Int64N(800)))
		}
		var discounts []Discount
		for range 1 + rng.IntN(4) {
			scope := scopes[rng.IntN(len(scopes))]
			var d Discount
			if rng.IntN(2) == 0 {
				d = percentOff("P", decimal.NewFromFloat(float64(1+rng.IntN(1000))/10).String(), scope)
			} else {
				d = amountOff("F", decimal.NewFromInt(1+rng.Int64N(4000)).String(), scope)
			}
			d.AddonPriceIDs = []uuid.UUID{otherAddon}
			discounts = append(discounts, d)
		}

		got := discountLines(t, composition(lines...), discounts...)
		amounts := map[int]int64{}
		for _, line := range lines {
			amounts[line.Seq] = line.Amount
		}
		taken := map[int]int64{}
		for _, line := range got {
			var sum int64
			for i, a := range line.Discount.Allocations {
				if a.Amount <= 0 || !slices.Contains(line.Discount.TargetSeqs, a.TargetSeq) ||
					(i > 0 && line.Discount.Allocations[i-1].TargetSeq >= a.TargetSeq) {
					t.Fatalf("round %d: allocation %+v of %+v", round, a, line.Discount)
				}
				sum += a.Amount
				taken[a.TargetSeq] += a.Amount
			}
			if sum != -line.Amount {
				t.Fatalf("round %d: allocations sum to %d, line is %d", round, sum, line.Amount)
			}
		}
		for seq, sum := range taken {
			if sum > amounts[seq] {
				t.Fatalf("round %d: seq %d discounted %d, it amounts to %d", round, seq, sum, amounts[seq])
			}
		}

		shuffled := slices.Clone(lines)
		rng.Shuffle(len(shuffled), func(i, j int) { shuffled[i], shuffled[j] = shuffled[j], shuffled[i] })
		again := discountLines(t, composition(shuffled...), discounts...)
		a, _ := json.Marshal(got)
		b, _ := json.Marshal(again)
		if string(a) != string(b) {
			t.Fatalf("round %d: the order of the lines changed the discounts:\n%s\n%s", round, a, b)
		}
	}
}
