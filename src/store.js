export class JobStore {
  constructor(db) { this.db=db; }
  async get(id) { return this.db.prepare('SELECT * FROM jobs WHERE id = ?').bind(id).first(); }
  async byShortcode(code) { return this.db.prepare('SELECT * FROM jobs WHERE shortcode = ?').bind(code).first(); }
  async create(id,normalized,now,caption='FOLLOW FOR MORE!') {
    await this.db.prepare('INSERT INTO jobs (id,shortcode,source_url,status,video_token,created_at,updated_at,caption) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING').bind(id,normalized.shortcode,normalized.url,'downloading',crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-',''),now,now,caption).run();
    return this.byShortcode(normalized.shortcode);
  }
  async update(id,patch,leaseId) {
    const fields = new Set(['status','error','failed_stage','container_id','media_id','object_key','publish_attempted','lease_until','lease_id','updated_at','poll_after','processing_started','cleanup_pending']);
    const entries=Object.entries(patch); if(entries.some(([k])=>!fields.has(k))) throw new Error('Invalid job field');
    const q = `UPDATE jobs SET ${entries.map(([k])=>`${k} = ?`).join(',')} WHERE id = ?${leaseId?' AND lease_id = ?':''}`;
    const r = await this.db.prepare(q).bind(...entries.map(([,v])=>v),id,...(leaseId?[leaseId]:[])).run();
    return r.meta.changes > 0;
  }
  async lease(id,now) {
    const lease=crypto.randomUUID();
    const r=await this.db.prepare("UPDATE jobs SET lease_id=?,lease_until=? WHERE id=? AND lease_until < ? AND status NOT IN ('published','failed')").bind(lease,now+180000,id,now).run();
    return r.meta.changes ? lease : null;
  }
  async claimPublish(id,lease,now) {
    // Irreversible write-ahead claim: even a crashed or timed-out request is NEVER re-sent.
    const r = await this.db.prepare("UPDATE jobs SET publish_attempted=1,status='publishing',updated_at=? WHERE id=? AND lease_id=? AND lease_until>? AND status='processing' AND publish_attempted=0 AND media_id IS NULL").bind(now,id,lease,now).run();
    return r.meta.changes > 0;
  }
  async stale(now) { return (await this.db.prepare('SELECT * FROM jobs WHERE object_key IS NOT NULL AND (cleanup_pending=1 OR updated_at < ?) AND lease_until < ? LIMIT 50').bind(now-6*3600000,now).all()).results; }
}
export function publicJob(job) {
  if(!job) return null;
  return {id:job.id,status:job.status,error:job.error,failedStage:job.failed_stage,mediaId:job.media_id,cleanupPending:!!job.cleanup_pending,retrySafe:job.status==='failed' && !job.publish_attempted && !job.container_id,sourceUrl:job.source_url};
}
