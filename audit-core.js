(function(root){
 'use strict';
 const done=new Set(['selected','distinct','repair']);
 const valid=new Set(['draft','selected','distinct','repair','hold']);
 const now=()=>new Date().toISOString();
 function blank(data){return {schemaVersion:1,datasetId:data.datasetId,revision:data.revision,records:{},history:[],updatedAt:now()};}
 function taskMap(data){return new Map(data.tasks.map(t=>[t.id,t]));}
 function validateRecord(data,task,r){
  if(!r||r.signature!==task.signature||!valid.has(r.decision))throw Error('判定の署名または状態が一致しません');
  const ids=new Set(task.members.map(i=>data.assets[i].id));
  if(!Array.isArray(r.selected)||r.selected.some(id=>!ids.has(id))||new Set(r.selected).size!==r.selected.length)throw Error('採用候補IDが対象にありません');
  if(r.decision==='selected'&&!r.selected.length)throw Error('採用候補を選んでください');
  if(r.decision==='distinct'&&r.selected.length!==ids.size)throw Error('別画像として残す場合は全件を保持します');
  const fields={};
  for(const [id,f] of Object.entries(r.fields||{})){
   if(!ids.has(id)||!f||typeof f!=='object')throw Error('属性の対象IDが一致しません');
   fields[id]={};for(const k of ['plan','phrase','situation'])if(f[k]!=null){if(typeof f[k]!=='string'||f[k].length>2000)throw Error('属性が長すぎます');fields[id][k]=f[k];}
  }
  if(typeof(r.memo||'')!=='string'||(r.memo||'').length>10000)throw Error('メモが長すぎます');
  return {signature:task.signature,decision:r.decision,selected:r.selected.slice(),fields,memo:r.memo||'',updatedAt:typeof r.updatedAt==='string'?r.updatedAt:now()};
 }
 function restore(data,input){
  if(!input||input.schemaVersion!==1||input.datasetId!==data.datasetId||!input.records||Array.isArray(input.records))throw Error('この対象フォルダのバックアップではありません');
  const state=blank(data),map=taskMap(data);let stale=0;
  for(const [id,r] of Object.entries(input.records)){
   const t=map.get(id);if(!t||r.signature!==t.signature){stale++;continue;}
   state.records[id]=validateRecord(data,t,r);
  }
  state.manualTasks=data.tasks.filter(t=>t.id.startsWith('MANUAL-'));
  state.updatedAt=input.updatedAt||now();return {state,stale};
 }
 function load(data,storage,key){const raw=storage.getItem(key);return raw?restore(data,JSON.parse(raw)): {state:blank(data),stale:0};}
 function persist(storage,key,state){const text=JSON.stringify(state);storage.setItem(key,text);if(storage.getItem(key)!==text)throw Error('端末保存の読み戻しが一致しません');return state;}
 function record(data,state,taskId,entry){
  const task=taskMap(data).get(taskId);if(!task)throw Error('確認対象がありません');
  const r=validateRecord(data,task,{...entry,signature:task.signature,updatedAt:now()});
  const old=state.records[taskId]||null;
  return {...state,records:{...state.records,[taskId]:r},history:[...(state.history||[]),{id:taskId,previous:old}].slice(-100),updatedAt:now()};
 }
 function undo(state){if(!state.history?.length)return state;const h=state.history.at(-1),records={...state.records};if(h.previous)records[h.id]=h.previous;else delete records[h.id];return {...state,records,history:state.history.slice(0,-1),updatedAt:now()};}
 function isDone(r){return !!r&&done.has(r.decision);}
 function merge(data,current,other){
  const checked=restore(data,other),records={...current.records};let conflicts=0,imported=0;
  for(const [id,r] of Object.entries(checked.state.records)){
   const old=records[id];
   if(!old||Date.parse(r.updatedAt)>Date.parse(old.updatedAt)){records[id]=r;imported++;}
   else if(JSON.stringify(r)!==JSON.stringify(old))conflicts++;
  }
  return {state:{...current,records,manualTasks:data.tasks.filter(t=>t.id.startsWith('MANUAL-')),updatedAt:now()},stale:checked.stale,conflicts,imported};
 }
 function safeCsv(v){const s=String(v??'');return '"'+(/^[\s]*[=+\-@]/.test(s)?"'"+s:s).replace(/"/g,'""')+'"';}
 function csv(data,state){
  const out=[['対象フォルダID','タスクID','素材DriveID','SHA256','現在名','機械検査','人の判定','候補指定','企画','フレーズ','状況','メモ','判定日時','原本URL','台帳反映']];
  for(const t of data.tasks){const r=state.records[t.id];for(const i of t.members){const a=data.assets[i],f=r?.fields?.[a.id]||{};
   const allocation=r&&isDone(r)?r.decision==='repair'?'要修正':r.selected.includes(a.id)?'採用候補':'予備':'未確定';
   out.push([data.datasetId,t.id,a.id,a.sha256,a.name,a.flags.map(x=>x.label).join(' / '),r?.decision||'未判定',allocation,f.plan||'',f.phrase||'',f.situation||'',r?.memo||'',r?.updatedAt||'',a.url,'未反映']);
  }}
  return '\uFEFF'+out.map(row=>row.map(safeCsv).join(',')).join('\r\n');
 }
 const api={blank,restore,load,persist,record,undo,isDone,merge,csv,safeCsv};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AuditCore=api;
})(typeof window!=='undefined'?window:globalThis);
