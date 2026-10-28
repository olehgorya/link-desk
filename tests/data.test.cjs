const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync('dist/app.js','utf8');
function boot(raw){
 const data=new Map(raw===undefined?[]:[['linkdesk.v1',raw]]),elements=new Map();
 function element(){return {value:'',firstChild:{textContent:''},hidden:false,textContent:'',innerHTML:'',classList:{add(){},remove(){},toggle(){}},click(){},showModal(){},close(){}}}
 const document={querySelector(s){if(!elements.has(s))elements.set(s,element());return elements.get(s)},querySelectorAll(){return []}};
 const context=vm.createContext({document,window:{addEventListener(){}},localStorage:{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)},structuredClone,URL,Date,Blob,crypto:require('node:crypto').webcrypto,setTimeout:()=>1,clearTimeout(){},navigator:{},confirm:()=>true});
 vm.runInContext(source,context);vm.runInContext('render=()=>{}',context);
 return {run:s=>vm.runInContext(s,context),data,elements,context};
}
const row={id:'one',partner:'Partner',offer:'Offer',geo:'UA',url:'https://example.com/?subid=one',status:'Получена',sent:'',source:'CRM',note:'',updated:'2026-10-28T10:00:00Z',history:[{url:'https://example.com/old',at:'2026-10-27T10:00:00Z'}],favorite:true};
function imported(b,value){b.context.input=value;return b.run('validateImport(input)')}
test('export format round-trips all fields and URL history',()=>{const b=boot();const result=imported(b,JSON.parse(JSON.stringify({version:1,records:[row]})));assert.deepEqual(JSON.parse(JSON.stringify(result)),[{...row,demo:false}]);});
test('reject malformed imports, duplicate IDs and executable URLs',()=>{const b=boot();for(const value of [{version:2,records:[]},{version:1,records:[row,row]},{version:1,records:[{...row,url:'javascript:alert(1)'}]},{version:1,records:[{...row,history:[{url:'javascript:alert(1)',at:row.updated}]}]},{version:1,records:[{...row,partner:'x'.repeat(121)}]}])assert.throws(()=>imported(b,value));});
test('valid saved base survives load with history and favorite',()=>{const b=boot(JSON.stringify([row]));assert.equal(b.run('records[0].url'),row.url);assert.equal(b.run('records[0].history[0].url'),row.history[0].url);assert.equal(b.run('storageBroken'),false);});
test('corrupt base stays intact and cannot be overwritten by a normal save',()=>{const raw='{corrupt';const b=boot(raw);assert.equal(b.run('storageBroken'),true);assert.equal(b.run('records.length'),0);assert.equal(b.run('persist([])'),false);assert.equal(b.data.get('linkdesk.v1'),raw);assert.equal(b.elements.get('#storageError').hidden,false);});
test('explicit recovery import replaces base and unlocks editing',()=>{const b=boot('{corrupt');b.context.input={version:1,records:[row]};assert.equal(b.run('persist(validateImport(input),true)'),true);assert.equal(b.run('storageBroken'),false);assert.equal(JSON.parse(b.data.get('linkdesk.v1'))[0].id,'one');assert.equal(b.elements.get('#storageError').hidden,true);});
test('HTML in imported fields is rendered as text',()=>{const b=boot();assert.equal(b.run(`esc('<img src=x onerror=alert(1)>')`),'&lt;img src=x onerror=alert(1)&gt;');});
