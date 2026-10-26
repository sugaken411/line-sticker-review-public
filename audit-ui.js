(function(){
 'use strict';
 const $=id=>document.getElementById(id),C=window.AuditCore;
 let data,state,key,currentId=null,filter='pending',page=0,storageOK=true,token=null,folderId=null,driveFileId=null,driveBusy=false,driveAgain=false,syncTimer=null;
 const selected=new Set(),fields={};let draftMemo='';
 function el(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;}
 function fatal(message){$('fatal').hidden=false;$('fatal').textContent=message;}
 function storageMessage(text,error=false){$('storageState').textContent=text;$('storageState').classList.toggle('error',error);}
 function persist(next){
  state=next;
  try{C.persist(localStorage,key,next);state=next;storageOK=true;$('fatal').hidden=true;storageMessage('この端末に保存済み · '+new Date().toLocaleTimeString('ja-JP')+' · 閉じても途中から再開');scheduleSync();return true;}
  catch(e){storageOK=false;fatal('端末に保存できませんでした。画面を閉じずに進捗JSONを保存してください。'+e.message);storageMessage('未保存：次の対象へは自動で進みません。',true);return false;}
 }
 function record(){return state.records[currentId];}
 function task(){return data.tasks.find(t=>t.id===currentId);}
 function allTasks(){
  const q=$('query').value.trim().normalize('NFKC').toLowerCase(),kind=$('kind').value;
  return data.tasks.filter(t=>{
   const r=state.records[t.id];if(kind!=='all'&&kind!==t.type)return false;
   if(filter==='pending'&&(C.isDone(r)||r?.decision==='hold'))return false;
   if(filter==='hold'&&r?.decision!=='hold')return false;
   if(filter==='done'&&!C.isDone(r))return false;
   if(!q)return true;
   return t.members.some(i=>{const a=data.assets[i],f=r?.fields?.[a.id]||{};return [a.name,a.id,a.plan,a.phrase,a.situation,f.plan,f.phrase,f.situation].join(' ').normalize('NFKC').toLowerCase().includes(q);});
  });
 }
 function stats(){
  const done=data.tasks.filter(t=>C.isDone(state.records[t.id])).length,hold=data.tasks.filter(t=>state.records[t.id]?.decision==='hold').length;
  $('summary').replaceChildren();
  for(const [v,label] of [[data.summary.reviewImages,'目視候補の画像'],[data.tasks.length-done-hold,'未確認の候補群'],[done,'判定済みの候補群'],[data.summary.technicalNoFlags,'機械検査で検出なし']]){const box=el('div',null,'metric');box.append(el('strong',v.toLocaleString()),el('span',label));$('summary').append(box);}
  $('undo').disabled=!state.history?.length;
 }
 function preview(a,zoom=false){
  const b=el('button',null,'preview'+(zoom?' zoompreview':''));b.type='button';b.setAttribute('aria-label',a.name+'を拡大');
  const tile=el('span',null,'tile'),p=a.preview;tile.style.backgroundImage='url("gen-assets/sheet-'+String(p.sheet).padStart(2,'0')+'.webp")';tile.style.backgroundPosition=(p.column/7*100)+'% '+(p.row/7*100)+'%';b.append(tile);
  b.onclick=()=>{if(zoom)return;$('zoomImage').replaceChildren(preview(a,true));$('zoomName').textContent=a.name;$('zoomSource').href=a.url;$('zoom').showModal();};return b;
 }
 function draft(){
  const t=task();if(!t)return true;
  const before=record(),entry={decision:before?.decision||'draft',selected:[...selected],fields:{...fields},memo:draftMemo};
  // Editing a prior selection starts a draft if its selection becomes empty.
  if(entry.decision==='selected'&&!entry.selected.length)entry.decision='draft';
  if(entry.decision==='distinct'&&entry.selected.length!==t.members.length)entry.decision='draft';
  return persist(C.record(data,state,t.id,entry));
 }
 function assetCard(i){
  const a=data.assets[i],card=el('article',null,'asset'+(selected.has(a.id)?' chosen':''));
  const label=el('label',null,'asset-top'),check=el('input');check.type='checkbox';check.checked=selected.has(a.id);check.setAttribute('aria-label',a.name+'を採用候補に選ぶ');
  label.append(check,el('span','採用候補に選ぶ'));check.onchange=()=>{if(check.checked)selected.add(a.id);else selected.delete(a.id);card.classList.toggle('chosen',check.checked);draft();updateSelection();};
  const body=el('div',null,'asset-body');body.append(el('div',a.name,'filename'));
  if(a.flags.length){const ul=el('ul',null,'flags');a.flags.forEach(f=>ul.append(el('li',f.label)));body.append(ul);}
  const link=el('a','Drive原本を開く');link.href=a.url;link.target='_blank';link.rel='noopener';body.append(link);
  const details=el('details'),summary=el('summary','確認できた企画・フレーズ・状況');details.append(summary);
  for(const [k,title] of [['plan','企画'],['phrase','フレーズ'],['situation','状況・動き']]){const l=el('label',title),input=el('input');input.value=fields[a.id]?.[k]||'';input.placeholder='未確認は空欄のまま';input.maxLength=2000;input.dataset.asset=a.id;input.dataset.field=k;input.oninput=()=>{fields[a.id]||={};fields[a.id][k]=input.value;draft();};l.append(input);details.append(l);}
  body.append(details);card.append(label,preview(a),body);return card;
 }
 function updateSelection(){const n=$('selectionCount');if(n)n.textContent='選択 '+selected.size+' / '+(task()?.members.length||0)+'枚';const b=$('choose');if(b)b.disabled=!selected.size;}
 function decide(decision){
  const t=task();if(!t)return;
  const ids=decision==='distinct'?t.members.map(i=>data.assets[i].id):decision==='repair'?[]:[...selected];
  const entry={decision,selected:ids,fields:{...fields},memo:draftMemo};
  try{const next=C.record(data,state,t.id,entry);if(!persist(next))return;currentId=null;render();window.scrollTo({top:Math.max(0,$('summary').getBoundingClientRect().top+window.scrollY-10),behavior:'smooth'});}
  catch(e){fatal(e.message);}
 }
 function render(){
  stats();$('work').replaceChildren();if(filter==='passed'){renderPassed();return;}
  const list=allTasks();if(!list.some(t=>t.id===currentId))currentId=list[0]?.id||null;
  if(!currentId){const box=el('section',null,'empty');box.append(el('h2',filter==='pending'?'未確認はありません':'該当する画像はありません'),el('p',filter==='pending'?'判定は保存されています。保留と判定済みのタブで再確認できます。':'種類や検索条件を変更してください。'));$('work').append(box);return;}
  const t=task(),r=record();selected.clear();(r?.selected||[]).forEach(id=>selected.add(id));Object.keys(fields).forEach(k=>delete fields[k]);Object.assign(fields,JSON.parse(JSON.stringify(r?.fields||{})));draftMemo=r?.memo||'';
  const box=el('section',null,'review'),head=el('div',null,'reviewhead'),h=el('div');h.append(el('span',t.type==='similar'?'類似画像を比較':'切り出し・描画の疑い','badge warn'),el('h2',t.type==='similar'?t.members.length+'枚を見比べる':'この画像を確認する'));
  const next=el('button','判定せず次へ');next.onclick=()=>{const idx=list.findIndex(v=>v.id===currentId);currentId=list[(idx+1)%list.length].id;render();};head.append(h,next);box.append(head,el('p',(list.findIndex(v=>v.id===currentId)+1)+' / '+list.length+'群 · '+t.id,'small'));
  if(C.isDone(r))box.append(el('p','判定済み：'+({selected:'採用候補を指定',distinct:'別画像として両方保持',repair:'要修正'}[r.decision]),'done-label'));
  if(r?.decision==='hold')box.append(el('p','保留中です','reason'));
  box.append(el('p',t.reasons.join(' / '),'reason'));
  if(t.type==='similar')box.append(el('p','類似のつながりでまとめています。すべてが同じ画像とは限りません。違うフレーズや動作は複数選択できます。未選択画像は「予備」で残します。','small'));
  const bar=el('div',null,'selection-bar'),count=el('span');count.id='selectionCount';const all=el('button','すべて選択'),none=el('button','選択を外す');all.onclick=()=>{t.members.forEach(i=>selected.add(data.assets[i].id));draft();render();};none.onclick=()=>{selected.clear();draft();render();};bar.append(count,all,none);box.append(bar);
  const cards=el('div',null,'cards'+(t.members.length>2?' many':''));t.members.forEach(i=>cards.append(assetCard(i)));box.append(cards);
  if(t.edges.length){const details=el('details'),s=el('summary','直接似ている組み合わせ '+t.edges.length+'組');details.append(s);for(const [d,i,j] of t.edges){details.append(el('p',data.assets[i].name+' ↔ '+data.assets[j].name+' / 距離 '+d+'/64','filename'));}box.append(details);}
  const memo=el('label','判定理由・修正メモ','memo'),area=el('textarea');area.value=draftMemo;area.maxLength=10000;area.placeholder='例：右側は上の文字が欠けている。左を採用候補にする。';area.oninput=()=>{draftMemo=area.value;draft();};memo.append(area);box.append(memo);
  const actions=el('div',null,'actions'),choose=el('button','選択を採用候補にして次へ','primary');choose.id='choose';choose.onclick=()=>decide('selected');
  const distinct=el('button',t.members.length>1?'別画像としてすべて残す':'問題なしで残す');distinct.onclick=()=>decide('distinct');
  const repair=el('button','要修正にして次へ');repair.onclick=()=>decide('repair');const hold=el('button','保留して次へ');hold.onclick=()=>decide('hold');actions.append(choose,distinct,repair,hold);box.append(actions);$('work').append(box);updateSelection();
 }
 function renderPassed(){
  const q=$('query').value.trim().toLowerCase(),items=data.autoPassed.filter(i=>{const a=data.assets[i];return !q||[a.name,a.id,a.phrase,a.plan,a.situation].join(' ').toLowerCase().includes(q);});const size=20;page=Math.min(page,Math.max(0,Math.ceil(items.length/size)-1));
  const box=el('section',null,'review');box.append(el('h2','機械検査で疑いを検出しなかった画像'),el('p','自動で目視キューを通過した画像です。文字・内容のQA合格や採用確定ではありません。','small'));
  for(const i of items.slice(page*size,(page+1)*size)){const a=data.assets[i],row=el('div',null,'listrow'),info=el('div');info.append(el('p',a.name,'filename'));const reopen=el('button','この画像を目視に追加');reopen.onclick=()=>{const id='MANUAL-'+a.id;const old=data.tasks.find(t=>t.id===id);if(!old)data.tasks.push({id,signature:'SIG-'+a.sha256,type:'quality',members:[i],edges:[],priority:50,reasons:['人が目視対象に追加']});const next={...state,manualTasks:[...(state.manualTasks||[]).filter(x=>x.id!==id),data.tasks.find(t=>t.id===id)]};if(persist(next)){filter='pending';document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.filter===filter));currentId=id;render();}};info.append(reopen);row.append(preview(a),info);box.append(row);}
  const pages=el('div',null,'pages'),prev=el('button','前の20件'),next=el('button','次の20件');prev.disabled=page<=0;next.disabled=(page+1)*size>=items.length;prev.onclick=()=>{page--;renderPassedOnly();};next.onclick=()=>{page++;renderPassedOnly();};pages.append(prev,el('span',items.length+'枚 / '+(page+1)+'ページ'),next);box.append(pages);$('work').append(box);
 }
 function renderPassedOnly(){$('work').replaceChildren();renderPassed();}
 function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type})),a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
 function snapshot(){return {...state,exportedAt:new Date().toISOString(),scope:'採用候補・予備・修正指示。画像原本/台帳未変更'};}
 function mergeBackup(input){
  addManual(input);
  const result=C.merge(data,state,input);if(!persist(result.state))return;
  currentId=null;render();storageMessage('進捗を統合しました：'+result.imported+'件。旧版/対象外 '+result.stale+'件、現在の判定を優先 '+result.conflicts+'件。');
 }
 function addManual(input){
  if(input?.datasetId!==data.datasetId)return;
  for(const t of input.manualTasks||[]){const i=data.assets.findIndex(a=>t.id==='MANUAL-'+a.id&&t.signature==='SIG-'+a.sha256);if(i<0)continue;if(!data.tasks.some(x=>x.id===t.id))data.tasks.push({id:t.id,signature:t.signature,type:'quality',members:[i],edges:[],priority:50,reasons:['人が目視対象に追加']});}
 }
 function scheduleSync(){if(!token)return;clearTimeout(syncTimer);syncTimer=setTimeout(()=>syncDrive().catch(driveError),1500);}
 function driveError(e){$('driveState').textContent='Drive未保存：'+e.message+'。端末保存は保持されています。';if(/401|403/.test(e.message)){token=null;$('sync').disabled=true;$('restoreDrive').disabled=true;}}
 async function driveFetch(path,opts={}){if(!token)throw Error('Googleへ接続してください');const r=await fetch('https://www.googleapis.com/drive/v3/'+path,{...opts,headers:{Authorization:'Bearer '+token,...opts.headers}});if(!r.ok)throw Error('HTTP '+r.status+' '+(await r.text()).slice(0,100));return r.json();}
 async function ensureFolder(){
  if(folderId)return folderId;
  const q="trashed=false and mimeType='application/vnd.google-apps.folder' and name='LINEスタンプ照合_Claude連携'";
  const found=await driveFetch('files?q='+encodeURIComponent(q)+'&fields=files(id)&pageSize=100');
  folderId=found.files?.[0]?.id;
  if(!folderId)folderId=(await driveFetch('files?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'LINEスタンプ照合_Claude連携',mimeType:'application/vnd.google-apps.folder'})})).id;
  return folderId;
 }
 async function findBackup(){
  const folder=await ensureFolder(),q="trashed=false and '"+folder+"' in parents and name='Gen_要目視監査_v1.json'";
  const found=await driveFetch('files?q='+encodeURIComponent(q)+'&fields=files(id)&pageSize=100');driveFileId=found.files?.[0]?.id||null;return driveFileId;
 }
 async function readDrive(){const id=await findBackup();if(!id)return null;return driveFetch('files/'+id+'?alt=media');}
 async function syncDrive(){
  if(!token)throw Error('Google接続が必要です');if(driveBusy){driveAgain=true;return;}
  driveBusy=true;$('driveState').textContent='Driveへ保存中…';
  try{
   const remote=await readDrive();if(remote){addManual(remote);const merged=C.merge(data,state,remote);if(!persist(merged.state))throw Error('端末保存を確認できないため中断');}
   const body=JSON.stringify(snapshot()),boundary='gen_review_'+Date.now(),meta={name:'Gen_要目視監査_v1.json',mimeType:'application/json'};
   if(!driveFileId)meta.parents=[await ensureFolder()];
   const multipart='--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(meta)+'\r\n--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+body+'\r\n--'+boundary+'--';
   const r=await fetch('https://www.googleapis.com/upload/drive/v3/files'+(driveFileId?'/'+driveFileId:'')+'?uploadType=multipart&fields=id',{method:driveFileId?'PATCH':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'multipart/related; boundary='+boundary},body:multipart});
   if(!r.ok)throw Error('HTTP '+r.status);driveFileId=(await r.json()).id;
   const saved=await driveFetch('files/'+driveFileId+'?alt=media');if(saved.datasetId!==data.datasetId||saved.updatedAt!==JSON.parse(body).updatedAt)throw Error('保存の読み戻しを確認できません');
   if(state.updatedAt!==JSON.parse(body).updatedAt)driveAgain=true;
   $('driveState').textContent='Drive保存・読み戻し確認済み：'+new Date().toLocaleString('ja-JP');
  }finally{driveBusy=false;clearTimeout(syncTimer);if(driveAgain){driveAgain=false;scheduleSync();}}
 }
 async function init(){
  const response=await fetch('gen-data.json');if(!response.ok)throw Error('監査データを読み込めません');data=await response.json();key='line-image-audit-v1:'+data.datasetId;
  try{const old=localStorage.getItem(key);if(old)addManual(JSON.parse(old));const loaded=C.load(data,localStorage,key);state=loaded.state;
   // Keep manually added tasks across reloads without trusting imported member indices.
   state.manualTasks=data.tasks.filter(t=>t.id.startsWith('MANUAL-'));
   C.persist(localStorage,key,state);storageMessage('前回の進捗を読み込みました。この端末に自動保存します。'+(loaded.stale?' データ更新により'+loaded.stale+'件を再確認します。':''));
  }catch(e){state=C.blank(data);storageOK=false;fatal('以前の保存内容を読み込めないか、保存領域を使えません。既存保存は上書きせず、JSON保存で作業を保護してください。'+e.message);}
  $('method').textContent=data.summary.stickerImages+'枚を検査。類似'+data.summary.similarPairs+'組を'+data.summary.similarGroups+'群に集約。品質の単独候補'+data.summary.qualityOnlyTasks+'件。確認用一覧'+data.summary.contactSheets+'枚は対象外。画像端2pxの接触・描画量・微小独立片を検査。文字OCR・内容の正否は未判定。';
  $('metadataIssues').textContent='Google側3表で同じDrive IDが未連結：'+data.summary.ledgerUnlinked+'枚。依頼/企画の由来、旧名との対応付けは未完了。';
  document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;page=0;currentId=null;document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',x===b));render();});
  $('kind').onchange=()=>{currentId=null;render();};$('query').oninput=()=>{page=0;currentId=null;render();};
  $('undo').onclick=()=>{const h=state.history?.at(-1);if(!h)return;if(persist(C.undo(state))){currentId=h.id;filter='all';document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.filter===filter));render();}};
  $('exportJson').onclick=()=>download('Gen_目視進捗_'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(snapshot(),null,2),'application/json');
  $('exportCsv').onclick=()=>download('Gen_目視判定.csv',C.csv(data,state),'text/csv;charset=utf-8');
  $('importJson').onclick=()=>$('restoreFile').click();$('restoreFile').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>20*1024*1024)throw Error('JSONが大きすぎます');mergeBackup(JSON.parse(await f.text()));}catch(err){fatal('復元できませんでした。現在の判定は保持しています。'+err.message);}e.target.value='';};
  try{const old=JSON.parse(localStorage.getItem('line-sticker-review-v8')||'{}');$('clientId').value=localStorage.getItem(key+':clientId')||old.clientId||'';}catch{}
  $('clientId').onchange=()=>{try{localStorage.setItem(key+':clientId',$('clientId').value.trim());}catch{}};
  $('connect').onclick=()=>{const id=$('clientId').value.trim();if(!id){$('driveState').textContent='Google OAuthクライアントIDを入力してください。';return;}if(!window.google?.accounts?.oauth2){$('driveState').textContent='Google認証を読み込めません。通信を確認してください。';return;}window.google.accounts.oauth2.initTokenClient({client_id:id,scope:'https://www.googleapis.com/auth/drive.file',callback:r=>{if(r.error){$('driveState').textContent='Google接続失敗：'+r.error;return;}token=r.access_token;$('sync').disabled=false;$('restoreDrive').disabled=false;syncDrive().catch(driveError);}}).requestAccessToken();};
  $('sync').onclick=()=>syncDrive().catch(driveError);$('restoreDrive').onclick=async()=>{if(driveBusy)return;try{const backup=await readDrive();if(!backup){$('driveState').textContent='Driveに保存データがありません。';return;}mergeBackup(backup);$('driveState').textContent='Driveと端末の進捗を統合しました。';}catch(e){driveError(e);}};
  window.addEventListener('storage',e=>{if(e.key!==key||!e.newValue)return;try{const merged=C.merge(data,state,JSON.parse(e.newValue));state=merged.state;render();storageMessage('別タブの進捗を読み込みました。');}catch(err){fatal('別タブの進捗を読み込めません。'+err.message);}});
  render();
 }
 init().catch(e=>{fatal('初期化できませんでした。再読み込みしてください。'+e.message);storageMessage('読み込み未完了',true);});
})();
