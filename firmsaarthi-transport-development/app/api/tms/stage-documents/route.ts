import {env} from 'cloudflare:workers';
import {sameOrigin} from '@/lib/auth';
import {AppError} from '@/lib/service';
import {TripStageDocuments} from '@/lib/trip-stage-documents';
import {boundedBody} from '@/lib/request-body';
import {stageOwner,stageFailure,stageHeaders,stageId,noStageQuery} from '@/lib/stage-document-http';
export const dynamic='force-dynamic';

// Unpublished: stage milestones and UI must be complete before hosting this flow.
export async function GET(request:Request){try{
  const s=await stageOwner(request),url=new URL(request.url),keys=[...url.searchParams.keys()];
  if(keys.length!==1||!['tripId','assetId'].includes(keys[0]))throw new AppError('Choose one trip or stage file.');
  const value=stageId(url.searchParams.get(keys[0])),files=new TripStageDocuments(s);
  if(keys[0]==='tripId')return Response.json(await files.state(value),{headers:stageHeaders});
  const {asset,org}=await files.file(value);
  if(!env.BUCKET)throw new AppError('Document storage is unavailable.',503);
  const object=await env.BUCKET.get(org+'/'+asset.id);if(!object)throw new AppError('Stage file is unavailable.',404);
  const extension=asset.mime==='application/pdf'?'pdf':asset.mime==='image/png'?'png':asset.mime==='image/jpeg'?'jpg':null;
  if(!extension)throw new AppError('Stage file type is unavailable.',503);
  const name=encodeURIComponent(asset.name).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
  return new Response(object.body,{headers:{...stageHeaders,'Content-Type':asset.mime,'Content-Disposition':`attachment; filename="stage-document.${extension}"; filename*=UTF-8''${name}`,'Content-Security-Policy':"sandbox; default-src 'none'"}});
}catch(error){return stageFailure(error);}}

export async function POST(request:Request){try{
  sameOrigin(request);const s=await stageOwner(request);noStageQuery(request);
  if(!env.BUCKET)throw new AppError('Document storage is unavailable.',503);
  const type=request.headers.get('content-type')||'';
  if(type.split(';')[0].trim().toLowerCase()!=='multipart/form-data')throw new AppError('Use a file upload request.',415);
  const bytes=await boundedBody(request,3*1024*1024);let form:FormData;
  try{form=await new Response(bytes,{headers:{'Content-Type':type}}).formData();}catch{throw new AppError('Choose a valid file upload request.');}
  const allowed=['tripId','allocationId','stage','version','requestId','file'];
  if([...form.keys()].some(key=>!allowed.includes(key)||form.getAll(key).length!==1))throw new AppError('Use only the stage file fields once each.');
  for(const key of ['tripId','stage','version','requestId'])if(typeof form.get(key)!=='string')throw new AppError('Complete the stage file details.');
  const tripId=stageId(form.get('tripId')),allocation=form.get('allocationId');
  if(allocation!==null&&typeof allocation!=='string')throw new AppError('Choose a valid consignment scope.');
  const allocationId=allocation?stageId(allocation):null,version=form.get('version') as string;
  if(!/^[1-9][0-9]{0,15}$/.test(version)||!Number.isSafeInteger(Number(version)))throw new AppError('Reload this trip before uploading.',409);
  const file=form.get('file');if(!(file instanceof File))throw new AppError('Choose a stage file.');
  if(file.size>2097152)throw new AppError('Upload a PDF, PNG or JPEG up to 2 MB.',413);
  const data={tripId,allocationId,stage:form.get('stage'),version:Number(version),requestId:form.get('requestId')};
  return Response.json(await new TripStageDocuments(s).upload(data,{name:file.name,type:file.type,bytes:new Uint8Array(await file.arrayBuffer())},env.BUCKET),{headers:stageHeaders});
}catch(error){return stageFailure(error);}}
