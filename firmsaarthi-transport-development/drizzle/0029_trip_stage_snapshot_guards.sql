-- Existing trips are not modified. Newly configured workspaces require an explicit snapshot.
CREATE TRIGGER trip_stage_snapshot_source BEFORE INSERT ON trips
WHEN (json_type(NEW.creation_payload,'$.stagePolicySnapshot') IS NOT NULL
   OR json_type(NEW.creation_payload,'$.stagePolicyRequest') IS NOT NULL
   OR EXISTS(SELECT 1 FROM workspace_stage_policies WHERE org_id=NEW.org_id))
AND COALESCE(
  json_type(NEW.creation_payload,'$.stagePolicyRequest')='object'
  AND (SELECT COUNT(*) FROM json_each(NEW.creation_payload,'$.stagePolicyRequest'))=2
  AND json_extract(NEW.creation_payload,'$.stagePolicyRequest.contract')='workspace_stage_v1'
  AND json_type(NEW.creation_payload,'$.stagePolicyRequest.version')='integer'
  AND json_type(NEW.creation_payload,'$.stagePolicySnapshot')='object'
  AND (SELECT COUNT(*) FROM json_each(NEW.creation_payload,'$.stagePolicySnapshot'))=3
  AND json_type(NEW.creation_payload,'$.stagePolicySnapshot.version')='integer'
  AND json_extract(NEW.creation_payload,'$.stagePolicyRequest.version')=json_extract(NEW.creation_payload,'$.stagePolicySnapshot.version')
  AND json_extract(NEW.creation_payload,'$.stagePolicySnapshot.version')=(SELECT MAX(version) FROM workspace_stage_policies WHERE org_id=NEW.org_id)
  AND json_type(NEW.creation_payload,'$.stagePolicySnapshot.policy')='object'
  AND (SELECT COUNT(*) FROM json_each(NEW.creation_payload,'$.stagePolicySnapshot.policy'))=4
  AND json_type(NEW.creation_payload,'$.stagePolicySnapshot.policy.version')='integer'
  AND EXISTS(SELECT 1 FROM workspace_stage_policies p
    WHERE p.org_id=NEW.org_id AND p.id=json_extract(NEW.creation_payload,'$.stagePolicySnapshot.id')
    AND p.version=json_extract(NEW.creation_payload,'$.stagePolicySnapshot.version')
    AND p.contract_version=json_extract(NEW.creation_payload,'$.stagePolicySnapshot.policy.version')
    AND p.placement_rule=json_extract(NEW.creation_payload,'$.stagePolicySnapshot.policy.placement')
    AND p.loading_rule=json_extract(NEW.creation_payload,'$.stagePolicySnapshot.policy.loading')
    AND p.arrival_rule=json_extract(NEW.creation_payload,'$.stagePolicySnapshot.policy.arrival'))
  AND EXISTS(SELECT 1 FROM memberships m WHERE m.org_id=NEW.org_id AND m.user_id=NEW.created_by AND m.role IN ('OWNER','MEMBER','DISPATCHER'))
,0)=0
BEGIN SELECT RAISE(ABORT,'Trip stage policy source is missing, stale, unauthorised or outside this workspace.'); END;
