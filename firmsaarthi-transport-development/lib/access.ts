import type { Row } from './domain';
// Explicit projection: adding a commercial column to source rows must not widen dispatch access.
export function operationalBooking(row:Row):Row{
  const safe:Row={};for(const key of ['id','year','cn','date','company','truck','origin','destination'])if(row[key]!==undefined)safe[key]=row[key];return safe;
}
