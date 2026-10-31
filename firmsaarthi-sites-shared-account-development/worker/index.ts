import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";
import {RESERVED,accessState} from '../lib/site-domain';

const worker = {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    const url=new URL(request.url),host=/^([a-z0-9-]+)\.firmsaarthi\.com$/.exec(url.hostname);
    const canonical=(env as unknown as {PUBLIC_URL?:string}).PUBLIC_URL;
    const publicAsset=url.pathname.startsWith('/_next/static/')||url.pathname.startsWith('/api/assets/')||url.pathname.startsWith('/w/');
    if(host&&!RESERVED.has(host[1])){
      if(url.pathname==='/'){url.pathname='/w/'+host[1];request=new Request(url,request);}
      else if(!publicAsset)return Response.redirect((canonical||'https://sites-by-firmsaarthi.arjit-tiwari-ece14.chatgpt.site')+url.pathname+url.search,303);
    }
    else if(canonical&&url.origin!==new URL(canonical).origin&&!publicAsset)return Response.redirect(new URL(url.pathname+url.search,canonical).href,307);
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    const publicPath=/^\/w\/([a-z0-9-]+)\/?$/.exec(new URL(request.url).pathname);
    if(publicPath&&env.DB){
      const row=await env.DB.prepare('SELECT status,paid_until,trial_ends_at FROM site_requests WHERE slug=?').bind(publicPath[1]).first<{status:string;paid_until:string|null;trial_ends_at:string|null}>();
      if(!row||!['active','preview'].includes(accessState(row)))return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Website unavailable — Sites by FirmSaarthi</title><style>body{margin:0;padding:12vh 8vw;background:#f7f8ef;color:#21382b;font:18px/1.6 system-ui}main{max-width:680px;margin:auto}h1{font-size:clamp(32px,6vw,52px);line-height:1.15}a{color:#286d5c}nav{display:flex;gap:28px;flex-wrap:wrap}</style><main><a href="https://sites.firmsaarthi.com">Sites by FirmSaarthi ↗</a><h1>This website is taking a little break.</h1><p>The owner can sign in to check their website or activate their annual plan. Saved website details remain available in their account.</p><nav><a href="https://sites.firmsaarthi.com/account">Manage my website ↗</a><a href="mailto:firmsaarthi@gmail.com">Contact FirmSaarthi</a></nav></main></html>',{status:row?410:404,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});
    }
    const result=await runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx));
    if(publicPath){const responseHeaders=new Headers(result.headers);responseHeaders.set('Cache-Control','no-store');return new Response(result.body,{status:result.status,headers:responseHeaders});}
    return result;
  },
};

export default worker;
