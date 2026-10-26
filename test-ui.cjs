const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']}),context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,acceptDownloads:true});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://accounts.google.com/**',r=>r.abort());
 await page.goto('http://127.0.0.1:8765/gen-review.html');await page.waitForSelector('.asset');await page.waitForTimeout(300);
 assert.equal(await page.locator('#fatal').isVisible(),false);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'output/audit-mobile.png',fullPage:true});
 const taskId=(await page.locator('.review>.small').textContent()).split(' · ').at(-1),checkbox=page.locator('.asset input[type=checkbox]').first();await checkbox.check();await page.locator('.memo textarea').fill('ブラウザ検証のメモ');await page.getByRole('button',{name:'選択を採用候補にして次へ',exact:true}).click();
 const key=await page.evaluate(()=>Object.keys(localStorage).find(k=>k.startsWith('line-image-audit-v1:')&&!k.endsWith(':clientId')));
 const first=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);assert.equal(first.records[taskId].decision,'selected');assert.equal(first.records[taskId].memo,'ブラウザ検証のメモ');
 await page.reload();await page.waitForSelector('.asset');assert.ok(!(await page.locator('.review>.small').textContent()).includes(taskId));
 await page.getByRole('button',{name:'保留して次へ',exact:true}).click();await page.getByRole('button',{name:'保留',exact:true}).click();assert.ok((await page.locator('.reason').allTextContents()).includes('保留中です'));
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'進捗JSONを保存',exact:true}).click();const file=await download;await file.saveAs('output/ui-backup-test.json');const saved=JSON.parse(fs.readFileSync('output/ui-backup-test.json'));assert.equal(saved.datasetId,first.datasetId);assert.equal(saved.records[taskId].decision,'selected');
 await page.getByRole('button',{name:'判定済み',exact:true}).click();assert.ok((await page.locator('.review>.small').textContent()).includes(taskId));
 // Corrupt imports cannot erase the current result.
 await page.locator('#restoreFile').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...saved,datasetId:'wrong'}))});assert.equal(await page.locator('#fatal').isVisible(),true);assert.equal(await page.evaluate(([k,t])=>JSON.parse(localStorage.getItem(k)).records[t].decision,[key,taskId]),'selected');
 const fresh=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const p=await fresh.newPage();await p.route('https://accounts.google.com/**',r=>r.abort());await p.goto('http://127.0.0.1:8765/gen-review.html');await p.waitForSelector('.asset');await p.locator('#restoreFile').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});await p.getByRole('button',{name:'判定済み',exact:true}).click();assert.ok((await p.locator('.review>.small').textContent()).includes(taskId));
 // Storage failure blocks advance and still allows export of current in-memory changes.
 await p.getByRole('button',{name:'未確認だけ',exact:true}).click();const before=await p.locator('.review>.small').textContent();await p.evaluate(()=>{Storage.prototype.setItem=function(){throw Error('quota test')};});await p.locator('.asset input[type=checkbox]').first().check();await p.getByRole('button',{name:'選択を採用候補にして次へ',exact:true}).click();assert.equal(await p.locator('.review>.small').textContent(),before);assert.equal(await p.locator('#fatal').isVisible(),true);
 assert.deepEqual(errors,[]);console.log('Mobile UI: selection, notes, reload, pending filter, hold, export, new-browser restore, invalid backup, quota failure, no overflow, no JS errors PASS');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
