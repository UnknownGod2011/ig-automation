import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {readFile,writeFile,rename,stat,unlink,open} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {request as httpsRequest} from 'node:https';
import {Resolver} from 'node:dns/promises';
import {MetaClient,validId} from '../src/meta.js';

// Windows' default resolver can negatively cache newly allocated tunnel names.
// Resolve this public transport through Cloudflare DNS, preserving hostname/TLS checks.
async function transportHead(url){
  const resolver=new Resolver();resolver.setServers(['1.1.1.1']);
  return new Promise((resolve,reject)=>{
    const req=httpsRequest(url,{method:'HEAD',lookup:(host,options,callback)=>resolver.resolve4(host).then(a=>options.all?callback(null,a.map(address=>({address,family:4}))):callback(null,a[0],4),callback)},res=>{
      res.resume();resolve({status:res.statusCode,ok:res.statusCode>=200&&res.statusCode<300,headers:new Headers(res.headers)});
    });req.setTimeout(15000,()=>req.destroy(Error('Transport timeout')));req.on('error',reject);req.end();
  });
}

// A local, explicitly invoked batch. No scheduled posts or credential-bearing URLs.
export async function publishOnce(meta,job,save){
  if(job.mediaId)return job.mediaId;
  if(job.publishAttempted)throw Error('Publication outcome is unconfirmed; automatic reposting is blocked.');
  job.publishAttempted=true;await save();
  const id=await meta.publish(job.containerId);
  if(!validId(id))throw Error('Instagram did not return a valid media ID.');
  job.mediaId=id;job.status='published';job.error=null;await save();return id;
}
export function videoHandler(files,ledger){return async(req,res)=>{
  const file=files.get(req.url);
  if(!file||!['GET','HEAD'].includes(req.method)||ledger[file.youtubeId]?.mediaId){res.writeHead(404);res.end();return;}
  try{
    const size=(await stat(file.localFile)).size;let start=0,end=size-1,status=200;
    const range=req.headers.range;
    if(range){const m=/^bytes=(\d*)-(\d*)$/.exec(range);if(!m||(!m[1]&&!m[2])){res.writeHead(416);res.end();return;}
      if(!m[1])start=Math.max(0,size-Number(m[2]));else{start=Number(m[1]);if(m[2])end=Math.min(Number(m[2]),size-1);}
      if(start>end||start>=size){res.writeHead(416,{'Content-Range':`bytes */${size}`});res.end();return;}status=206;
    }
    res.writeHead(status,{'Content-Type':'video/mp4','Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(status===206?{'Content-Range':`bytes ${start}-${end}/${size}`}:{})});
    if(req.method==='HEAD'){res.end();return;}const stream=createReadStream(file.localFile,{start,end});stream.on('error',()=>res.destroy());stream.pipe(res);
  }catch{res.writeHead(404);res.end();}
};}

async function main(){
  const planPath=resolve(process.argv[2]??'artifacts/sh10comps-publish-plan.json');
  const root=dirname(planPath),ledgerPath=resolve(root,'sh10comps-publication-state.json'),lockPath=ledgerPath+'.lock';
  const lock=await open(lockPath,'wx');await lock.writeFile(String(process.pid));
  let tunnel,server;
  try{
    const plan=JSON.parse(await readFile(planPath,'utf8'));
    if(!Array.isArray(plan)||plan.length<1||plan.length>20||new Set(plan.map(item=>item.youtubeId)).size!==plan.length)throw Error('A controlled batch requires 1–20 unique selected videos.');
    let ledger={};try{ledger=JSON.parse(await readFile(ledgerPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
    const save=async()=>{await writeFile(ledgerPath+'.tmp',JSON.stringify(ledger,null,2));await rename(ledgerPath+'.tmp',ledgerPath);};
    const env={},raw=await readFile(resolve('ig-secrets.txt'),'utf8');
    for(const name of ['INSTAGRAM_APP_ID','INSTAGRAM_APP_SECRET','INSTAGRAM_USER_ID','INSTAGRAM_ACCESS_TOKEN']){
      const hit=raw.match(new RegExp('^\\s*'+name+'\\s*[:=]\\s*["\']?([^\\r\\n"\']+)','m'));if(!hit)throw Error('Missing Instagram credential: '+name);env[name]=hit[1].trim();
    }
    const meta=new MetaClient(env,env.INSTAGRAM_ACCESS_TOKEN);await meta.connected();
    const files=new Map(),paths=new Map();
    for(const item of plan){
      if(!/^[A-Za-z0-9_-]{11}$/.test(item.youtubeId)||typeof item.caption!=='string'||item.caption.length>2200)throw Error('Invalid batch metadata.');
      const file=resolve(item.localFile),rel=relative(resolve(root,'youtube-top10'),file);
      if(rel.startsWith('..')||rel.includes(':')||!file.endsWith('.mp4'))throw Error('Video must remain inside the batch media directory.');
      if(ledger[item.youtubeId]?.mediaId)continue;
      await stat(file);const path='/video/'+randomBytes(32).toString('hex')+'/'+item.youtubeId+'.mp4';files.set(path,item);paths.set(item.youtubeId,path);
    }
    server=createServer(videoHandler(files,ledger));await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const executable=process.env.CLOUDFLARED_PATH??'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe';
    tunnel=spawn(executable,['tunnel','--url','http://127.0.0.1:'+server.address().port,'--protocol','http2','--no-autoupdate'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    const origin=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Temporary transport could not start.')),45000);let log='';const scan=chunk=>{log+=chunk.toString();const found=log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);if(found){clearTimeout(timeout);resolve(found[0]);}};tunnel.stdout.on('data',scan);tunnel.stderr.on('data',scan);tunnel.on('error',()=>{clearTimeout(timeout);reject(Error('Temporary transport executable failed.'));});});
    console.log(JSON.stringify({event:'temporary_transport_ready',count:files.size,host:new URL(origin).hostname}));
    let reachable=false;
    for(let attempt=0;attempt<12;attempt++){
      try{const probe=await transportHead(origin);if(probe.status===404){reachable=true;break;}}
      catch(e){console.log(JSON.stringify({event:'transport_starting',attempt:attempt+1,type:e.cause?.code??e.name}));}
      await new Promise(r=>setTimeout(r,5000));
    }
    if(!reachable)throw Error('Temporary tunnel did not become reachable; no media containers created.');
    for(const item of plan){
      let job=ledger[item.youtubeId]??={status:'pending',caption:item.caption,sourceUrl:item.sourceUrl};
      if(job.mediaId){
        await unlink(item.localFile).catch(e=>{if(e.code!=='ENOENT')throw e;});job.localVideoDeleted=true;
        const proof=await meta.inspectMedia(job.mediaId);
        if(proof.caption!==item.caption||proof.media_product_type!=='REELS')throw Error('Existing Reel verification mismatch.');
        job.permalink=proof.permalink;job.verified=true;await save();
        console.log(JSON.stringify({rank:item.rank,event:'existing_publication',mediaId:job.mediaId}));continue;
      }
      if(job.publishAttempted){console.log(JSON.stringify({rank:item.rank,event:'uncertain_skip'}));continue;}
      try{
        if(!job.containerId){
          const url=origin+paths.get(item.youtubeId);const transport=await transportHead(url);
          if(!transport.ok||Number(transport.headers.get('content-length'))!==item.bytes)throw Error('Temporary video transport verification failed.');
          job.containerId=await meta.create(url,false,item.caption);job.status='processing';await save();
        }
        let finished=false;
        for(let poll=0;poll<30;poll++){
          const state=await meta.status(job.containerId);
          console.log(JSON.stringify({rank:item.rank,event:'processing',status:state.code}));
          if(state.code==='FINISHED'){finished=true;break;}
          if(['ERROR','EXPIRED'].includes(state.code))throw Error(state.message||'Instagram processing failed.');
          if(state.code==='PUBLISHED')throw Error('Container already published without a saved media ID; do not repost.');
          await new Promise(r=>setTimeout(r,60000));
        }
        if(!finished)throw Error('Instagram processing timeout; do not create another job.');
        await publishOnce(meta,job,save);
        await unlink(item.localFile);job.localVideoDeleted=true;await save();
        const proof=await meta.inspectMedia(job.mediaId);
        if(proof.caption!==item.caption||proof.media_product_type!=='REELS')throw Error('Published Reel verification mismatch.');
        job.permalink=proof.permalink;job.verified=true;await save();
        console.log(JSON.stringify({rank:item.rank,event:'published',mediaId:job.mediaId,permalink:proof.permalink,localVideoDeleted:true}));
      }catch(e){job.error=e.message;job.status=job.mediaId?'published':job.publishAttempted?'uncertain':'failed';await save();console.log(JSON.stringify({rank:item.rank,event:'failed',error:e.message}));}
    }
    console.log(JSON.stringify({event:'batch_complete',published:Object.values(ledger).filter(j=>j.mediaId).length,verified:Object.values(ledger).filter(j=>j.verified).length}));
  }finally{tunnel?.kill();server?.close();await lock.close();await unlink(lockPath);}
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname.replace(/^\/(\w:)/,'$1'))){main().catch(e=>{console.error(JSON.stringify({event:'batch_stopped',error:e.message}));process.exitCode=1;});}
