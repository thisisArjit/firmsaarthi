DROP TRIGGER trip_stage_physical_event_guard;
--> statement-breakpoint
CREATE TRIGGER trip_stage_physical_event_guard BEFORE INSERT ON trip_events
WHEN EXISTS(SELECT 1 FROM trips t WHERE t.id=NEW.trip_id AND t.org_id=NEW.org_id AND json_extract(t.creation_payload,'$.stagePolicyRequest.contract')='workspace_stage_v1') AND NEW.kind<>'cancel' AND json_extract(NEW.payload,'$.stageTransition.contract') IS NOT 'trip_follow_up_v1'
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
-- Trigger-only candidate. Physical validation is preserved in the prefix below.
CREATE TRIGGER trip_follow_up_guard BEFORE INSERT ON trip_events
WHEN json_extract(NEW.payload,'$.stageTransition.contract')='trip_follow_up_v1'
AND NOT EXISTS(SELECT 1 FROM trips t JOIN memberships m ON m.org_id=t.org_id AND m.user_id=NEW.actor AND m.role IN ('OWNER','MEMBER','DISPATCHER')
 WHERE t.id=NEW.trip_id AND t.org_id=NEW.org_id AND t.version=NEW.version AND json_extract(t.creation_payload,'$.stagePolicyRequest.contract')='workspace_stage_v1'
 AND NEW.kind IN ('pod_accept','pod_reject','exception','exception_resolve','close','correction')
 AND (NEW.kind NOT IN ('pod_accept','pod_reject','close','correction') OR m.role='OWNER')
 AND ((NEW.kind IN ('pod_accept','pod_reject','exception','exception_resolve') AND t.status='dispatched' AND NOT EXISTS(SELECT 1 FROM trip_stage_active_events e WHERE e.org_id=t.org_id AND e.trip_id=t.id AND e.kind IN ('close','cancel'))) OR (NEW.kind='close' AND t.status='closed' AND NOT EXISTS(SELECT 1 FROM trip_stage_active_events e WHERE e.org_id=t.org_id AND e.trip_id=t.id AND e.kind IN ('close','cancel'))) OR (NEW.kind='correction' AND EXISTS(SELECT 1 FROM trip_stage_active_events target WHERE target.id=NEW.target_event_id AND target.org_id=t.org_id AND target.trip_id=t.id AND target.kind IN ('dispatch','delivery','pod_accept','pod_reject','exception','exception_resolve','close') AND target.version=(SELECT MAX(version) FROM trip_stage_active_events e WHERE e.org_id=t.org_id AND e.trip_id=t.id) AND t.status=CASE target.kind WHEN 'close' THEN 'dispatched' WHEN 'dispatch' THEN 'planned' ELSE 'dispatched' END)))
 AND EXISTS(SELECT 1 FROM trip_allocations a WHERE a.org_id=t.org_id AND a.trip_id=t.id AND a.active=1)
 AND ((NEW.kind IN ('pod_accept','pod_reject') AND EXISTS(SELECT 1 FROM trip_allocations a WHERE a.id=NEW.allocation_id AND a.org_id=t.org_id AND a.trip_id=t.id AND a.active=1)) OR (NEW.kind NOT IN ('pod_accept','pod_reject') AND NEW.allocation_id IS NULL))
 AND (NEW.kind IN ('correction','exception_resolve') OR NEW.target_event_id IS NULL)
 AND (NEW.kind NOT IN ('pod_reject','exception','exception_resolve','correction') OR length(trim(NEW.note))>0)
 AND (NEW.kind<>'pod_accept' OR length(trim(NEW.reference))>0) AND length(NEW.note)<=500 AND length(NEW.reference)<=200
 AND NEW.event_at>=t.created_at AND NEW.event_at<=NEW.recorded_at AND julianday(NEW.recorded_at)<=julianday('now','+1 second')
 AND strftime('%Y-%m-%dT%H:%M:%fZ',NEW.event_at)=NEW.event_at AND strftime('%Y-%m-%dT%H:%M:%fZ',NEW.recorded_at)=NEW.recorded_at
 AND json_type(NEW.payload)='object' AND (SELECT COUNT(*) FROM json_each(NEW.payload))=CASE WHEN json_type(NEW.payload,'$.documentId') IS NULL THEN 7 ELSE 8 END AND (SELECT COUNT(*) FROM json_each(NEW.payload))=(SELECT COUNT(DISTINCT key) FROM json_each(NEW.payload))
 AND NOT EXISTS(SELECT 1 FROM json_each(NEW.payload) WHERE key NOT IN ('kind','eventAt','allocationId','targetId','reference','note','stageTransition','documentId'))
 AND json_extract(NEW.payload,'$.kind')=NEW.kind AND json_extract(NEW.payload,'$.eventAt')=NEW.event_at AND json_extract(NEW.payload,'$.allocationId') IS NEW.allocation_id AND json_extract(NEW.payload,'$.targetId') IS NEW.target_event_id AND json_extract(NEW.payload,'$.reference')=NEW.reference AND json_extract(NEW.payload,'$.note')=NEW.note
 AND (SELECT COUNT(*) FROM json_each(NEW.payload,'$.stageTransition'))=3 AND NOT EXISTS(SELECT 1 FROM json_each(NEW.payload,'$.stageTransition') WHERE key NOT IN ('contract','prerequisiteEventIds','evidenceUses'))
 AND json_type(NEW.payload,'$.stageTransition.prerequisiteEventIds')='array' AND json_type(NEW.payload,'$.stageTransition.evidenceUses')='array' AND json_array_length(NEW.payload,'$.stageTransition.evidenceUses')=0
 AND (json_type(NEW.payload,'$.documentId') IS NULL OR (NEW.kind IN ('pod_accept','pod_reject') AND json_type(NEW.payload,'$.documentId')='text' AND EXISTS(SELECT 1 FROM trip_documents d JOIN asset_scopes scope ON scope.asset_id=d.asset_id AND scope.org_id=d.org_id AND scope.purpose='trip_pod' WHERE d.id=json_extract(NEW.payload,'$.documentId') AND d.org_id=t.org_id AND d.trip_id=t.id AND d.allocation_id=NEW.allocation_id AND d.created_at<=NEW.event_at)))
 AND (NEW.kind<>'pod_accept' OR t.pod_policy<>'file_v1' OR json_type(NEW.payload,'$.documentId')='text')
 AND (SELECT COUNT(DISTINCT value) FROM json_each(NEW.payload,'$.stageTransition.prerequisiteEventIds'))=json_array_length(NEW.payload,'$.stageTransition.prerequisiteEventIds')
 AND NOT EXISTS(SELECT 1 FROM json_each(NEW.payload,'$.stageTransition.prerequisiteEventIds') j WHERE j.type<>'text' OR NOT EXISTS(SELECT 1 FROM trip_stage_active_events p WHERE p.id=j.value AND p.org_id=t.org_id AND p.trip_id=t.id AND p.version<NEW.version AND p.event_at<=NEW.event_at AND p.recorded_at<=NEW.recorded_at))
 AND json_array_length(NEW.payload,'$.stageTransition.prerequisiteEventIds')=CASE WHEN NEW.kind IN ('pod_accept','pod_reject') THEN 2+CASE WHEN EXISTS(SELECT 1 FROM trip_stage_active_events e WHERE e.org_id=t.org_id AND e.trip_id=t.id AND e.allocation_id=NEW.allocation_id AND e.kind IN ('pod_accept','pod_reject')) THEN 1 ELSE 0 END WHEN NEW.kind='exception' THEN 1 WHEN NEW.kind='exception_resolve' THEN 2 WHEN NEW.kind='close' THEN (SELECT COUNT(*) FROM trip_stage_active_events e WHERE e.org_id=t.org_id AND e.trip_id=t.id) WHEN NEW.kind='correction' THEN 1 END
 AND (NEW.kind='correction' OR EXISTS(SELECT 1 FROM trip_stage_active_events p JOIN json_each(NEW.payload,'$.stageTransition.prerequisiteEventIds') j ON j.value=p.id WHERE p.org_id=t.org_id AND p.trip_id=t.id AND p.kind='dispatch' AND p.allocation_id IS NULL))
 AND (NEW.kind NOT IN ('pod_accept','pod_reject') OR EXISTS(SELECT 1 FROM trip_stage_active_events p JOIN json_each(NEW.payload,'$.stageTransition.prerequisiteEventIds') j ON j.value=p.id WHERE p.org_id=t.org_id AND p.trip_id=t.id AND p.kind='delivery' AND p.allocation_id=NEW.allocation_id))
 AND (NEW.kind NOT IN ('pod_accept','pod_reject') OR NOT EXISTS(SELECT 1 FROM trip_stage_active_events previous WHERE previous.org_id=t.org_id AND previous.trip_id=t.id AND previous.allocation_id=NEW.allocation_id AND previous.kind IN ('pod_accept','pod_reject') AND previous.version=(SELECT MAX(version) FROM trip_stage_active_events p WHERE p.org_id=t.org_id AND p.trip_id=t.id AND p.allocation_id=NEW.allocation_id AND p.kind IN ('pod_accept','pod_reject')) AND ((NEW.kind='pod_accept' AND previous.kind='pod_accept') OR NOT EXISTS(SELECT 1 FROM json_each(NEW.payload,'$.stageTransition.prerequisiteEventIds') j WHERE j.value=previous.id))))
 AND (NEW.kind<>'exception_resolve' OR EXISTS(SELECT 1 FROM trip_stage_active_events target JOIN json_each(NEW.payload,'$.stageTransition.prerequisiteEventIds') j ON j.value=target.id WHERE target.id=NEW.target_event_id AND target.org_id=t.org_id AND target.trip_id=t.id AND target.kind='exception' AND NOT EXISTS(SELECT 1 FROM trip_stage_active_events r WHERE r.org_id=t.org_id AND r.trip_id=t.id AND r.kind='exception_resolve' AND r.target_event_id=target.id)))
 AND (NEW.kind<>'close' OR NOT EXISTS(SELECT 1 FROM trip_stage_active_events e WHERE e.org_id=t.org_id AND e.trip_id=t.id AND e.kind='exception' AND NOT EXISTS(SELECT 1 FROM trip_stage_active_events r WHERE r.org_id=t.org_id AND r.trip_id=t.id AND r.kind='exception_resolve' AND r.target_event_id=e.id)))
 AND (NEW.kind<>'close' OR NOT EXISTS(SELECT 1 FROM trip_allocations a WHERE a.org_id=t.org_id AND a.trip_id=t.id AND a.active=1 AND NOT EXISTS(SELECT 1 FROM trip_stage_active_events d WHERE d.org_id=t.org_id AND d.trip_id=t.id AND d.allocation_id=a.id AND d.kind='delivery')))
 AND (NEW.kind<>'close' OR NOT EXISTS(SELECT 1 FROM trip_allocations a WHERE a.org_id=t.org_id AND a.trip_id=t.id AND a.active=1 AND NOT EXISTS(SELECT 1 FROM trip_stage_active_events p WHERE p.org_id=t.org_id AND p.trip_id=t.id AND p.allocation_id=a.id AND p.kind='pod_accept' AND p.version=(SELECT MAX(version) FROM trip_stage_active_events review WHERE review.org_id=t.org_id AND review.trip_id=t.id AND review.allocation_id=a.id AND review.kind IN ('pod_accept','pod_reject')) AND (t.pod_policy<>'file_v1' OR EXISTS(SELECT 1 FROM trip_document_reviews r JOIN trip_documents d ON d.id=r.document_id AND d.org_id=r.org_id JOIN asset_scopes scope ON scope.asset_id=d.asset_id AND scope.org_id=d.org_id AND scope.purpose='trip_pod' WHERE r.event_id=p.id AND r.org_id=t.org_id AND d.trip_id=t.id AND d.allocation_id=a.id AND d.created_at<=p.event_at)))))
 AND (NEW.kind<>'close' OR NOT EXISTS(SELECT 1 FROM trip_stage_active_events e WHERE e.org_id=t.org_id AND e.trip_id=t.id AND NOT EXISTS(SELECT 1 FROM json_each(NEW.payload,'$.stageTransition.prerequisiteEventIds') j WHERE j.value=e.id)))
 AND (NEW.kind<>'correction' OR json_extract(NEW.payload,'$.stageTransition.prerequisiteEventIds[0]')=NEW.target_event_id)
)
BEGIN SELECT RAISE(ABORT,'Trip follow-up requires authorized phase, scoped original evidence, complete prerequisites and resolved closure requirements.'); END;
--> statement-breakpoint
DROP TRIGGER trip_stage_dependency_scope;
--> statement-breakpoint
CREATE TRIGGER trip_stage_dependency_scope BEFORE INSERT ON trip_stage_event_dependencies
WHEN NOT EXISTS(SELECT 1 FROM trips t JOIN trip_events e ON e.id=NEW.event_id AND e.org_id=t.org_id AND e.trip_id=t.id JOIN trip_events p ON p.id=NEW.prerequisite_event_id AND p.org_id=e.org_id AND p.trip_id=e.trip_id JOIN memberships m ON m.org_id=e.org_id AND m.user_id=e.actor AND m.role IN ('OWNER','MEMBER','DISPATCHER')
 WHERE t.id=NEW.trip_id AND t.org_id=NEW.org_id AND t.version=e.version AND p.version<e.version AND p.event_at<=e.event_at AND p.recorded_at<=e.recorded_at AND (e.kind<>'correction' OR m.role='OWNER')
 AND (e.kind NOT IN ('pod_accept','pod_reject','close') OR m.role='OWNER')
 AND ((e.kind IN ('loading','arrival','delivery','pod_accept','pod_reject') AND EXISTS(SELECT 1 FROM trip_allocations a WHERE a.id=e.allocation_id AND a.org_id=e.org_id AND a.trip_id=e.trip_id AND a.active=1)) OR (e.kind NOT IN ('loading','arrival','delivery','pod_accept','pod_reject') AND e.allocation_id IS NULL))
 AND json_extract(t.creation_payload,'$.stagePolicyRequest.contract')='workspace_stage_v1' AND json_extract(e.payload,'$.stageTransition.contract') IN ('physical_stage_v1','trip_follow_up_v1')
 AND EXISTS(SELECT 1 FROM json_each(e.payload,'$.stageTransition.prerequisiteEventIds') j WHERE j.type='text' AND j.value=p.id)
 AND ((e.kind='loading' AND p.kind='placement' AND p.allocation_id IS NULL) OR (e.kind='dispatch' AND ((p.kind='placement' AND p.allocation_id IS NULL) OR (p.kind='loading' AND EXISTS(SELECT 1 FROM trip_allocations a WHERE a.id=p.allocation_id AND a.org_id=e.org_id AND a.trip_id=e.trip_id AND a.active=1)))) OR (e.kind='arrival' AND ((p.kind='dispatch' AND p.allocation_id IS NULL) OR (p.kind='loading' AND p.allocation_id=e.allocation_id))) OR (e.kind='delivery' AND ((p.kind='dispatch' AND p.allocation_id IS NULL) OR (p.kind='arrival' AND p.allocation_id=e.allocation_id))) OR (e.kind IN ('pod_accept','pod_reject') AND (p.kind='dispatch' OR (p.kind IN ('delivery','pod_accept','pod_reject') AND p.allocation_id=e.allocation_id))) OR (e.kind='exception' AND p.kind='dispatch') OR (e.kind='exception_resolve' AND (p.kind='dispatch' OR (p.kind='exception' AND p.id=e.target_event_id))) OR e.kind='close' OR (e.kind='correction' AND p.id=e.target_event_id AND p.kind NOT IN ('cancel','correction')))
 AND NOT EXISTS(SELECT 1 FROM trip_events c WHERE c.org_id=e.org_id AND c.trip_id=e.trip_id AND c.kind='correction' AND c.target_event_id=p.id AND c.id<>e.id) AND NOT EXISTS(SELECT 1 FROM trip_events c WHERE c.org_id=e.org_id AND c.trip_id=e.trip_id AND c.kind='correction' AND c.target_event_id=e.id))
BEGIN SELECT RAISE(ABORT,'Stage prerequisite link must match its current scoped event, original request and active history.'); END;
--> statement-breakpoint
DROP TRIGGER trip_stage_materialize_links;
--> statement-breakpoint
CREATE TRIGGER trip_stage_materialize_links AFTER INSERT ON trip_events
WHEN json_extract(NEW.payload,'$.stageTransition.contract') IN ('physical_stage_v1','trip_follow_up_v1')
BEGIN
 INSERT INTO trip_stage_event_dependencies SELECT NEW.id,value,NEW.org_id,NEW.trip_id FROM json_each(NEW.payload,'$.stageTransition.prerequisiteEventIds');
 INSERT INTO trip_stage_evidence_uses SELECT NEW.id,json_extract(value,'$.documentId'),json_extract(value,'$.reviewId'),NEW.org_id,NEW.trip_id FROM json_each(NEW.payload,'$.stageTransition.evidenceUses');
 INSERT INTO trip_document_reviews SELECT NEW.id,json_extract(NEW.payload,'$.documentId'),NEW.org_id WHERE json_extract(NEW.payload,'$.stageTransition.contract')='trip_follow_up_v1' AND json_type(NEW.payload,'$.documentId')='text';
END;
--> statement-breakpoint
CREATE TRIGGER trip_follow_up_pod_link_no_delete BEFORE DELETE ON trip_document_reviews
WHEN EXISTS(SELECT 1 FROM trip_events e WHERE e.id=OLD.event_id AND e.org_id=OLD.org_id AND json_extract(e.payload,'$.stageTransition.contract')='trip_follow_up_v1')
BEGIN SELECT RAISE(ABORT,'Original trip POD review links must be retained.'); END;
