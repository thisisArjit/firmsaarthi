import { AppError, type TransportService } from './service';

// A scoped document must never be reused as a public-facing company logo/QR.
export async function unscopedAsset(s:TransportService,assetId:string,org:string){
  const asset=await s.owned('assets',assetId,org);
  if(await s.first('SELECT asset_id FROM asset_scopes WHERE asset_id=? AND org_id=?',assetId,org))throw new AppError('Private documents cannot be used as company images.',403);
  return asset;
}
export async function downloadableAsset(s:TransportService,assetId:string){
  const m=await s.commercial(),asset=await s.owned('assets',assetId,m.org_id),scope=await s.first('SELECT purpose FROM asset_scopes WHERE asset_id=? AND org_id=?',assetId,m.org_id);
  if(scope){
    await s.owner();
    if(scope.purpose==='trip_pod'){
      if(!await s.first('SELECT d.id FROM trip_documents d JOIN trip_allocations a ON a.id=d.allocation_id AND a.org_id=d.org_id AND a.trip_id=d.trip_id JOIN trips t ON t.id=d.trip_id AND t.org_id=d.org_id WHERE d.asset_id=? AND d.org_id=?',assetId,m.org_id))throw new AppError('Document not found.',404);
    }else if(scope.purpose!=='vehicle_document')throw new AppError('Document access is unavailable.',403);
  }
  return {asset,org:m.org_id,privateDocument:!!scope};
}
