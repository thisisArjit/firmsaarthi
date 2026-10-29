-- Candidate only: no existing event, trip or financial row is rewritten.
CREATE VIEW trip_stage_active_events AS SELECT e.* FROM trip_events e
WHERE e.kind<>'correction' AND NOT EXISTS(SELECT 1 FROM trip_events c WHERE c.org_id=e.org_id AND c.trip_id=e.trip_id AND c.kind='correction' AND c.target_event_id=e.id);
--> statement-breakpoint
CREATE TRIGGER trip_stage_physical_event_guard BEFORE INSERT ON trip_events
WHEN EXISTS(SELECT 1 FROM trips t WHERE t.id=NEW.trip_id AND t.org_id=NEW.org_id AND json_extract(t.creation_payload,'$.stagePolicyRequest.contract')='workspace_stage_v1') AND NEW.kind<>'cancel'
AND NOT EXISTS(SELECT 1 FROM trips t JOIN memberships m ON m.org_id=t.org_id AND m.user_id=NEW.actor AND m.role IN ('OWNER','MEMBER','DISPATCHER')
 WHERE t.id=NEW.trip_id AND t.org_id=NEW.org_id AND t.version=NEW.version
 AND NEW.kind IN ('placement','loading','arrival','dispatch','delivery','correction')
 AND (NEW.kind<>'correction' OR (m.role='OWNER' AND length(trim(NEW.note))>0))
 AND ((NEW.kind IN ('placement','loading') AND t.status='planned') OR (NEW.kind IN ('arrival','dispatch','delivery') AND t.status='dispatched') OR (NEW.kind='correction' AND EXISTS(SELECT 1 FROM trip_stage_active_events target WHERE target.id=NEW.target_event_id AND target.org_id=t.org_id AND target.trip_id=t.id AND ((target.kind IN ('placement','loading') AND t.status='planned') OR (target.kind='arrival' AND t.status='dispatched')))))
 AND EXISTS(SELECT 1 FROM trip_allocations a WHERE a.org_id=t.org_id AND a.trip_id=t.id AND a.active=1)
 AND ((NEW.kind IN ('loading','arrival','delivery') AND EXISTS(SELECT 1 FROM trip_allocations a WHERE a.id=NEW.allocation_id AND a.org_id=t.org_id AND a.trip_id=t.id AND a.active=1)) OR (NEW.kind IN ('placement','dispatch','correction') AND NEW.allocation_id IS NULL))
 AND (NEW.kind='correction' OR NEW.target_event_id IS NULL)
 AND (NEW.kind<>'delivery' OR length(trim(NEW.reference))>0)
 AND length(NEW.reference)<=200 AND length(NEW.note)<=500
 AND NEW.event_at>=t.created_at AND NEW.event_at<=NEW.recorded_at
 AND julianday(NEW.recorded_at)<=julianday('now','+1 second')
 AND strftime('%Y-%m-%dT%H:%M:%fZ',NEW.event_at)=NEW.event_at AND strftime('%Y-%m-%dT%H:%M:%fZ',NEW.recorded_at)=NEW.recorded_at
 AND json_valid(NEW.payload) AND json_type(NEW.payload)='object'
 AND (SELECT COUNT(*) FROM json_each(NEW.payload))=7 AND (SELECT COUNT(DISTINCT key) FROM json_each(NEW.payload))=7
 AND NOT EXISTS(SELECT 1 FROM json_each(NEW.payload) WHERE key NOT IN ('kind','eventAt','allocationId','targetId','reference','note','stageTransition'))
 AND json_extract(NEW.payload,'$.kind')=NEW.kind AND json_extract(NEW.payload,'$.eventAt')=NEW.event_at
 AND json_extract(NEW.payload,'$.allocationId') IS NEW.allocation_id AND json_extract(NEW.payload,'$.targetId') IS NEW.target_event_id
 AND json_extract(NEW.payload,'$.reference')=NEW.reference AND json_extract(NEW.payload,'$.note')=NEW.note
 AND json_extract(NEW.payload,'$.stageTransition.contract')='physical_stage_v1'
 AND (SELECT COUNT(*) FROM json_each(NEW.payload,'$.stageTransition'))=3
 AND json_type(NEW.payload,'$.stageTransition.prerequisiteEventIds')='array' AND json_type(NEW.payload,'$.stageTransition.evidenceUses')='array'
 AND NOT EXISTS(SELECT 1 FROM json_each(NEW.payload,'$.stageTransition') WHERE key NOT IN ('contract','prerequisiteEventIds','evidenceUses'))
 AND json_array_length(NEW.payload,'$.stageTransition.evidenceUses')=CASE WHEN NEW.kind IN ('placement','loading','arrival') AND json_extract(t.creation_payload,'$.stagePolicySnapshot.policy.'||NEW.kind)='accepted_file' THEN 1 ELSE 0 END
 AND NOT EXISTS(SELECT 1 FROM json_each(NEW.payload,'$.stageTransition.evidenceUses') u WHERE u.type<>'object' OR (SELECT COUNT(*) FROM json_each(u.value))<>2 OR json_type(u.value,'$.documentId')<>'text' OR json_type(u.value,'$.reviewId')<>'text')
 AND json_array_length(NEW.payload,'$.stageTransition.prerequisiteEventIds')=CASE NEW.kind WHEN 'placement' THEN 0 WHEN 'loading' THEN 1 WHEN 'dispatch' THEN 1+(SELECT COUNT(*) FROM trip_allocations a WHERE a.org_id=t.org_id AND a.trip_id=t.id AND a.active=1) WHEN 'arrival' THEN 2 WHEN 'delivery' THEN 2 WHEN 'correction' THEN 1 END
 AND (SELECT COUNT(DISTINCT value) FROM json_each(NEW.payload,'$.stageTransition.prerequisiteEventIds'))=json_array_length(NEW.payload,'$.stageTransition.prerequisiteEventIds')
 AND NOT EXISTS(SELECT 1 FROM json_each(NEW.payload,'$.stageTransition.prerequisiteEventIds') j WHERE j.type<>'text' OR NOT EXISTS(SELECT 1 FROM trip_stage_active_events p WHERE p.id=j.value AND p.org_id=t.org_id AND p.trip_id=t.id AND p.version<NEW.version AND p.event_at<=NEW.event_at AND p.recorded_at<=NEW.recorded_at))
 AND NOT EXISTS(SELECT 1 FROM trip_stage_active_events existing WHERE existing.org_id=t.org_id AND existing.trip_id=t.id AND existing.kind=NEW.kind AND existing.allocation_id IS NEW.allocation_id AND NEW.kind<>'correction')
 AND NOT EXISTS(SELECT 1 FROM trip_stage_active_events terminal WHERE terminal.org_id=t.org_id AND terminal.trip_id=t.id AND terminal.kind IN ('close','cancel'))
 AND NOT EXISTS(SELECT 1 FROM trip_stage_active_events old WHERE old.org_id=t.org_id AND old.trip_id=t.id AND old.kind IN ('placement','loading','arrival','dispatch','delivery') AND (json_extract(old.payload,'$.stageTransition.contract') IS NOT 'physical_stage_v1' OR json_type(old.payload,'$.stageTransition.prerequisiteEventIds') IS NOT 'array' OR json_type(old.payload,'$.stageTransition.evidenceUses') IS NOT 'array' OR (SELECT COUNT(*) FROM trip_stage_event_dependencies d WHERE d.event_id=old.id AND d.org_id=old.org_id AND d.trip_id=old.trip_id)<>json_array_length(old.payload,'$.stageTransition.prerequisiteEventIds') OR (SELECT COUNT(*) FROM trip_stage_evidence_uses u WHERE u.event_id=old.id AND u.org_id=old.org_id AND u.trip_id=old.trip_id)<>json_array_length(old.payload,'$.stageTransition.evidenceUses')))
 AND (NEW.kind<>'placement' OR (NOT EXISTS(SELECT 1 FROM trip_stage_active_events e WHERE e.org_id=t.org_id AND e.trip_id=t.id AND e.kind IN ('loading','dispatch','arrival','delivery')) AND NOT EXISTS(SELECT 1 FROM trip_allocations a WHERE a.org_id=t.org_id AND a.trip_id=t.id AND a.active=1 AND julianday(NEW.event_at)<julianday(json_extract(a.snapshot,'$.date')||'T00:00:00+05:30'))))
 AND (NEW.kind NOT IN ('loading','dispatch') OR NOT EXISTS(SELECT 1 FROM trip_stage_active_events e WHERE e.org_id=t.org_id AND e.trip_id=t.id AND e.kind='dispatch'))
 AND (NEW.kind NOT IN ('loading','dispatch') OR EXISTS(SELECT 1 FROM trip_stage_active_events p JOIN json_each(NEW.payload,'$.stageTransition.prerequisiteEventIds') j ON j.value=p.id WHERE p.org_id=t.org_id AND p.trip_id=t.id AND p.kind='placement' AND p.allocation_id IS NULL))
 AND (NEW.kind<>'dispatch' OR NOT EXISTS(SELECT 1 FROM trip_allocations a WHERE a.org_id=t.org_id AND a.trip_id=t.id AND a.active=1 AND NOT EXISTS(SELECT 1 FROM trip_stage_active_events p JOIN json_each(NEW.payload,'$.stageTransition.prerequisiteEventIds') j ON j.value=p.id WHERE p.org_id=t.org_id AND p.trip_id=t.id AND p.kind='loading' AND p.allocation_id=a.id)))
 AND (NEW.kind NOT IN ('arrival','delivery') OR EXISTS(SELECT 1 FROM trip_stage_active_events p JOIN json_each(NEW.payload,'$.stageTransition.prerequisiteEventIds') j ON j.value=p.id WHERE p.org_id=t.org_id AND p.trip_id=t.id AND p.kind='dispatch' AND p.allocation_id IS NULL))
 AND (NEW.kind<>'arrival' OR EXISTS(SELECT 1 FROM trip_stage_active_events p JOIN json_each(NEW.payload,'$.stageTransition.prerequisiteEventIds') j ON j.value=p.id WHERE p.org_id=t.org_id AND p.trip_id=t.id AND p.kind='loading' AND p.allocation_id=NEW.allocation_id))
 AND (NEW.kind<>'delivery' OR EXISTS(SELECT 1 FROM trip_stage_active_events p JOIN json_each(NEW.payload,'$.stageTransition.prerequisiteEventIds') j ON j.value=p.id WHERE p.org_id=t.org_id AND p.trip_id=t.id AND p.kind='arrival' AND p.allocation_id=NEW.allocation_id))
 AND (NEW.kind<>'correction' OR (json_extract(NEW.payload,'$.stageTransition.prerequisiteEventIds[0]')=NEW.target_event_id AND EXISTS(SELECT 1 FROM trip_stage_active_events p WHERE p.id=NEW.target_event_id AND p.org_id=t.org_id AND p.trip_id=t.id AND p.kind IN ('placement','loading','arrival'))))
)
BEGIN SELECT RAISE(ABORT,'Physical stage event requires the saved policy, scope, phase, chronology and complete original prerequisites.'); END;
--> statement-breakpoint
CREATE TRIGGER trip_stage_cancel_guard BEFORE INSERT ON trip_events
WHEN NEW.kind='cancel' AND EXISTS(SELECT 1 FROM trips t WHERE t.id=NEW.trip_id AND t.org_id=NEW.org_id AND json_extract(t.creation_payload,'$.stagePolicyRequest.contract')='workspace_stage_v1')
AND NOT EXISTS(SELECT 1 FROM trips t JOIN memberships m ON m.org_id=t.org_id AND m.user_id=NEW.actor AND m.role='OWNER' WHERE t.id=NEW.trip_id AND t.org_id=NEW.org_id AND t.version=NEW.version AND t.status='cancelled' AND NEW.allocation_id IS NULL AND NEW.target_event_id IS NULL AND length(trim(NEW.note))>0 AND NEW.event_at>=t.created_at AND NEW.event_at<=NEW.recorded_at AND NOT EXISTS(SELECT 1 FROM trip_stage_active_events e WHERE e.org_id=t.org_id AND e.trip_id=t.id AND e.kind IN ('dispatch','close','cancel')))
BEGIN SELECT RAISE(ABORT,'Only the owner can cancel an open planned stage timeline with a reason.'); END;
--> statement-breakpoint
CREATE TRIGGER trip_stage_materialize_links AFTER INSERT ON trip_events
WHEN json_extract(NEW.payload,'$.stageTransition.contract')='physical_stage_v1'
BEGIN
 INSERT INTO trip_stage_event_dependencies(event_id,prerequisite_event_id,org_id,trip_id)
 SELECT NEW.id,value,NEW.org_id,NEW.trip_id FROM json_each(NEW.payload,'$.stageTransition.prerequisiteEventIds');
 INSERT INTO trip_stage_evidence_uses(event_id,document_id,review_id,org_id,trip_id)
 SELECT NEW.id,json_extract(value,'$.documentId'),json_extract(value,'$.reviewId'),NEW.org_id,NEW.trip_id FROM json_each(NEW.payload,'$.stageTransition.evidenceUses');
END;
