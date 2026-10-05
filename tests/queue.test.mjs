import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {page} from '../src/page.js';
function browserHarness(fail=false){
  const events=[],values=new Map(),elements={};const inputs=Array.from({length:5},()=>({value:'old Reel link'})),captions=Array.from({length:5},()=>({value:'old caption'}));
  for(const id of ['form','post','url','retry','add','result','progress','connection'])elements[id]={hidden:false,disabled:false,textContent:''};
  elements.rows={children:Array.from({length:5},()=>({querySelector:()=>({textContent:''})}))};
  const context=vm.createContext({document:{getElementById:id=>elements[id],querySelectorAll:selector=>selector==='#rows input'?inputs:selector==='#rows textarea'?captions:[]},localStorage:{setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},setTimeout:cb=>cb(),crypto,location:{reload(){throw Error('unexpected login');}},fetch:async(path,options)=>{
    const data=JSON.parse(options.body);let job;
    if(path==='/api/jobs'){events.push('create:'+data.id);job={id:data.id,status:'processing'};}
    else{const id=path.split('/')[3];events.push('advance:'+id);job=fail&&id==='two'?{id,status:fail==='download'?'failed':'uncertain',retrySafe:fail==='download',error:fail==='download'?'Download unavailable':'Lost response'}:{id,status:'published',cleanupPending:events.filter(e=>e==='advance:'+id).length===1};}
    return Response.json(job);
  }});
  let script=page('test').match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];script=script.replace(/init\(\);\s*$/,'');vm.runInContext(script,context);
  vm.runInContext("connected=true;queue=['one','two','three','four','five'].map(id=>({id,url:'https://instagram.com/reel/Test123/',caption:'FOLLOW FOR MORE FOOTBALL CONTENT!'}));",context);
  return {context,events,values,elements,inputs,captions};
}
test('five-Reel browser queue waits for publication and cleanup before starting next Reel',async()=>{const h=browserHarness();await vm.runInContext('run()',h.context);assert.deepEqual(h.events,['one','two','three','four','five'].flatMap(id=>['create:'+id,'advance:'+id,'advance:'+id]));assert.equal(h.values.has('reel-reposter-queue'),false);assert.equal(h.elements.result.textContent,'All Reels published ✓ — ready for your next links.');assert.ok(h.inputs.every(e=>e.value===''));assert.ok(h.captions.every(e=>e.value==='FOLLOW FOR MORE FOOTBALL CONTENT!'));assert.equal(vm.runInContext('queue.length',h.context),0);});
test('uncertain publication is not retried and does not stop later Reels',async()=>{const h=browserHarness(true);await vm.runInContext('run()',h.context);assert.ok(h.events.includes('create:three'));assert.ok(h.events.includes('create:five'));const saved=JSON.parse(h.values.get('reel-reposter-queue'));assert.equal(saved[0].done,true);assert.equal(saved[1].retrySafe,false);assert.equal(saved[1].failed,true);assert.equal(saved[4].done,true);assert.match(h.elements.result.textContent,/4 published; 1 failed/);assert.equal(h.elements.retry.hidden,true);await vm.runInContext('run()',h.context);assert.equal(h.events.filter(e=>e==='create:two').length,1);});

test('failed download is skipped, later Reels publish and only failed link remains for safe retry',async()=>{const h=browserHarness('download');await vm.runInContext('run()',h.context);assert.ok(h.events.includes('create:five'));assert.equal(h.elements.retry.hidden,false);assert.equal(h.inputs[1].value,'old Reel link');for(const i of [0,2,3,4])assert.equal(h.inputs[i].value,'');const saved=JSON.parse(h.values.get('reel-reposter-queue'));assert.equal(saved[1].retrySafe,true);assert.equal(saved[1].failed,true);});
