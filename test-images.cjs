const test=require('node:test'),assert=require('node:assert/strict');
let active=0,peak=0,fail=false,draws=[];
global.Image=class{constructor(){this.naturalWidth=2048;}set src(v){active++;peak=Math.max(peak,active);setImmediate(()=>{active--;if(fail)this.onerror();else this.onload();});}};
global.document={createElement(){return {getContext(){return {drawImage(...args){draws.push(args.slice(1));}}},toDataURL(){return 'data:image/png;base64,test'}};}};
const images=require('./audit-images.js');
function elements(){const image={hidden:true,set src(v){this.source=v;setImmediate(()=>this.onload());}},status={hidden:false,textContent:'',classList:{add(){},remove(){}}};return {image,status};}
test('empty original gets an explicit diagnosis instead of a blank image',async()=>{const {image,status}=elements();assert.equal(await images.render({metrics:{alphaArea:0}},image,status),'empty');assert.match(status.textContent,/透明画像/);assert.equal(image.hidden,true);});
test('sprite tile becomes a real PNG image with the correct crop',async()=>{const {image,status}=elements();const result=await images.render({preview:{sheet:0,column:3,row:4}},image,status);assert.equal(result,'loaded');assert.deepEqual(draws.at(-1),[768,1024,256,256,0,0,256,256]);assert.equal(image.hidden,false);assert.equal(status.hidden,true);assert.match(image.source,/^data:image\/png/);});
test('large-sheet decoding is limited to two concurrent images',async()=>{await Promise.all(Array.from({length:8},(_,i)=>{const {image,status}=elements();return images.render({preview:{sheet:i+2,column:0,row:0}},image,status);}));assert.ok(peak<=2);});
test('load errors stay visible and can be retried',async()=>{fail=true;const {image,status}=elements();await assert.rejects(images.render({preview:{sheet:99,column:0,row:0}},image,status));assert.match(status.textContent,/タップで再試行/);assert.equal(image.hidden,true);fail=false;assert.equal(await images.render({preview:{sheet:99,column:0,row:0}},image,status),'loaded');});
