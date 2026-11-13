package main

import (
	"net/url"
	"strings"
	"testing"
)

func TestDatabaseURLEscapesTheCredentials(t *testing.T) {
	raw := databaseURL("postgresql", "kai@ten", "p@ss:w/o#r%d", "kaiten", "schemas=public")

	u, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("the URL does not parse: %v", err)
	}
	password, _ := u.User.Password()
	if u.User.Username() != "kai@ten" || password != "p@ss:w/o#r%d" {
		t.Fatalf("credentials did not survive: user %q, password %q", u.User.Username(), password)
	}
	if u.Host != "db:5432" || u.Path != "/kaiten" || u.RawQuery != "schemas=public" {
		t.Fatalf("unexpected URL %q", raw)
	}
}

func TestCheckDBMLRefusesAnErrorReport(t *testing.T) {
	tables := "Table \"a\" {\n  \"id\" uuid\n}\n"

	for name, dbml := range map[string]string{
		"no table":               "  ERROR: Error: Can't find table \"usage_ledger\"\n",
		"an error after a table": tables + "\n  ERROR: Error: Can't find table \"usage_ledger\"\n",
	} {
		if err := checkDBML(dbml); err == nil {
			t.Errorf("%s: accepted", name)
		}
	}
	if err := checkDBML(tables); err != nil {
		t.Errorf("a schema was refused: %v", err)
	}
}

func TestCorrectCoveringIndexesKeepsTheKeyColumns(t *testing.T) {
	dbml := strings.Join([]string{
		`Table "checkout_session" {`,
		`  Indexes {`,
		`    (lookup_hash, organization_id, status) [type: btree, unique, name: "idx_checkout_session_lookup_hash"]`,
		`    (organization_id, created_at, id) [type: btree, name: "idx_checkout_session_organization_created_at"]`,
		`  }`,
		`}`,
		`Table "usage_ledger" {`,
		`  Indexes {`,
		`    (instance_id, entitlement_id, reported_at, report_seq, window_start) [type: btree, name: "idx_usage_ledger_pair_reported_at"]`,
		`  }`,
		`}`,
	}, "\n")
	listed := strings.Join([]string{
		"idx_checkout_session_lookup_hash\tCREATE UNIQUE INDEX idx_checkout_session_lookup_hash ON public.checkout_session USING btree (lookup_hash) INCLUDE (organization_id, status)",
		"idx_usage_ledger_pair_reported_at\tCREATE INDEX idx_usage_ledger_pair_reported_at ON public.usage_ledger USING btree (instance_id, entitlement_id, reported_at) INCLUDE (report_seq, window_start)",
	}, "\n")

	got, list, err := correctCoveringIndexes(dbml, listed)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{
		`    lookup_hash [type: btree, unique, name: "idx_checkout_session_lookup_hash"]`,
		`    (instance_id, entitlement_id, reported_at) [type: btree, name: "idx_usage_ledger_pair_reported_at"]`,
		`    (organization_id, created_at, id) [type: btree, name: "idx_checkout_session_organization_created_at"]`,
	} {
		if !strings.Contains(got, want+"\n") && !strings.HasSuffix(got, want) {
			t.Errorf("missing line %q in:\n%s", want, got)
		}
	}
	if strings.Count(list, "\n") != 1 || !strings.HasPrefix(list, "- `idx_checkout_session_lookup_hash`: `CREATE UNIQUE INDEX") {
		t.Errorf("unexpected list:\n%s", list)
	}

	if _, _, err := correctCoveringIndexes(dbml, "idx_missing\tCREATE INDEX idx_missing ON public.t USING btree (a) INCLUDE (b)"); err == nil {
		t.Error("an index missing from the DBML was accepted")
	}
}
