---
name: detail-view-duplication-watch
description: Detect and reduce duplication across detail pages and tabs by extracting shared layouts, helpers, and components. Use when detail views grow or patterns repeat across features.
---

# Detail View Duplication Watch

Reduce repeated detail-page code by extracting shared detail patterns.

## Workflow

1. Read detail pattern references:
   - `app/docs/01-architecture/functionals.md`
   - `app/docs/03-patterns/composition.md`
2. Inspect detail pages and tabs for repeated structures:
   - shell layouts, tabs navigation, card+table blocks, audit/date helpers.
3. Prefer shared abstractions where available:
   - `DetailEntityLayout.Top/Body/Tabs/Content`, `TableCard`, `lib/detail/*`, `RiskRankingListCard`.
   - The dense-feature template in `app/docs/04-features/_template/FEATURE_TEMPLATE.md`
     keeps detail-specific helpers local. Tab implementation is private to
     DetailEntityLayout; compose regions instead of forwarding structural props.
4. Extract only when duplication is meaningful:
   - prioritize 2+ concrete repetitions with compatible semantics.
5. Preserve feature boundaries:
   - generic patterns in `functionals/` or `lib/detail`.
   - domain-specific rules remain in `features/<name>/`.
6. Validate readability and test impact after extraction.

## Useful commands

```bash
rg -n "Detail|Tabs|TableCard|CardTitle|CardDescription" app/src/features
rg -n "getActiveTabFromPathname|getAuditDisplayName|formatDateTime" app/src
```

## Output

- List duplication clusters with candidate extraction target.
- Provide minimal extraction plan and file move map.
- Flag low-ROI extractions to defer.
