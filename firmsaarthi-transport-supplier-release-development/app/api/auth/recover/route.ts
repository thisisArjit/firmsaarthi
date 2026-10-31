export async function POST(_request?:Request){return Response.json({error:'Use email password reset to recover your account.'},{status:410,headers:{'Cache-Control':'no-store'}});}
