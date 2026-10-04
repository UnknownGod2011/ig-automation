import { AppError } from './errors.js';
export const CAPTION='FOLLOW FOR MORE!';
export const API_VERSION='v26.0';
export function sanitizeMetaMessage(message,env) {
  let s=String(message ?? 'Instagram could not complete this request.');
  for(const k of ['INSTAGRAM_ACCESS_TOKEN','INSTAGRAM_APP_SECRET','INSTAGRAM_USER_ID','INSTAGRAM_APP_ID']) if(env[k]) s=s.replaceAll(env[k],'[redacted]');
  return s.replace(/https?:\/\/\S+/g,'[address]').replace(/[A-Za-z0-9_-]{40,}/g,'[redacted]').slice(0,260);
}
export class MetaClient {
  constructor(env,token,fetcher=(...args)=>fetch(...args)) { this.env=env;this.token=token;this.fetcher=fetcher; }
  async request(path,params={},stage='sending',method='GET') {
    const url=new URL(`https://graph.instagram.com/${API_VERSION}/${path}`);
    if(method==='GET') for(const [k,v]of Object.entries(params)) url.searchParams.set(k,v);
    let r,d;
    try {
      r=await this.fetcher(url,{method,headers:{Authorization:`Bearer ${this.token}`,...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:JSON.stringify(params)}:{}),redirect:'manual',signal:AbortSignal.timeout(45000)});
      d=await r.json();
    } catch(e) { console.warn(JSON.stringify({event:'meta_transport_failed',type:e?.name}));throw new AppError('Instagram’s response was interrupted. Publication is not confirmed.',stage,502); }
    if(!r.ok || d.error) throw new AppError(sanitizeMetaMessage(d.error?.error_user_msg??d.error?.message,this.env),stage,502);
    return d;
  }
  async connected() { const d=await this.request(this.env.INSTAGRAM_USER_ID,{fields:'id,username'},'connection'); if(!validId(d.id)) throw new AppError('Instagram account could not be verified.','connection',503);return true; }
  async create(videoUrl,isAi=false) {const d=await this.request(`${this.env.INSTAGRAM_USER_ID}/media`,{media_type:'REELS',video_url:videoUrl,caption:CAPTION,share_to_feed:true,...(isAi?{is_ai_generated:true}:{})},'sending','POST');if(!validId(d.id))throw new AppError('Instagram did not return a valid container ID.','sending',502);return d.id;}
  async status(container) { const d=await this.request(container,{fields:'status_code,status'},'processing');return {code:d.status_code,message:sanitizeMetaMessage(d.status,this.env)}; }
  async publish(container) {const d=await this.request(`${this.env.INSTAGRAM_USER_ID}/media_publish`,{creation_id:container},'publishing','POST');if(!validId(d.id))throw new AppError('Instagram did not return a media ID. Check Instagram before trying anything else.','publishing',502);return d.id;}
  async inspectMedia(id) {return this.request(id,{fields:'id,caption,media_type,media_product_type,permalink'},'verification');}
}
export const validId = id => typeof id==='string' && /^[0-9]{5,30}$/.test(id);
