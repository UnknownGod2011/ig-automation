import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeReelUrl} from '../src/url.js';
import {PublicInstagramDownloader} from '../src/downloader.js';

const copied='https://www.instagram.com/reel/Dd8IxXoI6W5/?utm_source=ig_web_copy_link&stkn=NTc4MTIwNjQ2YQ==';
const plural='https://www.instagram.com/reels/Dd8IxXoI6W5/';
const data={data:{xdt_shortcode_media:{shortcode:'Dd8IxXoI6W5',is_video:true,video_url:'https://scontent.cdninstagram.com/original.mp4',owner:{is_private:false}}}};
const html='<script type="application/json">'+JSON.stringify(data)+'</script>';

test('exact copied and plural Reel links produce identical clean downloader requests',async()=>{
  assert.deepEqual(normalizeReelUrl(copied),normalizeReelUrl(plural));
  const calls=[];
  const d=new PublicInstagramDownloader(async(url)=>{calls.push(url);return new Response(html);});
  assert.deepEqual(await d.download(copied),await d.download(plural));
  assert.deepEqual(calls,['https://www.instagram.com/p/Dd8IxXoI6W5/','https://www.instagram.com/p/Dd8IxXoI6W5/']);
});

test('temporary public download failure retries before failing the job',async()=>{
  let pageCalls=0;const sleeps=[];
  const d=new PublicInstagramDownloader(async(url,options)=>{
    assert.equal(options.redirect,'manual');
    assert.ok(options.signal instanceof AbortSignal);
    assert.ok(!url.includes('utm_source')&&!url.includes('stkn'));
    if(url==='https://www.instagram.com/p/Dd8IxXoI6W5/'&&++pageCalls===2)return new Response(html);
    return new Response('',{status:503});
  },{sleep:async ms=>sleeps.push(ms)});
  assert.equal((await d.download(copied)).mimeType,'video/mp4');
  assert.equal(pageCalls,2);assert.deepEqual(sleeps,[1500]);
});

test('public download retries have a total deadline and never follow a login redirect',async()=>{
  let now=0,calls=0;
  const d=new PublicInstagramDownloader(async(_url,options)=>{
    assert.equal(options.redirect,'manual');calls++;now+=60001;
    return new Response(null,{status:302,headers:{location:'https://www.instagram.com/accounts/login/'}});
  },{now:()=>now,sleep:async()=>assert.fail('No time remains for a retry')});
  await assert.rejects(()=>d.download(copied),e=>e.stage==='downloading');assert.equal(calls,1);
});

test('unavailable public media stops after two attempts and cannot become an arbitrary URL fetch',async()=>{
  let calls=0;
  const d=new PublicInstagramDownloader(async()=>{calls++;return new Response('',{status:404});},{sleep:async()=>{}});
  await assert.rejects(()=>d.download(copied));assert.equal(calls,8);
  await assert.rejects(()=>d.download('https://instagram.com.evil.test/reel/Dd8IxXoI6W5/'));assert.equal(calls,8);
});
