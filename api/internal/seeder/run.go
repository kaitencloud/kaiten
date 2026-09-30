package seeder

import (
	"context"
	"fmt"
	"log/slog"
	"sort"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/platform/platformidentity"
)

type RunOptions struct {
	OrganizationIDs []uuid.UUID
	UsageReporter   services.UsageReporter
}

type TargetOrganization struct {
	ID          uuid.UUID
	Name        string
	OwnerUserID uuid.UUID
}

type OrganizationScopedProfile interface {
	Profile
	SeedOrganizations(ctx context.Context, sc *SeederContext, organizations []TargetOrganization) error
}

// ConvergentProfile is a profile that brings existing data onto its current
// definition instead of accumulating, so re-running it is the point rather than
// a hazard.
type ConvergentProfile interface {
	Profile
	// Converges reports that this profile is safe — and meant — to re-run.
	Converges()
}

func converges(profile Profile) bool {
	_, ok := profile.(ConvergentProfile)
	return ok
}

func Run(ctx context.Context, pool *pgxpool.Pool, profiles []Profile, opts RunOptions) error {
	if len(opts.OrganizationIDs) > 0 {
		return runForOrganizations(ctx, pool, profiles, opts.OrganizationIDs, opts.UsageReporter)
	}

	if err := EnsureTrackerTable(ctx, pool); err != nil {
		return fmt.Errorf("error initializing seeder tracker: %w", err)
	}

	sc := NewSeederContext(pool, opts.UsageReporter)
	for _, profile := range profiles {
		alreadyRun, err := HasRun(ctx, pool, profile.Name())
		if err != nil {
			return fmt.Errorf("error checking seeder state for %q: %w", profile.Name(), err)
		}
		if alreadyRun && !converges(profile) {
			slog.Info("⏭️  Profile already seeded, skipping.", "profile", profile.Name())
			continue
		}

		if alreadyRun {
			slog.Info("🔁 Profile already seeded — re-running to converge.", "profile", profile.Name())
		} else {
			slog.Info("▶️  Seeding profile...", "profile", profile.Name())
		}
		if err := profile.Seed(ctx, sc); err != nil {
			return fmt.Errorf("error seeding profile %q: %w", profile.Name(), err)
		}

		if err := MarkAsRun(ctx, pool, profile.Name()); err != nil {
			return fmt.Errorf("error recording seeder run for %q: %w", profile.Name(), err)
		}
		slog.Info("🎉 Profile seeded successfully!", "profile", profile.Name())
	}

	return nil
}

func runForOrganizations(ctx context.Context, pool *pgxpool.Pool, profiles []Profile, organizationIDs []uuid.UUID, usageReporter services.UsageReporter) error {
	scopedProfiles := make([]OrganizationScopedProfile, 0, len(profiles))
	for _, profile := range profiles {
		scopedProfile, ok := profile.(OrganizationScopedProfile)
		if !ok {
			return fmt.Errorf("profile %q does not support organization-scoped seeding", profile.Name())
		}
		scopedProfiles = append(scopedProfiles, scopedProfile)
	}

	targetOrganizations, err := loadTargetOrganizations(ctx, pool, organizationIDs)
	if err != nil {
		return err
	}

	if err := cleanupTargetOrganizations(ctx, pool, organizationIDs); err != nil {
		return err
	}

	sc := NewSeederContext(pool, usageReporter)
	for _, profile := range scopedProfiles {
		slog.Info("▶️  Seeding profile for existing organizations...", "profile", profile.Name(), "organizations", organizationIDs)
		if err := profile.SeedOrganizations(ctx, sc, targetOrganizations); err != nil {
			return fmt.Errorf("error seeding profile %q for organizations: %w", profile.Name(), err)
		}
		slog.Info("🎉 Profile seeded successfully for existing organizations!", "profile", profile.Name(), "organizations", organizationIDs)
	}

	return nil
}

func loadTargetOrganizations(ctx context.Context, pool *pgxpool.Pool, organizationIDs []uuid.UUID) ([]TargetOrganization, error) {
	uniqueOrganizationIDs := uniqueUUIDs(organizationIDs)
	organizations := make([]TargetOrganization, 0, len(uniqueOrganizationIDs))

	for _, organizationID := range uniqueOrganizationIDs {
		organization, err := loadTargetOrganization(ctx, pool, organizationID)
		if err != nil {
			return nil, err
		}
		organizations = append(organizations, organization)
	}

	return organizations, nil
}

func loadTargetOrganization(ctx context.Context, pool *pgxpool.Pool, organizationID uuid.UUID) (TargetOrganization, error) {
	var organization TargetOrganization
	err := pool.QueryRow(ctx, `
		SELECT id, name
		FROM organization
		WHERE id = $1
	`, organizationID).Scan(&organization.ID, &organization.Name)
	if err != nil {
		if err == pgx.ErrNoRows {
			return TargetOrganization{}, fmt.Errorf("organization %q does not exist", organizationID)
		}
		return TargetOrganization{}, fmt.Errorf("failed to load organization %q: %w", organizationID, err)
	}

	err = pool.QueryRow(ctx, `
		SELECT uoo.user_id
		FROM user_on_organization uoo
		INNER JOIN "user" u ON u.id = uoo.user_id
		WHERE uoo.organization_id = $1
		  AND uoo.deleted_at IS NULL
		  AND u.deleted_at IS NULL
		ORDER BY
		  CASE WHEN u.external_id = $2 THEN 0 ELSE 1 END,
		  CASE WHEN u.type = 'machine' THEN 1 ELSE 0 END,
		  uoo.user_id
		LIMIT 1
	`, organizationID, platformidentity.ExternalID).Scan(&organization.OwnerUserID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return TargetOrganization{}, fmt.Errorf("organization %q must have at least one active user_on_organization membership", organizationID)
		}
		return TargetOrganization{}, fmt.Errorf("failed to resolve owner for organization %q: %w", organizationID, err)
	}

	return organization, nil
}

// cleanupTargetOrganizations deletes all domain data owned by the given orgs.
//
// The deletion order is derived at runtime by querying the Postgres FK graph for
// every table that has an organization_id column, then topologically sorting so
// leaf tables (nothing references them) are deleted before their parents. This
// means new tables added to the schema are cleaned up automatically without any
// manual edits here.
//
// Two special cases are handled outside the generic loop:
//   - release.previous_release_id is a self-reference that must be NULLed first.
//   - machine users (type='machine') owned by the org are cleaned up last.
func cleanupTargetOrganizations(ctx context.Context, pool *pgxpool.Pool, organizationIDs []uuid.UUID) error {
	uniqueOrganizationIDs := uniqueUUIDs(organizationIDs)
	if len(uniqueOrganizationIDs) == 0 {
		return nil
	}

	tables, err := orgScopedTablesInDeletionOrder(ctx, pool)
	if err != nil {
		return fmt.Errorf("resolve org-scoped table deletion order: %w", err)
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin targeted cleanup transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()

	exec := func(sql string) error {
		if _, err := tx.Exec(ctx, sql, uniqueOrganizationIDs); err != nil {
			return fmt.Errorf("cleanup %q: %w", sql[:min(40, len(sql))], err)
		}
		return nil
	}

	// NULL the self-referential FK on release before any deletes touch that table.
	if err := exec(`UPDATE release SET previous_release_id = NULL WHERE organization_id = ANY($1::uuid[])`); err != nil {
		return err
	}

	for _, table := range tables {
		if err := exec(`DELETE FROM "` + table + `" WHERE organization_id = ANY($1::uuid[])`); err != nil {
			return err
		}
	}

	// Machine users (type='machine') are org-owned but only their memberships
	// and user rows get deleted — human users are kept.
	for _, sql := range []string{
		`DELETE FROM user_on_organization uoo USING "user" u WHERE uoo.user_id = u.id AND uoo.organization_id = ANY($1::uuid[]) AND u.organization_id = uoo.organization_id AND u.type = 'machine'`,
		`DELETE FROM "user" WHERE organization_id = ANY($1::uuid[]) AND type = 'machine'`,
	} {
		if err := exec(sql); err != nil {
			return err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit targeted cleanup transaction: %w", err)
	}
	return nil
}

// orgScopedTablesInDeletionOrder returns the public tables that carry an
// organization_id column, sorted leaf-first by topological analysis of their
// FK relationships. Tables not in this set (e.g. organization, user) are not
// org-owned and are left untouched.
//
// cleanupSpecialCaseTables are excluded from the generic topological DELETE loop:
// user/user_on_organization require special post-step queries (only machine users,
// not humans).
var cleanupSpecialCaseTables = map[string]struct{}{
	"user":                 {},
	"user_on_organization": {},
}

func orgScopedTablesInDeletionOrder(ctx context.Context, pool *pgxpool.Pool) ([]string, error) {
	// Discover all public tables that have an organization_id column, excluding
	// tables that need special handling (user, user_on_organization).
	rows, err := pool.Query(ctx, `
		SELECT table_name
		FROM information_schema.columns
		WHERE table_schema = 'public' AND column_name = 'organization_id'
		ORDER BY table_name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	inSet := map[string]bool{}
	for rows.Next() {
		var t string
		if err := rows.Scan(&t); err != nil {
			return nil, err
		}
		if _, skip := cleanupSpecialCaseTables[t]; !skip {
			inSet[t] = true
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Build a dependency map: table → set of tables it references (i.e. must be
	// deleted before it). Only edges between org-scoped tables matter.
	deps := make(map[string]map[string]bool, len(inSet))
	for t := range inSet {
		deps[t] = map[string]bool{}
	}

	fkRows, err := pool.Query(ctx, `
		SELECT DISTINCT tc.table_name, ccu.table_name AS ref
		FROM information_schema.table_constraints tc
		JOIN information_schema.key_column_usage kcu
		  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
		JOIN information_schema.constraint_column_usage ccu
		  ON ccu.constraint_name = tc.constraint_name
		WHERE tc.constraint_type = 'FOREIGN KEY'
		  AND tc.table_schema = 'public'
		  AND tc.table_name != ccu.table_name
	`)
	if err != nil {
		return nil, err
	}
	defer fkRows.Close()

	for fkRows.Next() {
		var child, parent string
		if err := fkRows.Scan(&child, &parent); err != nil {
			return nil, err
		}
		// child references parent → child must be deleted before parent.
		if inSet[child] && inSet[parent] {
			deps[child][parent] = true
		}
	}
	if err := fkRows.Err(); err != nil {
		return nil, err
	}

	return deletionOrder(inSet, deps)
}

func deletionOrder(tables map[string]bool, dependencies map[string]map[string]bool) ([]string, error) {
	// An edge child -> parent means the child must be emitted first. Standard
	// Kahn sorting therefore counts incoming child edges on each parent.
	inDegree := make(map[string]int, len(tables))
	for table := range tables {
		inDegree[table] = 0
	}
	for _, parents := range dependencies {
		for parent := range parents {
			inDegree[parent]++
		}
	}

	queue := make([]string, 0, len(tables))
	for t, deg := range inDegree {
		if deg == 0 {
			queue = append(queue, t)
		}
	}
	sort.Strings(queue)

	result := make([]string, 0, len(tables))
	for len(queue) > 0 {
		node := queue[0]
		queue = queue[1:]
		result = append(result, node)
		for parent := range dependencies[node] {
			inDegree[parent]--
			if inDegree[parent] == 0 {
				queue = append(queue, parent)
				sort.Strings(queue)
			}
		}
	}

	if len(result) != len(tables) {
		return nil, fmt.Errorf("cycle detected in org-scoped foreign-key graph")
	}

	return result, nil
}

func uniqueUUIDs(values []uuid.UUID) []uuid.UUID {
	seen := make(map[uuid.UUID]struct{}, len(values))
	result := make([]uuid.UUID, 0, len(values))

	for _, value := range values {
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}

	return result
}
