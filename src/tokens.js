import {AppError} from './errors.js';
const enc=new TextEncoder();
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b)));
const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function hash(value){return b64(await crypto.subtle.digest('SHA-256',enc.encode(value)));}
async function key(secret){return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',enc.encode('reel-reposter-token:'+secret)),{name:'AES-GCM'},false,['encrypt','decrypt']);}
async function seal(value,secret){const iv=crypto.getRandomValues(new Uint8Array(12));return b64(iv)+'.'+b64(await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(secret),enc.encode(value)));}
async function open(value,secret){const[iv,data]=value.split('.');return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(iv)},await key(secret),bytes(data)));}
export async function getAccessToken(env,fetcher=fetch,now=Date.now()) {
  for(const k of ['INSTAGRAM_APP_ID','INSTAGRAM_APP_SECRET','INSTAGRAM_USER_ID','INSTAGRAM_ACCESS_TOKEN']) if(!env[k]) throw new AppError('Add Instagram credentials in Sites → Reel Reposter → More actions → Settings → environment variables/secrets.','connection',503);
  const fingerprint=await hash(env.INSTAGRAM_ACCESS_TOKEN);
  const row=await env.DB.prepare('SELECT * FROM token_state WHERE id=1').first();
  let current=env.INSTAGRAM_ACCESS_TOKEN;
  if(row?.fingerprint===fingerprint) {
    try{current=await open(row.ciphertext,env.INSTAGRAM_APP_SECRET);}catch{throw new AppError('Stored Instagram token could not be opened. Check the app secret in Sites settings.','connection',503);}
    if(row.expires_at<=now)throw new AppError('Instagram authorization expired. Generate a new token in Meta and replace the access-token secret in Sites.','connection',503);
    if(row.expires_at-now>7*86400000)return current;
    if(now-row.refreshed_at<86400000)return current;
  }
  const refresh=row?.fingerprint===fingerprint;
  const url=new URL(`https://graph.instagram.com/${refresh?'refresh_access_token':'access_token'}`);
  url.searchParams.set('grant_type',refresh?'ig_refresh_token':'ig_exchange_token');
  url.searchParams.set('access_token',current);
  if(!refresh)url.searchParams.set('client_secret',env.INSTAGRAM_APP_SECRET);
  // Official token endpoints require query parameters; never log their URL or response.
  let d,r;try{r=await fetcher(url,{redirect:'manual',signal:AbortSignal.timeout(20000)});d=await r.json();}catch(e){console.warn(JSON.stringify({event:'token_transport_failed',type:e?.name}));throw new AppError('Instagram token renewal is temporarily unavailable.','connection',503);}
  if(!r.ok || !d.access_token || !Number.isFinite(d.expires_in) || d.expires_in<86400) throw new AppError('Instagram token exchange or refresh failed. Check the Instagram app secret and token in Sites settings.','connection',503);
  await env.DB.prepare('INSERT INTO token_state (id,ciphertext,fingerprint,expires_at,refreshed_at) VALUES (1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET ciphertext=excluded.ciphertext,fingerprint=excluded.fingerprint,expires_at=excluded.expires_at,refreshed_at=excluded.refreshed_at').bind(await seal(d.access_token,env.INSTAGRAM_APP_SECRET),fingerprint,now+d.expires_in*1000,now).run();
  return d.access_token;
}
