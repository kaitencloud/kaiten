-- +goose Up
-- +goose StatementBegin
-- Runner-owned lineage for capability-only revisions. Core owns mechanics,
-- not commercial edition names. No public API or SECURITY DEFINER escape.
-- The existing migrate-up runner supplies explicit tenant/family/Boolean policy;
-- without it this migration creates only these definitions, never client data.
CREATE TABLE license_capability_revision (
  source_license_id UUID PRIMARY KEY,
  target_license_id UUID NOT NULL UNIQUE,
  organization_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  vouchers BOOLEAN NOT NULL,
  addons BOOLEAN NOT NULL,
  source_contract JSONB NOT NULL CHECK (jsonb_typeof(source_contract) = 'object'),
  price_map JSONB NOT NULL CHECK (jsonb_typeof(price_map) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (source_license_id, organization_id) REFERENCES license(id, organization_id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (target_license_id, organization_id) REFERENCES license(id, organization_id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- Compare all non-capability contract terms, including exact captured price
-- snapshots. Row identity, version labels/defaults and timestamps are not terms.
CREATE FUNCTION license_capability_contract(tenant UUID, version_id UUID) RETURNS JSONB
LANGUAGE SQL STABLE AS $fn$
  SELECT jsonb_build_object(
    'license', to_jsonb(l) - ARRAY['id','slug','version','version_name','is_default','created_at','updated_at'],
    'grants', COALESCE((SELECT jsonb_agg(term ORDER BY term::text)
      FROM (SELECT to_jsonb(le) - ARRAY['id','license_id'] AS term
            FROM license_entitlement le JOIN entitlement e ON e.id = le.entitlement_id
            WHERE le.organization_id = tenant AND le.license_id = version_id
              AND e.slug NOT IN ('vouchers','addons')) grants), '[]'::jsonb),
    'prices', COALESCE((SELECT jsonb_agg(term ORDER BY term::text)
      FROM (SELECT to_jsonb(lp) - ARRAY['id','license_id'] AS term
            FROM license_price lp
            WHERE lp.organization_id = tenant AND lp.license_id = version_id) prices), '[]'::jsonb))
  FROM license l WHERE l.organization_id = tenant AND l.id = version_id;
$fn$;

-- Verify every exact price equivalence, not only an aggregate price multiset.
CREATE FUNCTION license_capability_price_mapping_valid(tenant UUID, source_id UUID, target_id UUID, mapping JSONB)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $fn$
  SELECT (SELECT count(*) FROM jsonb_each_text(mapping)) = (SELECT count(*) FROM license_price WHERE license_id = source_id AND organization_id = tenant)
    AND (SELECT count(DISTINCT value) FROM jsonb_each_text(mapping)) = (SELECT count(*) FROM license_price WHERE license_id = target_id AND organization_id = tenant)
    AND NOT EXISTS (SELECT 1 FROM jsonb_each_text(mapping) entry
      LEFT JOIN license_price old ON old.id = entry.key::uuid AND old.license_id = source_id AND old.organization_id = tenant
      LEFT JOIN license_price copied ON copied.id = entry.value::uuid AND copied.license_id = target_id AND copied.organization_id = tenant
      WHERE old.id IS NULL OR copied.id IS NULL OR
        (to_jsonb(old) - ARRAY['id','license_id']) IS DISTINCT FROM (to_jsonb(copied) - ARRAY['id','license_id']));
$fn$;

CREATE FUNCTION prepare_license_capability_revision(tenant UUID, source_id UUID, allow_vouchers BOOLEAN, allow_addons BOOLEAN)
RETURNS UUID LANGUAGE PLPGSQL AS $fn$
DECLARE
  original license%ROWTYPE;
  family license_family%ROWTYPE;
  previous license_capability_revision%ROWTYPE;
  successor UUID;
  actor UUID;
  current_version UUID;
  contract JSONB;
  mapping JSONB := '{}'::jsonb;
  price license_price%ROWTYPE;
  new_price UUID;
  capability entitlement%ROWTYPE;
  allowed BOOLEAN;
BEGIN
  IF tenant IS NULL OR source_id IS NULL OR allow_vouchers IS NULL OR allow_addons IS NULL THEN
    RAISE EXCEPTION 'capability revision requires explicit tenant, source and Boolean values';
  END IF;
  SELECT f.* INTO STRICT family FROM license_family f JOIN license l ON l.family_id = f.id
    WHERE l.id = source_id AND l.organization_id = tenant AND f.organization_id = tenant FOR UPDATE OF f;
  SELECT * INTO STRICT original FROM license WHERE id = source_id AND organization_id = tenant FOR UPDATE;
  PERFORM 1 FROM license_entitlement WHERE license_id = source_id AND organization_id = tenant FOR SHARE;
  PERFORM 1 FROM license_price WHERE license_id = source_id AND organization_id = tenant FOR SHARE;
  contract := license_capability_contract(tenant, source_id);
  SELECT * INTO previous FROM license_capability_revision WHERE source_license_id = source_id;
  IF FOUND THEN
    IF previous.organization_id <> tenant OR previous.vouchers <> allow_vouchers OR previous.addons <> allow_addons
       OR previous.source_contract IS DISTINCT FROM contract
       OR previous.source_contract IS DISTINCT FROM license_capability_contract(tenant, previous.target_license_id)
       OR NOT license_capability_price_mapping_valid(tenant, source_id, previous.target_license_id, previous.price_map)
       OR (SELECT count(*) FROM license_entitlement le JOIN entitlement e ON e.id = le.entitlement_id
           WHERE le.license_id = previous.target_license_id AND le.organization_id = tenant
             AND ((e.slug = 'vouchers' AND le.value = jsonb_build_object('type','boolean','value',allow_vouchers))
               OR (e.slug = 'addons' AND le.value = jsonb_build_object('type','boolean','value',allow_addons)))) <> 2 THEN
      RAISE EXCEPTION 'capability revision policy or contract drift for source %', source_id;
    END IF;
    RETURN previous.target_license_id;
  END IF;
  -- Strict stored false is required too; absence is not a matching grant.
  IF (SELECT count(*) FROM license_entitlement le JOIN entitlement e ON e.id = le.entitlement_id
      WHERE le.license_id = source_id AND le.organization_id = tenant
        AND ((e.slug = 'vouchers' AND le.value = jsonb_build_object('type','boolean','value',allow_vouchers))
          OR (e.slug = 'addons' AND le.value = jsonb_build_object('type','boolean','value',allow_addons)))) = 2 THEN
    RETURN source_id;
  END IF;
  PERFORM 1 FROM entitlement WHERE organization_id = tenant AND slug IN ('vouchers','addons') FOR SHARE;
  IF (SELECT count(*) FROM entitlement WHERE organization_id = tenant AND slug IN ('vouchers','addons') AND type = 'BOOLEAN') <> 2 THEN
    RAISE EXCEPTION 'capability revision requires both existing BOOLEAN definitions in the selected tenant';
  END IF;
  -- Bound catalogue work as well as client batches. Refuse unexpected scale,
  -- rather than silently locking an unbounded catalogue during startup.
  IF (SELECT count(*) FROM license_price WHERE license_id = source_id) > 1000
     OR (SELECT count(*) FROM license_entitlement WHERE license_id = source_id) > 1000
     OR (SELECT count(*) FROM voucher WHERE organization_id = tenant
         AND (source_id = ANY(applicable_license_ids) OR applicable_license_price_ids &&
              ARRAY(SELECT id FROM license_price WHERE license_id = source_id))) > 200 THEN
    RAISE EXCEPTION 'capability revision catalogue exceeds the bounded startup migration budget';
  END IF;
  SELECT u.id INTO STRICT actor FROM "user" u JOIN user_on_organization uo ON uo.user_id = u.id
    WHERE u.external_id = 'system:kaiten' AND uo.organization_id = tenant AND u.deleted_at IS NULL AND uo.deleted_at IS NULL;
  -- If the family previously resolved by highest published version, hold that
  -- same current identity explicitly while historical successors are prepared.
  -- Otherwise publishing an earlier contract's successor could briefly offer
  -- its different price/quota as the current plan before the last source runs.
  IF NOT EXISTS (SELECT 1 FROM license WHERE family_id = family.id AND is_default) THEN
    SELECT id INTO current_version FROM license WHERE family_id = family.id AND lifecycle_state = 'PUBLISHED'
      ORDER BY version DESC LIMIT 1;
    IF current_version IS NOT NULL THEN
      UPDATE license SET is_default = true WHERE id = current_version;
      original.is_default := original.id = current_version;
    END IF;
  END IF;
  INSERT INTO license (name, slug, description, type, version_name, is_default, features,
      organization_id, family_id, lifecycle_state, pricing_type, trial_period_days, requires_payment_method, self_serve_cta_url)
    VALUES (original.name, family.slug || '-v' || (family.last_version + 1), original.description, original.type,
      original.version_name, false, original.features, tenant, family.id, 'DRAFT', original.pricing_type,
      original.trial_period_days, original.requires_payment_method, original.self_serve_cta_url)
    RETURNING id INTO successor;
  INSERT INTO license_entitlement (entitlement_id, license_id, created_by_id, created_at, updated_by_id, updated_at,
      value, organization_id, limit_cap_exceeded_overage_percent)
    SELECT entitlement_id, successor, created_by_id, created_at, updated_by_id, updated_at,
      value, organization_id, limit_cap_exceeded_overage_percent FROM license_entitlement
    WHERE license_id = source_id AND organization_id = tenant;
  FOR capability IN SELECT * FROM entitlement WHERE organization_id = tenant AND slug IN ('vouchers','addons') LOOP
    allowed := CASE WHEN capability.slug = 'vouchers' THEN allow_vouchers ELSE allow_addons END;
    UPDATE license_entitlement SET value = jsonb_build_object('type','boolean','value',allowed)
      WHERE license_id = successor AND entitlement_id = capability.id AND organization_id = tenant;
    IF NOT FOUND THEN
      INSERT INTO license_entitlement (entitlement_id, license_id, created_by_id, updated_by_id, value, organization_id, limit_cap_exceeded_overage_percent)
        VALUES (capability.id, successor, actor, actor, jsonb_build_object('type','boolean','value',allowed), tenant, NULL);
    END IF;
  END LOOP;
  FOR price IN SELECT * FROM license_price WHERE license_id = source_id AND organization_id = tenant ORDER BY id LOOP
    INSERT INTO license_price (organization_id, license_id, billing_model, billing_timing, billing_period,
        unit_amount_decimal, currency, meters_entitlement_id, sale_unit_factor, display_label, display_order,
        is_default, status, deprecated_at, created_at, created_by_id, updated_at, updated_by_id)
      VALUES (tenant, successor, price.billing_model, price.billing_timing, price.billing_period,
        price.unit_amount_decimal, price.currency, price.meters_entitlement_id, price.sale_unit_factor,
        price.display_label, price.display_order, price.is_default, price.status, price.deprecated_at,
        price.created_at, price.created_by_id, price.updated_at, price.updated_by_id)
      RETURNING id INTO new_price;
    mapping := mapping || jsonb_build_object(price.id::text, new_price::text);
  END LOOP;
  UPDATE license SET lifecycle_state = original.lifecycle_state WHERE id = successor;
  IF contract IS DISTINCT FROM license_capability_contract(tenant, successor) THEN
    RAISE EXCEPTION 'capability revision changed non-capability contract terms';
  END IF;
  -- Extend exact selected-version/price eligibility ONLY to their copied
  -- equivalents. Old ids remain valid; no unrelated price/family is admitted.
  UPDATE voucher v SET
    applicable_license_ids = CASE WHEN source_id = ANY(v.applicable_license_ids)
      THEN v.applicable_license_ids || ARRAY[successor] ELSE v.applicable_license_ids END,
    applicable_license_price_ids = v.applicable_license_price_ids || ARRAY(
      SELECT (mapping ->> old_id::text)::uuid FROM unnest(v.applicable_license_price_ids) old_id
      WHERE mapping ? old_id::text)
    WHERE v.organization_id = tenant AND (source_id = ANY(v.applicable_license_ids)
      OR v.applicable_license_price_ids && ARRAY(SELECT id FROM license_price WHERE license_id = source_id));
  INSERT INTO license_capability_revision (source_license_id, target_license_id, organization_id, vouchers, addons, source_contract, price_map)
    VALUES (source_id, successor, tenant, allow_vouchers, allow_addons, contract, mapping);
  IF original.is_default THEN
    UPDATE license SET is_default = false WHERE id = source_id;
    UPDATE license SET is_default = true WHERE id = successor;
  END IF;
  RETURN successor;
END;
$fn$;

-- Each invocation touches at most 200 instances, orphan subscriptions and
-- checkout sessions. Instance -> subscription -> checkout lock order matches
-- billing settlement; no provider calls, invoices, trial or redemption writes.
CREATE FUNCTION apply_license_capability_revision_batch(tenant UUID, source_id UUID) RETURNS INTEGER
LANGUAGE PLPGSQL AS $fn$
DECLARE
  revision license_capability_revision%ROWTYPE;
  held instance%ROWTYPE;
  subscription instance_billing%ROWTYPE;
  changed INTEGER := 0;
  affected INTEGER;
  source_prices UUID[];
  target_archived BOOLEAN;
  escape TEXT := current_setting('kaiten.billing_apply_plan_change', true);
BEGIN
  SELECT * INTO STRICT revision FROM license_capability_revision
    WHERE source_license_id = source_id AND organization_id = tenant FOR SHARE;
  SELECT lifecycle_state = 'ARCHIVED' INTO target_archived FROM license WHERE id = revision.target_license_id;
  IF target_archived THEN
    PERFORM 1 FROM license WHERE id = source_id FOR SHARE;
    PERFORM 1 FROM license WHERE id = revision.target_license_id FOR NO KEY UPDATE;
  ELSE
    -- Keep shared locks compatible with normal assignment-trigger reads;
    -- ordinary subscription writers lock their instance before its licence.
    PERFORM 1 FROM license WHERE id IN (source_id, revision.target_license_id) ORDER BY id FOR SHARE;
  END IF;
  PERFORM 1 FROM license_entitlement WHERE license_id IN (source_id, revision.target_license_id) ORDER BY id FOR SHARE;
  PERFORM 1 FROM license_price WHERE license_id IN (source_id, revision.target_license_id) ORDER BY id FOR SHARE;
  IF revision.source_contract IS DISTINCT FROM license_capability_contract(tenant, source_id)
     OR revision.source_contract IS DISTINCT FROM license_capability_contract(tenant, revision.target_license_id)
     OR NOT license_capability_price_mapping_valid(tenant, source_id, revision.target_license_id, revision.price_map) THEN
    RAISE EXCEPTION 'capability revision contract drift';
  END IF;
  IF (SELECT count(*) FROM license_entitlement le JOIN entitlement e ON e.id = le.entitlement_id
      WHERE le.license_id = revision.target_license_id AND le.organization_id = tenant AND e.type = 'BOOLEAN'
        AND ((e.slug = 'vouchers' AND le.value = jsonb_build_object('type','boolean','value',revision.vouchers))
          OR (e.slug = 'addons' AND le.value = jsonb_build_object('type','boolean','value',revision.addons)))) <> 2 THEN
    RAISE EXCEPTION 'capability revision grant drift';
  END IF;
  source_prices := ARRAY(SELECT key::uuid FROM jsonb_object_keys(revision.price_map) AS keys(key));
  SELECT lifecycle_state = 'ARCHIVED' INTO target_archived FROM license WHERE id = revision.target_license_id;
  -- Stage an archived equivalent only inside this transaction, so the normal
  -- assignment trigger remains unchanged. Other sessions see it archived;
  -- every exit/rollback restores its original lifecycle before commit.
  IF target_archived THEN
    UPDATE license SET lifecycle_state = 'DRAFT' WHERE id = revision.target_license_id;
  END IF;
  PERFORM set_config('kaiten.billing_apply_plan_change', 'on', true);
  FOR held IN SELECT i.* FROM instance i LEFT JOIN instance_billing ib ON ib.instance_id = i.id AND ib.organization_id = tenant
    WHERE i.organization_id = tenant AND (i.license_id = source_id OR ib.pending_license_id = source_id
      OR ib.base_license_price_id = ANY(source_prices) OR ib.scheduled_license_price_id = ANY(source_prices)
      OR revision.price_map ? (ib.pending_selection ->> 'licensePriceId'))
    ORDER BY i.id LIMIT 200 FOR UPDATE OF i LOOP
    SELECT * INTO subscription FROM instance_billing WHERE instance_id = held.id AND organization_id = tenant FOR UPDATE;
    -- Equivalent terms make overdue boundaries safe too: do not settle,
    -- re-anchor or forgive debt while replacing these identities.
    UPDATE instance SET license_id = revision.target_license_id WHERE id = held.id AND license_id = source_id;
    UPDATE instance_billing SET
      base_license_price_id = COALESCE((revision.price_map ->> base_license_price_id::text)::uuid, base_license_price_id),
      scheduled_license_price_id = COALESCE((revision.price_map ->> scheduled_license_price_id::text)::uuid, scheduled_license_price_id),
      pending_license_id = CASE WHEN pending_license_id = source_id THEN revision.target_license_id ELSE pending_license_id END,
      pending_selection = CASE WHEN revision.price_map ? (pending_selection ->> 'licensePriceId')
        THEN jsonb_set(pending_selection, '{licensePriceId}', revision.price_map -> (pending_selection ->> 'licensePriceId')) ELSE pending_selection END
      WHERE instance_id = held.id AND organization_id = tenant;
    changed := changed + 1;
  END LOOP;
  -- Deleted instances still have historical/reference-bearing subscriptions.
  FOR subscription IN SELECT * FROM instance_billing ib WHERE ib.organization_id = tenant AND ib.instance_id IS NULL
    AND (ib.pending_license_id = source_id OR ib.base_license_price_id = ANY(source_prices)
      OR ib.scheduled_license_price_id = ANY(source_prices) OR revision.price_map ? (ib.pending_selection ->> 'licensePriceId'))
    ORDER BY ib.id LIMIT 200 FOR UPDATE LOOP
    UPDATE instance_billing SET
      base_license_price_id = COALESCE((revision.price_map ->> base_license_price_id::text)::uuid, base_license_price_id),
      scheduled_license_price_id = COALESCE((revision.price_map ->> scheduled_license_price_id::text)::uuid, scheduled_license_price_id),
      pending_license_id = CASE WHEN pending_license_id = source_id THEN revision.target_license_id ELSE pending_license_id END,
      pending_selection = CASE WHEN revision.price_map ? (pending_selection ->> 'licensePriceId')
        THEN jsonb_set(pending_selection, '{licensePriceId}', revision.price_map -> (pending_selection ->> 'licensePriceId')) ELSE pending_selection END
      WHERE id = subscription.id;
    changed := changed + 1;
  END LOOP;
  WITH locked AS (SELECT cs.id FROM checkout_session cs WHERE cs.organization_id = tenant
    AND cs.status IN ('OPEN','AWAITING_PAYMENT') AND cs.license_price_id = ANY(source_prices) ORDER BY cs.id LIMIT 200 FOR UPDATE)
  UPDATE checkout_session cs SET license_price_id = (revision.price_map ->> cs.license_price_id::text)::uuid
    FROM locked WHERE cs.id = locked.id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF target_archived THEN
    UPDATE license SET lifecycle_state = 'ARCHIVED' WHERE id = revision.target_license_id;
  END IF;
  IF revision.source_contract IS DISTINCT FROM license_capability_contract(tenant, revision.target_license_id) THEN
    RAISE EXCEPTION 'capability revision changed target contract during reference update';
  END IF;
  PERFORM set_config('kaiten.billing_apply_plan_change', COALESCE(escape, ''), true);
  RETURN changed + affected;
END;
$fn$;
REVOKE ALL ON FUNCTION license_capability_contract(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION license_capability_price_mapping_valid(UUID, UUID, UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION prepare_license_capability_revision(UUID, UUID, BOOLEAN, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION apply_license_capability_revision_batch(UUID, UUID) FROM PUBLIC;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- A data transition cannot be undone by dropping its lineage. Fix forward;
-- an economic rollback is a separately approved operation, not migrate down.
DO $fn$ BEGIN
  IF EXISTS (SELECT 1 FROM license_capability_revision) THEN
    RAISE EXCEPTION 'applied capability revisions require a fix-forward migration';
  END IF;
END $fn$;
DROP FUNCTION apply_license_capability_revision_batch(UUID, UUID);
DROP FUNCTION prepare_license_capability_revision(UUID, UUID, BOOLEAN, BOOLEAN);
DROP FUNCTION license_capability_price_mapping_valid(UUID, UUID, UUID, JSONB);
DROP FUNCTION license_capability_contract(UUID, UUID);
DROP TABLE license_capability_revision;
-- +goose StatementEnd
