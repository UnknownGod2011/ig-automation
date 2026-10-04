import {page} from './page.js';
import {Reposter} from './jobs.js';
import {AppError,safeError} from './errors.js';
import {authenticated,login,sameSecret} from './auth.js';
import {accessPage} from './access-page.js';
const response=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export default {
  async fetch(request,env){
    const url=new URL(request.url);const app=new Reposter(env);
    try{
      if(request.method==='GET'&&url.pathname==='/'){
        const nonce=crypto.randomUUID();
        const html=await authenticated(request,env)?page(nonce):accessPage(nonce);
        return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src data:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`}});
      }
      const video=/^\/transport\/([0-9a-f-]{36})\/([0-9a-f]{64})\/source\.mp4$/.exec(url.pathname);
      if(video&&['GET','HEAD'].includes(request.method)){
        const j=await app.store.get(video[1]);
        if(!j || j.video_token!==video[2] || !j.object_key || j.media_id)return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
        const object=request.method==='HEAD'?await env.BUCKET.head(j.object_key):await env.BUCKET.get(j.object_key,{range:request.headers});
        if(!object)return new Response('Not found',{status:404});
        const h=new Headers({'Content-Type':'video/mp4','Cache-Control':'no-store','Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff','Content-Length':String(object.range?.length??object.size)});
        if(object.range)h.set('Content-Range',`bytes ${object.range.offset}-${object.range.offset+object.range.length-1}/${object.size}`);
        return new Response(request.method==='HEAD'?null:object.body,{status:object.range?206:200,headers:h});
      }
      if(!url.pathname.startsWith('/api/')||request.method!=='POST')return new Response('Not found',{status:404});
      const origin=request.headers.get('Origin');
      if(origin && origin!==(env.SITE_ORIGIN??url.origin))throw new AppError('This request must come from this Site.','validation',403);
      if(request.headers.get('Sec-Fetch-Site')==='cross-site')throw new AppError('This request must come from this Site.','validation',403);
      if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')??''))throw new AppError('Use a JSON request.','validation',415);
      if(Number(request.headers.get('Content-Length'))>16384)throw new AppError('Request is too large.','validation',413);
      if(url.pathname==='/api/access')return await login(request,env);
      if(url.pathname==='/api/maintenance'){
        const bearer=/^Bearer (.+)$/.exec(request.headers.get('Authorization')??'')?.[1];
        if(!await sameSecret(bearer,env.MAINTENANCE_TOKEN))throw new AppError('Maintenance access denied. Send the Site service token as Bearer authorization.','access',401);
        const result=await app.maintenance();await app.client();return response(result);
      }
      if(!await authenticated(request,env))throw new AppError('Enter the shared passcode to continue.','access',401);
      if(url.pathname==='/api/connection'){await(await app.client()).connected();await app.maintenance();return response({connected:true});}
      if(url.pathname==='/api/jobs'){
        const body=await request.text();if(body.length>16384)throw new AppError('Request is too large.','validation',413);
        let d;try{d=JSON.parse(body);}catch{throw new AppError('Invalid request.');}
        return response(await app.create(d.id,d.url,d.caption));
      }
      const route=/^\/api\/jobs\/([0-9a-f-]{36})\/(advance|retry|inspect)$/.exec(url.pathname);
      if(route){
        if(route[2]==='advance')return response(await app.advance(route[1]));
        if(route[2]==='retry')return response(await app.retry(route[1]));
        const j=await app.store.get(route[1]);if(!j?.media_id)throw new AppError('No confirmed published media.','verification',409);
        return response({media:await(await app.client()).inspectMedia(j.media_id),temporaryVideoExists:j.object_key?!!await env.BUCKET.head(j.object_key):false});
      }
      return new Response('Not found',{status:404});
    }catch(e){console.warn(JSON.stringify({event:'request_failed',stage:e.stage??'internal',status:e.status??500}));return response({error:safeError(e),stage:e.stage??'internal'},e.status??500);}
  },
  async scheduled(_event,env,ctx){ctx.waitUntil(new Reposter(env).maintenance());},
};
