import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {page} from '../src/page.js';
function browserHarness(fail=false){
  const events=[],values=new Map(),elements={};
  for(const id of ['form','post','url','retry','add','result','progress','connection'])elements[id]={hidden:false,disabled:false,textContent:''};
  elements.rows={children:Array.from({length:5},()=>({querySelector:()=>({textContent:''})}))};
  const context=vm.createContext({document:{getElementById:id=>elements[id],querySelectorAll:()=>[]},localStorage:{setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},setTimeout:cb=>cb(),crypto,location:{reload(){throw Error('unexpected login');}},fetch:async(path,options)=>{
    const data=JSON.parse(options.body);let job;
    if(path==='/api/jobs'){events.push('create:'+data.id);job={id:data.id,status:'processing'};}
    else{const id=path.split('/')[3];events.push('advance:'+id);job=fail&&id==='two'?{id,status:'uncertain',retrySafe:false,error:'Lost response'}:{id,status:'published',cleanupPending:events.filter(e=>e==='advance:'+id).length===1};}
    return Response.json(job);
  }});
  let script=page('test').match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];script=script.replace(/init\(\);\s*$/,'');vm.runInContext(script,context);
  vm.runInContext("connected=true;queue=['one','two','three','four','five'].map(id=>({id,url:'https://instagram.com/reel/Test123/',caption:'FOLLOW FOR MORE!'}));",context);
  return {context,events,values,elements};
}
test('five-Reel browser queue waits for publication and cleanup before starting next Reel',async()=>{const h=browserHarness();await vm.runInContext('run()',h.context);assert.deepEqual(h.events,['one','two','three','four','five'].flatMap(id=>['create:'+id,'advance:'+id,'advance:'+id]));assert.equal(h.values.has('reel-reposter-queue'),false);assert.equal(h.elements.result.textContent,'All Reels published ✓');});
test('uncertain publication stops queue and retains remaining items for safe resume',async()=>{const h=browserHarness(true);await vm.runInContext('run()',h.context);assert.ok(!h.events.includes('create:three'));const saved=JSON.parse(h.values.get('reel-reposter-queue'));assert.equal(saved[0].done,true);assert.equal(saved[1].retrySafe,false);assert.match(h.elements.result.textContent,/Queue stopped at Reel 2/);});
