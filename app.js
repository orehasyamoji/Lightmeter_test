'use strict';
const F=[1,1.2,1.4,1.8,2,2.8,4,5.6,8,11,16,22,32];
const SS=[30,15,8,4,2,1,1/2,1/4,1/8,1/15,1/30,1/60,1/125,1/250,1/500,1/1000,1/2000,1/4000,1/8000];
const RF=[1,1.2,1.4,1.6,1.8,2,2.2,2.5,2.8,3.2,3.5,4,4.5,5,5.6,6.3,7.1,8,9,10,11,13,14,16,18,20,22,25,29,32];
const RS=[30,25,20,15,13,10,8,6,5,4,3.2,2.5,2,1.6,1.3,1,0.8,0.6,0.5,0.4,0.3,...[4,5,6,8,10,13,15,20,25,30,40,50,60,80,100,125,160,200,250,320,400,500,640,800,1000,1250,1600,2000,2500,3200,4000,5000,6400,8000].map(n=>1/n)];
const shutterLabel=t=>t>=0.3?String(t):'1/'+Math.round(1/t);
function calculate(refIso,refF,refTime,filmIso,value,mode,ev){
 if(![refIso,refF,refTime,filmIso,value].every(x=>Number.isFinite(x)&&x>0))throw Error('ISOなどの入力値を確認してください。');
 const exposure=refTime/(refF*refF)*refIso/filmIso*Math.pow(2,ev);
 const ideal=mode==='ap'?exposure*value*value:Math.sqrt(value/exposure),choices=mode==='ap'?SS:F;
 const rounded=choices.reduce((a,b)=>Math.abs(Math.log2(b/ideal))<Math.abs(Math.log2(a/ideal))?b:a);
 return {ideal,rounded,error:mode==='ap'?Math.log2(rounded/ideal):2*Math.log2(ideal/rounded),outOfRange:ideal<Math.min(...choices)||ideal>Math.max(...choices)};
}
if(typeof module!=='undefined')module.exports={calculate,F,SS};
if(typeof document!=='undefined'){
const $=id=>document.getElementById(id);
let db,state,result,editingRoll,editingShot,messageTimer;
let writeQueue=Promise.resolve();
const uid=()=>crypto.randomUUID();
const newRoll=(brand='未設定のフィルム',iso=200)=>({id:uid(),brand,iso,nextFrame:1,shots:[]});
const current=()=>state.rolls.find(r=>r.id===state.activeRoll);
function toast(text){$('message').textContent=text;$('message').hidden=false;clearTimeout(messageTimer);messageTimer=setTimeout(()=>$('message').hidden=true,4500);}
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open('film-note',1);r.onupgradeneeded=()=>r.result.createObjectStore('data');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function readDB(){return new Promise((resolve,reject)=>{const r=db.transaction('data').objectStore('data').get('state');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function save(){const snapshot=structuredClone(state);const task=writeQueue.then(()=>new Promise((resolve,reject)=>{const t=db.transaction('data','readwrite');t.objectStore('data').put(snapshot,'state');t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||Error('保存中断'));}));writeQueue=task.catch(()=>{});return task;}
function saveInput(){save().catch(()=>toast('保存できませんでした。書き出しでバックアップしてください。'));}
function options(id,values,formatter=String){$(id).replaceChildren(...values.map(v=>{const o=document.createElement('option');o.value=v;o.textContent=formatter(v);return o;}));}
function renderRolls(){$('rollSelect').replaceChildren(...state.rolls.map((r,i)=>{const o=document.createElement('option');o.value=r.id;o.textContent=String(i+1).padStart(2,'0')+' / '+r.brand+' / ISO '+r.iso;return o;}));$('rollSelect').value=state.activeRoll;}
function renderInputs(){const r=current(),v=state.inputs;$('filmIso').value=r.iso;$('nextFrame').value=r.nextFrame;for(const k of ['refIso','refF','refSs','filmF','filmSs'])$(k).value=v[k];update();}
function update(){
 const v=state.inputs;$('apMode').classList.toggle('active',v.mode==='ap');$('ssMode').classList.toggle('active',v.mode==='ss');$('ev').textContent=(v.ev>0?'+':'')+v.ev+' EV';
 try{result=calculate(+v.refIso,+v.refF,+v.refSs,+current().iso,+(v.mode==='ap'?v.filmF:v.filmSs),v.mode,v.ev);
 if(v.mode==='ap'){$('filmSs').value=result.rounded;v.filmSs=result.rounded;}else{$('filmF').value=result.rounded;v.filmF=result.rounded;}
 const ideal=v.mode==='ap'?(result.ideal>=1?result.ideal.toFixed(2)+'秒':'1/'+(1/result.ideal).toFixed(1)+'秒'):'F '+result.ideal.toFixed(2);
 $('rounding').textContent='計算値 '+ideal+' → 最寄りの設定（'+(result.error>=0?'+':'')+result.error.toFixed(2)+' EV）'+(result.outOfRange?'。表示範囲外です。':'');$('record').disabled=result.outOfRange;
 }catch(error){result=null;$('rounding').textContent=error.message;$('record').disabled=true;}
 $('record').textContent=current().nextFrame+'枚目を記録';
}
function renderLogs(){
 const shots=current().shots;$('count').textContent=shots.length+'枚記録済み';$('entries').replaceChildren();
 if(!shots.length){const p=document.createElement('p');p.className='small';p.textContent='まだ記録がありません。換算画面で記録するとここに残ります。';$('entries').append(p);}
 for(const s of [...shots].sort((a,b)=>b.frame-a.frame)){
 const entry=document.createElement('article');entry.className='entry';const header=document.createElement('header'),title=document.createElement('strong'),date=document.createElement('span'),edit=document.createElement('button');
 title.textContent=s.frame+'枚目';date.className='small';date.textContent=new Date(s.at).toLocaleString('ja-JP',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});edit.textContent='編集';edit.onclick=()=>openShot(s);header.append(title,date,edit);
 const p=document.createElement('div');p.className='params';p.textContent='F '+s.f+'　'+shutterLabel(s.ss)+'秒';const sub=document.createElement('p');sub.className='small';sub.textContent='ISO '+s.iso+' / 補正 '+(s.ev>0?'+':'')+s.ev+' EV';entry.append(header,p,sub);$('entries').append(entry);}
}
function openShot(s){editingShot=s.id;$('editFrame').value=s.frame;$('editIso').value=s.iso;$('editF').value=s.f;$('editSs').value=s.ss;const d=new Date(s.at);$('editDate').value=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);$('shotDialog').showModal();}
function rollDialog(isNew){editingRoll=isNew?null:current().id;$('rollTitle').textContent=isNew?'新しいフィルム':'フィルムを編集';$('brand').value=isNew?'':current().brand;$('rollIso').value=isNew?200:current().iso;$('rollDialog').showModal();}
function step(id,delta){const e=$(id);e.selectedIndex=Math.max(0,Math.min(e.options.length-1,e.selectedIndex+delta));e.dispatchEvent(new Event('change'));}
function validBackup(s){
 const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
 if(!s||!Array.isArray(s.rolls)||!s.rolls.length||s.rolls.length>1000||!s.inputs)return false;const ids=new Set();
 for(const r of s.rolls){if(typeof r.id!=='string'||ids.has(r.id)||typeof r.brand!=='string'||r.brand.length>100||!positive(r.iso)||r.iso>102400||!Number.isInteger(r.nextFrame)||r.nextFrame<1||r.nextFrame>999||!Array.isArray(r.shots)||r.shots.length>10000)return false;ids.add(r.id);const shotIds=new Set(),frames=new Set();
 for(const t of r.shots){if(typeof t.id!=='string'||shotIds.has(t.id)||frames.has(t.frame)||!Number.isInteger(t.frame)||t.frame<1||t.frame>999||!Number.isFinite(Date.parse(t.at))||!positive(t.iso)||t.iso>102400||!F.includes(t.f)||!SS.includes(t.ss)||!Number.isFinite(t.ev)||Math.abs(t.ev)>5)return false;shotIds.add(t.id);frames.add(t.frame);}}
 const v=s.inputs;return ids.has(s.activeRoll)&&positive(v.refIso)&&v.refIso<=102400&&RF.includes(v.refF)&&RS.includes(v.refSs)&&F.includes(v.filmF)&&SS.includes(v.filmSs)&&['ap','ss'].includes(v.mode)&&Number.isFinite(v.ev)&&Math.abs(v.ev)<=5;
}
async function init(){
 for(const id of ['filmF','editF'])options(id,F);for(const id of ['filmSs','editSs'])options(id,SS,shutterLabel);options('refF',RF);options('refSs',RS,shutterLabel);
 db=await openDB();state=await readDB();if(!state){const r=newRoll();state={rolls:[r],activeRoll:r.id,inputs:{refIso:200,refF:4,refSs:1/30,filmF:1.4,filmSs:1/250,mode:'ap',ev:0}};await save();}
 renderRolls();renderInputs();renderLogs();
 for(const k of ['refIso','refF','refSs','filmF','filmSs'])$(k).onchange=()=>{const value=+$(k).value;if(k==='refIso'&&(!Number.isFinite(value)||value<1||value>102400)){$(k).value=state.inputs[k];toast('ISOは1〜102400で入力してください。');return;}state.inputs[k]=value;if(k==='filmF')state.inputs.mode='ap';if(k==='filmSs')state.inputs.mode='ss';update();saveInput();};
 $('filmIso').onchange=()=>{const n=+$('filmIso').value;if(!Number.isFinite(n)||n<1||n>102400){$('filmIso').value=current().iso;toast('ISOは1〜102400で入力してください。');return;}current().iso=n;renderRolls();update();saveInput();};
 $('nextFrame').onchange=()=>{const n=+$('nextFrame').value;if(!Number.isInteger(n)||n<1||n>999){$('nextFrame').value=current().nextFrame;return;}current().nextFrame=n;update();saveInput();};
 $('apMode').onclick=()=>{state.inputs.mode='ap';update();saveInput();};$('ssMode').onclick=()=>{state.inputs.mode='ss';update();saveInput();};
 $('fMinus').onclick=()=>step('filmF',-1);$('fPlus').onclick=()=>step('filmF',1);$('ssMinus').onclick=()=>step('filmSs',-1);$('ssPlus').onclick=()=>step('filmSs',1);
 for(const [id,delta] of [['evMinus',-.5],['evPlus',.5]])$(id).onclick=()=>{state.inputs.ev=Math.max(-5,Math.min(5,state.inputs.ev+delta));update();saveInput();};
 $('record').onclick=async()=>{if(!result)return;const r=current(),v=state.inputs;if(r.shots.some(s=>s.frame===r.nextFrame)){toast('そのコマ番号は記録済みです。番号を変更するか記録を編集してください。');return;}const before=structuredClone(state);$('record').disabled=true;r.shots.push({id:uid(),frame:r.nextFrame,at:new Date().toISOString(),iso:r.iso,f:v.filmF,ss:v.filmSs,ev:v.ev,reference:{iso:v.refIso,f:v.refF,ss:v.refSs}});r.nextFrame=Math.min(999,r.nextFrame+1);try{await save();renderInputs();renderLogs();toast('記録しました。');}catch{state=before;renderInputs();toast('保存できませんでした。記録は追加されていません。');}};
 $('rollSelect').onchange=()=>{state.activeRoll=$('rollSelect').value;renderInputs();renderLogs();saveInput();};
 $('rollEdit').onclick=()=>rollDialog(false);$('rollNew').onclick=()=>rollDialog(true);$('cancelRoll').onclick=()=>$('rollDialog').close();
 $('rollForm').onsubmit=async e=>{e.preventDefault();const before=structuredClone(state),brand=$('brand').value.trim();if(!brand){toast('銘柄を入力してください。');return;}if(editingRoll){current().brand=brand;current().iso=+$('rollIso').value;}else{const r=newRoll(brand,+$('rollIso').value);state.rolls.push(r);state.activeRoll=r.id;}try{await save();$('rollDialog').close();renderRolls();renderInputs();renderLogs();}catch{state=before;toast('保存できませんでした。');}};
 $('cancelShot').onclick=()=>$('shotDialog').close();
 $('shotForm').onsubmit=async e=>{e.preventDefault();const frame=+$('editFrame').value,r=current();if(r.shots.some(s=>s.id!==editingShot&&s.frame===frame)){toast('コマ番号が重複しています。');return;}const before=structuredClone(state),s=r.shots.find(s=>s.id===editingShot);Object.assign(s,{frame,at:new Date($('editDate').value).toISOString(),iso:+$('editIso').value,f:+$('editF').value,ss:+$('editSs').value});try{await save();$('shotDialog').close();renderLogs();}catch{state=before;toast('保存できませんでした。');}};
 document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{for(const id of ['convert','logs','settings'])$(id).hidden=id!==b.dataset.tab;document.querySelectorAll('[data-tab]').forEach(n=>n.classList.toggle('active',n===b));renderLogs();window.scrollTo(0,0);});
 $('export').onclick=()=>{const blob=new Blob([JSON.stringify({format:'film-note',version:1,exportedAt:new Date().toISOString(),state},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='film-note-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);};
 $('import').onclick=()=>$('importFile').click();$('importFile').onchange=async()=>{const file=$('importFile').files[0];if(!file)return;try{if(file.size>10000000)throw Error('ファイルが大きすぎます。');const data=JSON.parse(await file.text());if(data.format!=='film-note'||data.version!==1||!validBackup(data.state))throw Error('対応するバックアップではありません。');if(!confirm('現在の全記録をバックアップの内容に置き換えます。先に現在の記録を書き出すことをおすすめします。続けますか？'))return;const before=state;state=data.state;try{await save();}catch(error){state=before;throw error;}renderRolls();renderInputs();renderLogs();toast('読み込みました。');}catch(error){toast('読み込み失敗：'+error.message);}finally{$('importFile').value='';}};
 $('persist').onclick=async()=>{try{const ok=await navigator.storage?.persist?.();$('persistStatus').textContent=ok?'保持が許可されました。バックアップも続けてください。':'保持を保証できません。定期的に書き出してください。';}catch{$('persistStatus').textContent='この環境では利用できません。';}};
}
init().catch(error=>{toast('保存領域を開けません：'+error.message);$('record').disabled=true;});
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').then(()=>navigator.serviceWorker.ready).then(()=>{$('offline').textContent='オフライン準備完了';}).catch(()=>{$('offline').textContent='オンラインのみ';});else $('offline').textContent='オンラインのみ';
}
