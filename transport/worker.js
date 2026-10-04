// Public media transport ONLY. No UI, administration, credential endpoints, or URL fetching input.
export default {async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(!['GET','HEAD'].includes(request.method)||!/^\/video\/[0-9a-f-]{36}\/[0-9a-f]{64}\/source\.mp4$/.test(path))return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
  if(!env.PRIVATE_SITE_ORIGIN||!env.SITE_BYPASS_TOKEN)return new Response('Unavailable',{status:503});
  const target=new URL(env.PRIVATE_SITE_ORIGIN);if(target.protocol!=='https:'||!target.hostname.endsWith('.chatgpt.site'))return new Response('Unavailable',{status:503});
  target.pathname=path.replace('/video/','/transport/');
  const headers=new Headers({'OAI-Sites-Authorization':`Bearer ${env.SITE_BYPASS_TOKEN}`});
  const range=request.headers.get('Range');if(range)headers.set('Range',range);
  try{const r=await fetch(target,{method:request.method,headers,redirect:'manual',signal:AbortSignal.timeout(60000)});
    if(![200,206,404,416].includes(r.status))return new Response('Unavailable',{status:502,headers:{'Cache-Control':'no-store'}});
    const output=new Headers({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});for(const k of ['Content-Type','Content-Length','Accept-Ranges','Content-Range'])if(r.headers.has(k))output.set(k,r.headers.get(k));
    return new Response(r.body,{status:r.status,headers:output});
  }catch{return new Response('Unavailable',{status:502});}
}};
