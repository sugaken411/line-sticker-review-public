(function(root){
 'use strict';
 // Decode at most two 2048px sheets at once. Render real PNG <img> elements,
 // avoiding large CSS backgrounds and making load/error states observable.
 const pending=new Map(),cache=new Map(),queue=[];let active=0;
 function empty(asset){return asset.metrics?.alphaArea===0||asset.flags?.some(f=>f.code==='empty');}
 function sheet(url){
  if(cache.has(url))return Promise.resolve(cache.get(url));
  if(pending.has(url))return pending.get(url);
  const promise=new Promise((resolve,reject)=>queue.push({url,resolve,reject}));pending.set(url,promise);pump();return promise;
 }
 function pump(){
  while(active<2&&queue.length){
   const job=queue.shift();active++;const image=new Image();let finished=false;
   const finish=(error)=>{if(finished)return;finished=true;clearTimeout(timer);active--;pending.delete(job.url);
    if(error)job.reject(error);else {cache.set(job.url,image);while(cache.size>2)cache.delete(cache.keys().next().value);job.resolve(image);}pump();};
   const timer=setTimeout(()=>finish(Error('画像の取得がタイムアウトしました')),20000);
   image.onload=()=>image.naturalWidth>0?finish():finish(Error('画像を読み取れません'));
   image.onerror=()=>finish(Error('画像を取得できません。通信を確認して再読み込みしてください。'));
   image.src=job.url;
  }
 }
 async function render(asset,img,status){
  if(empty(asset)){status.textContent='この元画像はほぼ完全な透明画像です。イラストが入っていないため、要修正として抽出しています。';status.classList.add('empty-image');img.hidden=true;return 'empty';}
  status.textContent='画像を読み込み中…';status.hidden=false;status.classList.remove('empty-image');
  const p=asset.preview,url='gen-assets/sheet-'+String(p.sheet).padStart(2,'0')+'.webp';
  try{
   const source=await sheet(url),canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
   const context=canvas.getContext('2d');if(!context)throw Error('画像表示を初期化できません');
   context.drawImage(source,p.column*256,p.row*256,256,256,0,0,256,256);
   const png=canvas.toDataURL('image/png');
   await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('画像の描画に失敗しました'));img.src=png;});
   img.hidden=false;status.hidden=true;return 'loaded';
  }catch(error){img.hidden=true;status.textContent=error.message+' タップで再試行。原本リンクからも確認できます。';throw error;}
 }
 const api={render,isEmpty:empty};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AuditImages=api;
})(typeof window!=='undefined'?window:globalThis);
