import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {publishOnce,videoHandler} from '../scripts/publish-local-batch.mjs';
test('local publisher saves write-ahead claim and never resends an ambiguous publication',async()=>{
  const job={containerId:'12345678'};let calls=0;
  const meta={publish:async()=>{calls++;throw Error('lost response');}};
  await assert.rejects(()=>publishOnce(meta,job,async()=>{}));
  await assert.rejects(()=>publishOnce(meta,job,async()=>{}));assert.equal(calls,1);
});
test('local publisher persists returned ID before cleanup and successful retries reuse it',async()=>{
  let calls=0;const job={containerId:'12345678'},saved=[];
  const meta={publish:async()=>{calls++;return '99999999';}};
  assert.equal(await publishOnce(meta,job,async()=>saved.push({...job})),'99999999');
  assert.equal(await publishOnce(meta,job,async()=>{}),'99999999');assert.equal(calls,1);assert.equal(saved[0].publishAttempted,true);assert.equal(saved[1].mediaId,'99999999');
});
test('temporary server exposes only exact selected media, supports ranges and revokes published videos',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'reel-batch-'));const file=join(dir,'test.mp4');await writeFile(file,'1234567890');
  const ledger={},files=new Map([['/video/random/test.mp4',{youtubeId:'Test1234567',localFile:file}]]);
  const server=createServer(videoHandler(files,ledger));await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  try{for(const path of ['/','/ig-secrets.txt','/video/random/../test.mp4'])assert.equal((await fetch(origin+path)).status,404);
    const r=await fetch(origin+'/video/random/test.mp4',{headers:{Range:'bytes=2-4'}});assert.equal(r.status,206);assert.equal(await r.text(),'345');
    assert.equal((await fetch(origin+'/video/random/test.mp4',{method:'POST'})).status,404);
    ledger.Test1234567={mediaId:'99999999'};assert.equal((await fetch(origin+'/video/random/test.mp4')).status,404);
  }finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
