import {sameOrigin} from '@/lib/auth';
import {AppError} from '@/lib/service';
import {TripStageReviews} from '@/lib/trip-stage-reviews';
import {boundedBody} from '@/lib/request-body';
import {stageOwner,stageFailure,stageHeaders,stageId,noStageQuery} from '@/lib/stage-document-http';
export const dynamic='force-dynamic';

export async function POST(request:Request){try{
  sameOrigin(request);const s=await stageOwner(request);noStageQuery(request);
  if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw new AppError('Use a JSON review request.',415);
  const bytes=await boundedBody(request,8192);let body:Record<string,unknown>;
  try{const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();body=value;}catch{throw new AppError('Enter a valid stage review request.');}
  const required=['tripId','documentId','kind','version','eventAt','note','requestId'],allowed=[...required,'targetId'];
  if(required.some(k=>!Object.hasOwn(body,k))||Object.keys(body).some(k=>!allowed.includes(k)))throw new AppError('Use only the required stage review fields and an optional correction target.');
  stageId(body.tripId);stageId(body.documentId);if(body.targetId!==undefined&&body.targetId!==null)stageId(body.targetId);
  return Response.json(await new TripStageReviews(s).record(body),{headers:stageHeaders});
}catch(error){return stageFailure(error);}}
