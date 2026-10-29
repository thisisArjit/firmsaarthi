-- Custom SQL migration file, put your code below! --
-- Existing rows are unchanged. New timelines with a configured default must retain its source.
CREATE TRIGGER trip_pod_snapshot_source BEFORE INSERT ON trips
WHEN (json_type(NEW.creation_payload,'$.podPolicySnapshot') IS NOT NULL OR EXISTS(SELECT 1 FROM workspace_pod_policies WHERE org_id=NEW.org_id))
AND COALESCE(
  json_type(NEW.creation_payload,'$.podPolicySnapshot')='object'
  AND json_type(NEW.creation_payload,'$.podPolicyRequest')='object'
  AND json_type(NEW.creation_payload,'$.podPolicySnapshot.version')='integer'
  AND json_extract(NEW.creation_payload,'$.podPolicySnapshot.version')=COALESCE((SELECT MAX(version) FROM workspace_pod_policies WHERE org_id=NEW.org_id),0)
  AND (
    (json_extract(NEW.creation_payload,'$.podPolicySnapshot.version')=0 AND json_type(NEW.creation_payload,'$.podPolicySnapshot.id')='null' AND json_extract(NEW.creation_payload,'$.podPolicySnapshot.mode')='reference_v1')
    OR EXISTS(SELECT 1 FROM workspace_pod_policies p WHERE p.id=json_extract(NEW.creation_payload,'$.podPolicySnapshot.id') AND p.org_id=NEW.org_id AND p.version=json_extract(NEW.creation_payload,'$.podPolicySnapshot.version') AND p.pod_mode=json_extract(NEW.creation_payload,'$.podPolicySnapshot.mode'))
  ),0)=0
BEGIN SELECT RAISE(ABORT,'Trip POD policy source is missing, stale or outside this workspace.'); END;
--> statement-breakpoint
CREATE TRIGGER trip_pod_snapshot_selection BEFORE INSERT ON trips
WHEN json_type(NEW.creation_payload,'$.podPolicySnapshot') IS NOT NULL AND COALESCE(
  json_extract(NEW.creation_payload,'$.podPolicyRequest.contract') IN ('legacy_v1','workspace_policy_v1')
  AND json_extract(NEW.creation_payload,'$.podPolicyRequest.selection') IN ('reference_v1','file_v1','workspace_v1')
  AND (json_extract(NEW.creation_payload,'$.podPolicyRequest.contract')='workspace_policy_v1' OR json_extract(NEW.creation_payload,'$.podPolicyRequest.selection')<>'workspace_v1')
  AND (json_extract(NEW.creation_payload,'$.podPolicyRequest.contract')='legacy_v1' OR (json_type(NEW.creation_payload,'$.podPolicyRequest.version')='integer' AND json_extract(NEW.creation_payload,'$.podPolicyRequest.version')=json_extract(NEW.creation_payload,'$.podPolicySnapshot.version') AND json_type(NEW.creation_payload,'$.podPolicyRequest.reason')='text' AND length(json_extract(NEW.creation_payload,'$.podPolicyRequest.reason'))<=500))
  AND NEW.pod_policy=CASE WHEN json_extract(NEW.creation_payload,'$.podPolicyRequest.selection')='workspace_v1' THEN json_extract(NEW.creation_payload,'$.podPolicySnapshot.mode') ELSE json_extract(NEW.creation_payload,'$.podPolicyRequest.selection') END
  AND (json_extract(NEW.creation_payload,'$.podPolicyRequest.selection')<>'file_v1' OR EXISTS(SELECT 1 FROM memberships m WHERE m.org_id=NEW.org_id AND m.user_id=NEW.created_by AND m.role='OWNER'))
  AND (json_extract(NEW.creation_payload,'$.podPolicySnapshot.mode')<>'file_v1' OR NEW.pod_policy='file_v1' OR (json_extract(NEW.creation_payload,'$.podPolicyRequest.contract')='workspace_policy_v1' AND length(trim(json_extract(NEW.creation_payload,'$.podPolicyRequest.reason')))>0 AND EXISTS(SELECT 1 FROM memberships m WHERE m.org_id=NEW.org_id AND m.user_id=NEW.created_by AND m.role='OWNER'))),0)=0
BEGIN SELECT RAISE(ABORT,'Trip POD selection requires an authorised immutable choice.'); END;
