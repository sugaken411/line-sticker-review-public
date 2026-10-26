"""Extract conservative technical review candidates, without changing originals."""
import json,hashlib,collections,math,pathlib
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT=pathlib.Path(__file__).resolve().parent
SOURCE=ROOT.parent/'output/analysis.json'
def stable(prefix,parts): return prefix+hashlib.sha256('|'.join(sorted(parts)).encode()).hexdigest()[:20]
def inspect_image(im):
 a=np.array(im.convert('RGBA'))[:,:,3];m=a>=32;h,w=m.shape;area=int(m.sum());flags=[]
 labels,n=ndimage.label(m);sizes=np.bincount(labels.ravel())[1:];largest=int(sizes.max()) if len(sizes) else 0
 edges={k:int(v.sum()) for k,v in [('上',m[:2]),('下',m[-2:]),('左',m[:,:2]),('右',m[:,-2:])]}
 touch=[k for k,v in edges.items() if v>=3]
 if touch: flags.append({'code':'edge','label':'画像端に描画：'+','.join(touch)+'（文字・体の欠け候補）','priority':90})
 if area==0: flags.append({'code':'empty','label':'描画を検出できない','priority':100})
 elif area/(h*w)<.15 and largest/(h*w)<.06:flags.append({'code':'sparse','label':'描画量が少ない：欠落／意図した文字のみか確認','priority':95})
 tiny=sizes[(sizes>=3)&(sizes<=max(12,area*.0005))]
 if len(tiny)>=8 and int(tiny.sum())>20:flags.append({'code':'islands','label':'小さな独立片が多い：ごみ／装飾か確認','priority':55})
 return flags,{'alphaArea':area,'occupancy':round(area/(h*w),5),'largestComponent':largest,'edgePixels':edges,'tinyIslands':len(tiny)}
def build():
 a=json.load(open(SOURCE));raw=a['rows'];assets=[];index={};contact=[]
 for old,r in enumerate(raw):
  if not r['name'].lower().endswith('.png'):contact.append(r['id']);continue
  flags,metrics=inspect_image(Image.open(ROOT.parent/'images'/(r['id']+'.img')))
  index[old]=len(assets);assets.append({k:r[k] for k in ['id','name','sha256','width','height','url','source_id','cut','naming','plan','phrase','situation']})
  assets[-1].update(flags=flags,metrics=metrics,ledgerState='Google側3表で同じDrive ID未連結')
 p=list(range(len(assets)))
 def find(i):
  while p[i]!=i:p[i]=p[p[i]];i=p[i]
  return i
 pairs=[]
 for d,i,j in a['pairs']:
  if i not in index or j not in index:continue
  i,j=index[i],index[j];p[find(i)]=find(j);pairs.append([d,i,j])
 components=collections.defaultdict(list)
 for i in range(len(assets)):components[find(i)].append(i)
 tasks=[];grouped=set()
 for members in components.values():
  if len(members)<2:continue
  grouped.update(members);edges=[e for e in pairs if e[1] in members and e[2] in members];members.sort(key=lambda i:(-len(assets[i]['flags']),assets[i]['name'],assets[i]['id']))
  sig=stable('SIG-', [assets[i]['id']+':'+assets[i]['sha256'] for i in members]);taskid=stable('SIM-', [assets[i]['id'] for i in members])
  priority=max([80 if min(e[0] for e in edges)<=2 else 60]+[f['priority'] for i in members for f in assets[i]['flags']])
  tasks.append({'id':taskid,'signature':sig,'type':'similar','members':members,'edges':edges,'priority':priority,'reasons':['見た目が近い候補（同一性は未確定）']})
 for i,r in enumerate(assets):
  if i in grouped or not r['flags']:continue
  tasks.append({'id':stable('QA-', [r['id']]),'signature':stable('SIG-',[r['id']+':'+r['sha256']]),'type':'quality','members':[i],'edges':[],'priority':max(f['priority'] for f in r['flags']),'reasons':[f['label'] for f in r['flags']]})
 tasks.sort(key=lambda t:(-t['priority'],t['id']))
 queued=set(i for t in tasks for i in t['members']);passed=[i for i in range(len(assets)) if i not in queued]
 # Sprite previews are immutable derivatives. Original images are not renamed or altered.
 thumb=256;side=8;(ROOT/'gen-assets').mkdir(exist_ok=True)
 for block in range(math.ceil(len(assets)/(side*side))):
  subset=assets[block*64:(block+1)*64];sheet=Image.new('RGBA',(thumb*side,thumb*side),(0,0,0,0))
  for j,r in enumerate(subset):
   im=Image.open(ROOT.parent/'images'/(r['id']+'.img')).convert('RGBA');im.thumbnail((thumb-8,thumb-8),Image.Resampling.LANCZOS)
   x=(j%side)*thumb+(thumb-im.width)//2;y=(j//side)*thumb+(thumb-im.height)//2;sheet.alpha_composite(im,(x,y))
   r['preview']={'sheet':block,'column':j%side,'row':j//side}
  sheet.save(ROOT/'gen-assets'/f'sheet-{block:02}.webp','WEBP',quality=84,method=6)
 checks=collections.Counter(f['code'] for r in assets for f in r['flags'])
 data={'schemaVersion':1,'datasetId':'gen-drive-1HcaCgNCgMWHJ9_ga21DI1BX3iHEuNepd','revision':stable('REV-',[r['id']+r['sha256'] for r in assets]),'title':'Gen（救急医アフロ先生）','auditDate':'2026-10-27','assets':assets,'tasks':tasks,'autoPassed':passed,'excluded':contact,'summary':{'totalImages':len(raw),'stickerImages':len(assets),'contactSheets':len(contact),'similarGroups':sum(t['type']=='similar' for t in tasks),'similarPairs':len(pairs),'qualityOnlyTasks':sum(t['type']=='quality' for t in tasks),'reviewImages':len(queued),'technicalNoFlags':len(passed),'flagCounts':dict(checks),'ledgerUnlinked':len(assets)}}
 (ROOT/'gen-data.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
 print(json.dumps(data['summary'],ensure_ascii=False));print('sprite bytes',sum(p.stat().st_size for p in (ROOT/'gen-assets').glob('*.webp')))
if __name__=='__main__':build()
