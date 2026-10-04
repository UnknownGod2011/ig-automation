import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Miniflare} from 'miniflare';
test('built Worker streams MP4 to R2, persists publication, deletes video, rejects CSRF and keeps secrets out of HTML',async()=>{
  let publishes=0;
  const mockMedia={context:{shortcode:'Runtime123'},gql_data:{shortcode_media:{is_video:true,video_url:'https://scontent.cdninstagram.com/runtime.mp4'}}};
  const mf=new Miniflare({modules:true,script:readFileSync('dist/server/index.js','utf8'),compatibilityDate:'2025-10-01',d1Databases:{DB:'runtime'},r2Buckets:['BUCKET'],bindings:{INSTAGRAM_APP_ID:'11111',INSTAGRAM_USER_ID:'22222',INSTAGRAM_APP_SECRET:'runtime-only-secret',INSTAGRAM_ACCESS_TOKEN:'runtime-only-token',SITE_ORIGIN:'https://private.example',TRANSPORT_ORIGIN:'https://transport.example'},outboundService:async req=>{
    const u=new URL(req.url);
    if(u.hostname==='scontent.cdninstagram.com')return new Response(new Uint8Array([0,0,0,24,102,116,121,112,109,112,52,50]),{headers:{'Content-Type':'video/mp4','Content-Length':'12'}});
    if(u.hostname==='www.instagram.com')return new Response(u.pathname.includes('embed')?'"contextJSON":'+JSON.stringify(JSON.stringify(mockMedia)):'');
    if(u.pathname==='/access_token')return Response.json({access_token:'long-lived-runtime-token',expires_in:5184000});
    if(u.pathname.endsWith('/media_publish')){publishes++;return Response.json({id:'99999999'});}
    if(u.pathname.endsWith('/media'))return Response.json({id:'88888888'});
    if(u.searchParams.get('fields')==='status_code,status')return Response.json({status_code:'FINISHED'});
    return Response.json({id:'22222',username:'test-account'});
  }});
  try{
    const db=await mf.getD1Database('DB');for(const sql of readFileSync('drizzle/0000_keen_jocasta.sql','utf8').split('--> statement-breakpoint').filter(s=>s.trim()))await db.prepare(sql).run();
    const html=await(await mf.dispatchFetch('https://private.example/')).text();assert.ok(html.includes('Reel Reposter'));assert.ok(!html.includes('runtime-only-secret'));assert.ok(!html.includes('runtime-only-token'));
    const post=(path,data={},origin='https://private.example')=>mf.dispatchFetch('https://private.example'+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(data)});
    assert.equal((await post('/api/connection',{},'https://evil.example')).status,403);
    const connection=await post('/api/connection');assert.equal(connection.status,200,await connection.text());
    const id=crypto.randomUUID();await post('/api/jobs',{id,url:'https://instagram.com/reel/Runtime123/'});
    let r=await post('/api/jobs/'+id+'/advance');let j=await r.json();assert.equal(j.status,'sending',JSON.stringify(j));
    const bucket=await mf.getR2Bucket('BUCKET');assert.equal((await bucket.head(`temp-reels/${id}/source.mp4`)).size,12);
    j=await(await post('/api/jobs/'+id+'/advance')).json();assert.equal(j.status,'processing');
    await db.prepare('UPDATE jobs SET poll_after=0 WHERE id=?').bind(id).run();
    j=await(await post('/api/jobs/'+id+'/advance')).json();assert.equal(j.status,'published',JSON.stringify(j));assert.equal(j.mediaId,'99999999');assert.equal(publishes,1);assert.equal(await bucket.head(`temp-reels/${id}/source.mp4`),null);
    await post('/api/jobs/'+id+'/advance');await post('/api/jobs/'+id+'/retry');assert.equal(publishes,1);
  }finally{await mf.dispose();}
});
