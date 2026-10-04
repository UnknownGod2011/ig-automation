import { readFileSync } from 'node:fs';
import { PublicInstagramDownloader, fetchVideo } from '../src/downloader.js';
const env = Object.fromEntries(readFileSync('ig-secrets.txt','utf8').split(/\r?\n/).filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}));
try {
  const r = await fetch(`https://graph.instagram.com/v26.0/${env.INSTAGRAM_USER_ID}?fields=id,username`,{headers:{Authorization:`Bearer ${env.INSTAGRAM_ACCESS_TOKEN}`},signal:AbortSignal.timeout(20000)});
  const d = await r.json();
  console.log(JSON.stringify({check:'Meta connection',http:r.status,connected:!!d.id,code:d.error?.code,error:d.error?.message?.replaceAll(env.INSTAGRAM_ACCESS_TOKEN,'[redacted]').replaceAll(env.INSTAGRAM_APP_SECRET,'[redacted]')}));
} catch { console.log('Meta connection: network failure'); }
try {
 const d = await new PublicInstagramDownloader().download('https://www.instagram.com/p/Db8yWXrswOT/');
 const v = await fetchVideo(d.mediaUrl); const reader=v.stream.getReader(); const {value}=await reader.read(); await reader.cancel();
 console.log(JSON.stringify({check:'source video',downloaded:true,size:v.size,mp4:Buffer.from(value).subarray(4,8).toString()==='ftyp'}));
} catch (e) { console.log(JSON.stringify({check:'source video',downloaded:false,error:e.message})); }
