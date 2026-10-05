import { AppError } from './errors.js';
import { normalizeReelUrl, isInstagramCdn } from './url.js';

/** @typedef {{mediaUrl: string, mimeType: string}} DownloadResult */
/** @typedef {{download(url: string): Promise<DownloadResult>}} ReelDownloader */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const headers = { 'User-Agent': UA, 'X-IG-App-ID': '936619743392459', 'Referer': 'https://www.instagram.com/', 'Accept-Language': 'en-US,en;q=0.9' };
const failure = () => new AppError('Instagram did not provide this public video. It may be private, unavailable, or temporarily rate limited.', 'downloading', 422);

export function extractPublicVideo(data, expectedShortcode) {
  // Only accept the media object returned for the requested public post; never a related recommendation.
  const p = data?.data?.xig_polaris_media?.if_not_gated_logged_out ?? data?.data?.xdt_shortcode_media ?? data?.graphql?.shortcode_media ?? data?.gql_data?.shortcode_media ?? data?.items?.[0];
  if (!p || p.owner?.is_private || p.user?.is_private || p.carousel_media || p.edge_sidecar_to_children) return null;
  if (expectedShortcode && p.shortcode && p.shortcode !== expectedShortcode) return null;
  const best = p.video_versions?.filter(v => isInstagramCdn(v.url)).sort((a,b) => b.width*b.height-a.width*a.height)[0]?.url;
  const url = best ?? (p.is_video !== false ? p.video_url : null);
  return isInstagramCdn(url) ? { mediaUrl: url, mimeType: 'video/mp4' } : null;
}

// Logged-out metadata extraction adapted from yt-dlp's maintained Instagram extractor.
// No account credentials, session cookies, or login automation are used.
export class PublicInstagramDownloader {
  constructor(fetcher = (...args)=>fetch(...args), {now=()=>Date.now(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))} = {}) { this.fetcher = fetcher; this.now=now; this.sleep=sleep; }
  async download(input) {
    // Tracking links and plural paths must use the same public request and retry policy.
    const {url}=normalizeReelUrl(input);
    const deadline=this.now()+60000;
    const observations=[];
    const fetcher=async(target,options)=>{
      const remaining=deadline-this.now();
      if(remaining<=0)throw failure();
      const kind=target.includes('/embed/')?'embed':target.includes('/api/graphql')?'metadata':'page';
      try{
        const response=await this.fetcher(target,{...options,signal:AbortSignal.timeout(Math.min(25000,remaining))});
        observations.push({kind,status:response.status});
        return response;
      }catch{observations.push({kind,status:0});throw failure();}
    };
    for(let attempt=0;attempt<2;attempt++){
      if(attempt){if(deadline-this.now()<=1500)break;await this.sleep(1500);}
      try{return await this.downloadOnce(url,fetcher);}catch(error){if(error.retryable===false)throw error;if(this.now()>=deadline)break;}
    }
    // Only fixed method names and HTTP status codes; no URLs, response bodies or credentials.
    console.warn(JSON.stringify({event:'public_download_unavailable',requests:observations}));
    throw failure();
  }
  async downloadOnce(input,fetcher) {
    const { shortcode } = normalizeReelUrl(input);
    const target = `https://www.instagram.com/p/${shortcode}/`;
    let html = '';
    try {
      // Most public Reels expose their complete original MP4 in the embed. Try this
      // before extra page/GraphQL requests, which increase rate-limit pressure.
      try {
        const embed = await fetcher(`${target}embed/captioned/`, {headers:{'User-Agent':'Mozilla/5.0'},redirect:'manual'});
        if(embed.ok){
          const text=await embed.text();
          const context=text.match(/"contextJSON":("(?:\\.|[^"\\])*")/);
          if(context){const data=JSON.parse(JSON.parse(context[1]));if(data.context?.shortcode===shortcode){if(data.context?.copyright_blocked){const error=new AppError('Instagram blocks public download of this video for copyright reasons. Try another Reel.','downloading',422);error.retryable=false;throw error;}const found=extractPublicVideo(data,shortcode);if(found)return found;}}
        }
      }catch(error){if(error.retryable===false)throw error; /* Fall back to public page metadata, never a login or cookies. */ }
      const response = await fetcher(target, { headers, redirect: 'manual' });
      if (response.ok) html = await response.text();
      // Embedded public metadata is preferable to an additional API call.
      for (const script of html.matchAll(/<script\b[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)) {
        let root; try { root = JSON.parse(script[1]); } catch { continue; }
        const stack = [root];
        while (stack.length) {
          const x = stack.pop(); if (!x || typeof x !== 'object') continue;
          const found = extractPublicVideo(x,shortcode); if (found) return found;
          stack.push(...Object.values(x).filter(v => v && typeof v === 'object'));
        }
      }
      const lsd = html.match(/\["LSD",\[\],\{"token":"([^"]+)"/)?.[1] ?? html.match(/"lsd"\s*:\s*"([^"]+)"/)?.[1] ?? '';
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
      let pk = 0n; for (const c of shortcode) pk = pk*64n+BigInt(alphabet.indexOf(c));
      const requests = [
        { doc_id: '27130156389949648', variables: JSON.stringify({media_id: pk.toString()}), fb_api_req_friendly_name: 'PolarisLoggedOutDesktopWWWPostRootContentQuery' },
        { doc_id: '8845758582119845', variables: JSON.stringify({shortcode}), fb_api_req_friendly_name: 'PolarisPostActionLoadPostQueryQuery' },
      ];
      for (const body of requests) {
        try {
          const r = await fetcher('https://www.instagram.com/api/graphql', {method:'POST', headers: {...headers, 'Content-Type':'application/x-www-form-urlencoded', 'X-FB-LSD':lsd, 'X-FB-Friendly-Name':body.fb_api_req_friendly_name}, body:new URLSearchParams({...body,lsd,fb_api_caller_class:'RelayModern',server_timestamps:'true'}), redirect:'manual'});
          if (r.ok) { const found = extractPublicVideo(await r.json(),shortcode); if (found) return found; }
        } catch { /* Try the next public-only extraction method. */ }
      }
    } catch(error) {if(error.retryable===false)throw error; /* Upstream details are deliberately not exposed. */ }
    throw failure();
  }
}

export class CobaltDownloader {
  constructor(endpoint, apiKey, fetcher = (...args)=>fetch(...args)) { this.endpoint = endpoint; this.apiKey = apiKey; this.fetcher = fetcher; }
  async download(input) {
    const { url } = normalizeReelUrl(input);
    const endpoint = new URL(this.endpoint);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) throw new AppError('The downloader configuration is invalid.', 'downloading', 503);
    try {
      const r = await this.fetcher(endpoint, {method:'POST', headers:{Accept:'application/json','Content-Type':'application/json',...(this.apiKey ? {Authorization:`Api-Key ${this.apiKey}`} : {})},body:JSON.stringify({url,videoQuality:'max',localProcessing:'disabled',alwaysProxy:false}),redirect:'manual',signal:AbortSignal.timeout(45000)});
      const d = await r.json();
      // A trusted instance may return its own tunnel. Other destinations must be Instagram CDN hosts.
      const u = new URL(d.url);
      if (!r.ok || !['redirect','tunnel'].includes(d.status) || u.protocol !== 'https:' || u.username || u.password || u.port || !(isInstagramCdn(d.url) || u.origin === endpoint.origin)) throw failure();
      return {mediaUrl:d.url,mimeType:'video/mp4'};
    } catch { throw failure(); }
  }
}

export function downloaderFor(env, fetcher = (...args)=>fetch(...args)) {
  return env.COBALT_API_URL ? new CobaltDownloader(env.COBALT_API_URL,env.COBALT_API_KEY,fetcher) : new PublicInstagramDownloader(fetcher);
}

export async function fetchVideo(mediaUrl, fetcher = (...args)=>fetch(...args), cobaltOrigin = '') {
  let url = mediaUrl;
  for (let i=0;i<4;i++) {
    const u = new URL(url);
    if (!isInstagramCdn(url) && !(cobaltOrigin && u.origin === cobaltOrigin && u.protocol === 'https:' && !u.username && !u.password && !u.port)) throw new AppError('Downloader returned an unsafe video address.', 'downloading', 422);
    const r = await fetcher(url,{headers:{Referer:'https://www.instagram.com/'},redirect:'manual',signal:AbortSignal.timeout(60000)});
    if ([301,302,303,307,308].includes(r.status)) { url = new URL(r.headers.get('location'),url).href; continue; }
    if (!r.ok || !r.body || !/^(video\/mp4|application\/octet-stream)(;|$)/i.test(r.headers.get('content-type') ?? '')) throw failure();
    const size = Number(r.headers.get('content-length'));
    // R2 streaming puts need a known length; don't buffer arbitrary videos in a 128 MB isolate.
    if (!Number.isSafeInteger(size) || size <= 0 || size > 1024*1024*1024) throw new AppError('The video size is unavailable or exceeds Instagram’s limit.', 'downloading', 422);
    return {stream:r.body,size,mimeType:'video/mp4'};
  }
  throw failure();
}
