import type { TransportService } from './service';
import { vehicleRegistration } from './trip-domain';
import type { Row } from './domain';

// Registrations are reference data, not a claim of ownership or RC verification.
// Old documents retain their original text; normalized IDs are used for lookups.
export class SharedService {
  constructor(private s:TransportService){}
  vehicleInsert(org:string,value:unknown){
    try{const registration=vehicleRegistration(value);return this.s.statement('INSERT INTO trip_vehicles (id,org_id,registration,created_at) VALUES (?,?,?,?) ON CONFLICT(org_id,registration) DO NOTHING',crypto.randomUUID(),org,registration,new Date().toISOString());}catch{return null;}
  }
  async vehicles(org:string){
    const known=await this.s.rows('SELECT id,registration FROM trip_vehicles WHERE org_id=? ORDER BY registration',org),seen=new Set(known.map(v=>v.registration));
    const sources=await this.s.rows('SELECT DISTINCT truck AS registration FROM consignments WHERE org_id=? UNION SELECT DISTINCT vehicle AS registration FROM transport_events WHERE org_id=?',org,org),writes:D1PreparedStatement[]=[];
    for(const source of sources){try{const registration=vehicleRegistration(source.registration);if(!seen.has(registration)){const insert=this.vehicleInsert(org,registration);if(insert)writes.push(insert);seen.add(registration);}}catch{/* Preserve unrecognized historical text without inventing a vehicle. */}}
    for(let i=0;i<writes.length;i+=80)await this.s.db.batch(writes.slice(i,i+80));
    return writes.length?this.s.rows('SELECT id,registration FROM trip_vehicles WHERE org_id=? ORDER BY registration',org):known;
  }
  async state():Promise<Row>{
    const m=await this.s.member(),org=m.org_id,vehicles=await this.vehicles(org);
    const locations=await this.s.rows("SELECT origin AS name FROM consignments WHERE org_id=? UNION SELECT destination AS name FROM consignments WHERE org_id=? ORDER BY name",org,org);
    if(m.role==='DISPATCHER')return {vehicles,locations};
    const [customers,suppliers]=await Promise.all([
      this.s.rows("SELECT name FROM companies WHERE org_id=? UNION SELECT company AS name FROM consignments WHERE org_id=? UNION SELECT name FROM parties WHERE org_id=? AND kind='customer' ORDER BY name",org,org,org),
      this.s.rows("SELECT name FROM parties WHERE org_id=? AND kind='supplier' UNION SELECT provider AS name FROM consignments WHERE org_id=? AND provider<>'' ORDER BY name",org,org),
    ]);return {vehicles,locations,customers,suppliers};
  }
}
