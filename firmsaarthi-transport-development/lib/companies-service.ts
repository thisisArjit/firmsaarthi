import {AppError,type TransportService} from './service';
import type {Row} from './domain';
export class CompaniesService {
  constructor(private s:TransportService){}
  async state(name:string|null=null):Promise<Row>{
    const s=this.s,m=await s.commercial(),org=m.org_id;
    const companies=await s.rows(`SELECT n.name,COALESCE(p.address,'') AS address,COALESCE(p.gst,'') AS gst,
      (SELECT COUNT(*) FROM consignments c WHERE c.org_id=? AND c.company=n.name) AS bookings,
      (SELECT COUNT(*) FROM invoices i WHERE i.org_id=? AND i.company=n.name) AS invoices
      FROM (SELECT name FROM companies WHERE org_id=? UNION SELECT company FROM consignments WHERE org_id=? UNION SELECT company FROM invoices WHERE org_id=?) n
      LEFT JOIN companies p ON p.id=(SELECT id FROM companies WHERE org_id=? AND name=n.name ORDER BY rowid LIMIT 1)
      WHERE trim(n.name)<>'' ORDER BY n.name`,org,org,org,org,org,org);
    if(name===null)return {companies};
    const company=companies.find(c=>c.name===name);if(!company)throw new AppError('Company not found in this workspace.',404);
    const [consignments,invoices]=await Promise.all([
      s.rows(`SELECT c.id,c.year,c.cn,c.date,c.truck,c.origin,c.destination,c.freight,c.advance,i.id AS invoice_id,i.number AS invoice_number
        FROM consignments c LEFT JOIN invoice_items x ON x.consignment_id=c.id LEFT JOIN invoices i ON i.id=x.invoice_id AND i.org_id=c.org_id
        WHERE c.org_id=? AND c.company=? ORDER BY c.date DESC,c.cn`,org,name),
      s.rows(`SELECT id,number,year,date,total,paid FROM invoices WHERE org_id=? AND company=? ORDER BY date DESC,number DESC`,org,name)
    ]);
    return {companies,company,consignments,invoices};
  }
}
