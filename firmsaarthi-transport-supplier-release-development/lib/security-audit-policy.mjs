export function reviewDependencyAudit(audit,review,now=Date.now()){
 if(audit?.error||!audit?.metadata?.vulnerabilities||!audit.advisories||Array.isArray(audit.advisories)||!Number.isFinite(Date.parse(review?.expiresAt))||Date.parse(review.expiresAt)<=now)throw Error('A current complete dependency audit and unexpired review are required.');
 const vulnerabilities=audit.metadata.vulnerabilities;
 for(const key of ['info','low','moderate','high','critical'])if(!Number.isSafeInteger(vulnerabilities[key])||vulnerabilities[key]<0)throw Error('Dependency audit metadata is invalid.');
 if(vulnerabilities.high||vulnerabilities.critical)throw Error('High or critical dependency findings block publication.');
 if(Object.keys(audit.advisories).length===0&&Object.values(vulnerabilities).some(n=>n>0))throw Error('Dependency audit advisory details are incomplete.');
 const open=[];
 for(const finding of Object.values(audit.advisories)){
  const allowed=review.openToolFindings?.find(a=>a.id===finding.github_advisory_id&&a.module===finding.module_name&&a.severity===finding.severity);
  if(!allowed||!Array.isArray(finding.findings)||!finding.findings.length)throw Error('Unreviewed dependency finding blocks publication: '+finding.github_advisory_id);
  for(const instance of finding.findings)if(instance.dev!==true||instance.version!==allowed.version||!instance.paths?.length||instance.paths.some(p=>!allowed.paths.includes(p)))throw Error('Changed runtime/version/path needs review: '+finding.github_advisory_id);
  open.push({id:allowed.id,module:allowed.module,severity:allowed.severity,reason:allowed.reason});
 }
 return {vulnerabilities,openFindings:open};
}
