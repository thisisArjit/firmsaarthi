import type {Row} from './domain';
export function companyAccountGroups(data:Row|null,name?:string):Row[]{
  if(!data)return [];
  if(!name)return data.groups;
  const keys=new Set<string>(data.documents.filter((d:Row)=>d.label===name).map((d:Row)=>d.key));
  for(const alias of data.aliases.filter((a:Row)=>a.alias===name))keys.add('party:'+alias.party_id);
  return data.groups.filter((g:Row)=>keys.has(g.key));
}
