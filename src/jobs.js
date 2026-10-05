import {AppError,safeError} from './errors.js';
import {JobStore,publicJob} from './store.js';
import {normalizeReelUrl} from './url.js';
import {downloaderFor,fetchVideo} from './downloader.js';
import {MetaClient} from './meta.js';
import {getAccessToken} from './tokens.js';
export class Reposter {
  constructor(env,{fetcher=(...args)=>fetch(...args),now=()=>Date.now(),downloader,meta,tokenProvider=getAccessToken,maxDownloadAttempts=5}={}){this.env=env;this.fetcher=fetcher;this.now=now;this.store=new JobStore(env.DB);this.downloader=downloader??downloaderFor(env,fetcher);this.meta=meta;this.tokenProvider=tokenProvider;this.maxDownloadAttempts=maxDownloadAttempts;}
  async client(){return this.meta??new MetaClient(this.env,await this.tokenProvider(this.env,this.fetcher,this.now()),this.fetcher);}
  async create(id,url,caption='FOLLOW FOR MORE FOOTBALL CONTENT!'){if(typeof caption!=='string'||Array.from(caption).length>2200||caption.includes('\0'))throw new AppError('Caption must contain at most 2,200 characters.');if(!/^[0-9a-f-]{36}$/.test(id??''))throw new AppError('Invalid request ID.');const n=normalizeReelUrl(url);const existing=await this.store.get(id);if(existing&&existing.shortcode!==n.shortcode)throw new AppError('This request ID already belongs to another Reel.', 'validation',409);return publicJob(await this.store.create(id,n,this.now(),caption));}
  async cleanup(job,lease){
    if(!job.object_key){if(job.cleanup_pending)await this.store.update(job.id,{cleanup_pending:0},lease);return;}
    await this.env.BUCKET.delete(job.object_key);
    if(await this.env.BUCKET.head(job.object_key))throw new AppError('The Reel is published, but temporary-video cleanup needs another attempt.','cleanup',503);
    await this.store.update(job.id,{object_key:null,cleanup_pending:0,updated_at:this.now()},lease);
  }
  async advance(id){
    let job=await this.store.get(id);if(!job)throw new AppError('Job not found.','validation',404);
    if(job.media_id){if(job.object_key){try{await this.cleanup(job);}catch{await this.store.update(id,{cleanup_pending:1});}}return publicJob(await this.store.get(id));}
    if(job.status==='failed'||job.poll_after>this.now())return publicJob(job);
    const lease=await this.store.lease(id,this.now());if(!lease)return publicJob(await this.store.get(id));
    try{
      job=await this.store.get(id);
      if(job.publish_attempted){
        // Never repeat media_publish, regardless of upstream/network/runtime retry advice.
        const state=await(await this.client()).status(job.container_id);
        if(['PUBLISHED','ERROR','EXPIRED'].includes(state.code))await this.cleanup(job,lease);
        await this.store.update(id,{status:'uncertain',error:state.code==='PUBLISHED'?'Instagram reports publication, but the media ID was not received. Check your Instagram account; this job will not post again.':'Publication outcome is unconfirmed. Check Instagram; automatic reposting is blocked.',poll_after:this.now()+60000},lease);
      }else if(job.status==='downloading'){
        // Reserve the object key BEFORE writing bytes so a crash leaves an identifiable orphan.
        const objectKey=`temp-reels/${id}/source.mp4`;
        await this.store.update(id,{download_attempts:job.download_attempts+1,updated_at:this.now()},lease);
        const result=await this.downloader.download(job.source_url);
        await this.store.update(id,{status:'preparing',error:null,object_key:objectKey,updated_at:this.now()},lease);
        const video=await fetchVideo(result.mediaUrl,this.fetcher,this.env.COBALT_API_URL?new URL(this.env.COBALT_API_URL).origin:'');
        await this.env.BUCKET.put(objectKey,video.stream,{httpMetadata:{contentType:video.mimeType},customMetadata:{jobId:id}});
        if(!(await this.env.BUCKET.head(objectKey)))throw new AppError('Temporary video could not be saved.','preparing',503);
        await this.store.update(id,{status:'sending',error:null,poll_after:0,updated_at:this.now()},lease);
      }else if(job.status==='preparing'){
        // Recover an interrupted download; there is no Meta container or publication yet.
        if(job.object_key)await this.cleanup(job,lease);
        await this.store.update(id,{status:'downloading',updated_at:this.now()},lease);
      }else if(job.status==='sending'){
        if(!this.env.TRANSPORT_ORIGIN)throw new AppError('Temporary video transport is not configured.','sending',503);
        const videoUrl=`${this.env.TRANSPORT_ORIGIN}/video/${id}/${job.video_token}/source.mp4`;
        const container=await(await this.client()).create(videoUrl,this.env.LIVE_TEST_AI_SHORTCODE===job.shortcode,job.caption);
        await this.store.update(id,{container_id:container,status:'processing',error:null,processing_started:this.now(),poll_after:this.now()+60000,updated_at:this.now()},lease);
      }else if(job.status==='processing'){
        const meta=await this.client();const state=await meta.status(job.container_id);
        if(state.code==='FINISHED'){
          if(await this.store.claimPublish(id,lease,this.now())){
            const mediaId=await meta.publish(job.container_id);
            // Save the returned ID immediately before any verification or cleanup I/O.
            await this.store.update(id,{media_id:mediaId,status:'published',cleanup_pending:1,error:null,updated_at:this.now()},lease);
            await this.cleanup(await this.store.get(id),lease);
          }
        }else if(['ERROR','EXPIRED'].includes(state.code))throw new AppError(state.message||'Instagram could not process this video.','processing',422);
        else if(state.code==='IN_PROGRESS'){
          const timedOut=this.now()-job.processing_started>5*60000;
          await this.store.update(id,{poll_after:this.now()+60000,error:timedOut?'Instagram is taking longer than expected. The video remains available while processing continues.':null,updated_at:this.now()},lease);
        }else throw new AppError('Instagram returned an unexpected processing state.','processing',502);
      }
    }catch(error){
      job=await this.store.get(id);
      if(job.media_id){await this.store.update(id,{status:'published',cleanup_pending:1,error:'Published. Temporary-video cleanup is pending.',updated_at:this.now()},lease);}
      else if(job.publish_attempted){await this.store.update(id,{status:'uncertain',error:safeError(error)+' Automatic reposting is blocked to prevent duplicates.',failed_stage:'publishing',poll_after:this.now()+60000,updated_at:this.now()},lease);}
      else if(!job.container_id&&!job.object_key&&job.status==='downloading'&&error.stage==='downloading'&&error.retryable!==false&&job.download_attempts<this.maxDownloadAttempts){
        const delay=[5000,15000,30000,60000][Math.min(job.download_attempts-1,3)];
        await this.store.update(id,{status:'downloading',error:'Download did not complete. Retrying automatically ('+job.download_attempts+'/'+this.maxDownloadAttempts+').',poll_after:this.now()+delay,cleanup_pending:0,updated_at:this.now()},lease);
      }else{
        // Do not discard a transport object while Instagram may still be fetching/processing it.
        let safeToDelete=!job.container_id;
        if(job.container_id){try{safeToDelete=['ERROR','EXPIRED','FINISHED'].includes((await(await this.client()).status(job.container_id)).code);}catch{}}
        await this.store.update(id,{status:'failed',error:safeError(error),failed_stage:error.retryable===false?'copyright':error.stage??job.status,cleanup_pending:1,updated_at:this.now()},lease);
        if(safeToDelete){try{await this.cleanup(await this.store.get(id),lease);}catch{}}
      }
    }finally{await this.store.update(id,{lease_until:0,lease_id:null},lease);}
    return publicJob(await this.store.get(id));
  }
  async retry(id){const j=await this.store.get(id);if(!j)throw new AppError('Job not found.','validation',404);if(j.media_id)return publicJob(j);if(!publicJob(j).retrySafe)throw new AppError('This job cannot safely be reposted. Check Instagram first.','publishing',409);await this.cleanup(j);await this.store.update(id,{status:'downloading',error:null,failed_stage:null,cleanup_pending:0,poll_after:0,download_attempts:0,updated_at:this.now()});return publicJob(await this.store.get(id));}
  async maintenance(){
    let deleted=0,waiting=0;
    for(const j of await this.store.stale(this.now())){
      const lease=crypto.randomUUID();
      const claimed=await this.env.DB.prepare('UPDATE jobs SET lease_id=?,lease_until=? WHERE id=? AND lease_until < ?').bind(lease,this.now()+90000,j.id,this.now()).run();
      if(!claimed.meta.changes)continue;
      try{
        if(j.media_id || !j.container_id){await this.cleanup(j,lease);deleted++;if(!['published','failed'].includes(j.status))await this.store.update(j.id,{status:'failed',error:'This job expired before publishing. You can safely retry.',failed_stage:j.status},lease);}
        else{const state=await(await this.client()).status(j.container_id);if(['ERROR','EXPIRED','PUBLISHED','FINISHED'].includes(state.code)){await this.cleanup(j,lease);deleted++;if(!j.publish_attempted)await this.store.update(j.id,{status:'failed',error:'This abandoned job was cleaned up. No Reel was published.',failed_stage:j.status},lease);}else waiting++;}
      }catch{waiting++;}finally{await this.store.update(j.id,{lease_id:null,lease_until:0},lease);}
    }
    // R2 orphan scan: never delete a row-backed active container. Limit each pass and continue via cursor.
    let cursor;do{const list=await this.env.BUCKET.list({prefix:'temp-reels/',cursor,limit:100});for(const o of list.objects){if(this.now()-new Date(o.uploaded).getTime()<6*3600000)continue;const id=o.key.split('/')[1];if(!await this.store.get(id)){await this.env.BUCKET.delete(o.key);deleted++;}}cursor=list.truncated?list.cursor:undefined;}while(cursor);
    return {deleted,waiting};
  }
}
