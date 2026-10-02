const $=s=>document.querySelector(s);
const captureBtn=$('#capture'),status=$('#status'),bar=$('#bar'),statusText=$('#statusText'),result=$('#result'),details=$('#details'),error=$('#error'),again=$('#again'),historyEl=$('#history'),emptyHistory=$('#emptyHistory'),historyCount=$('#historyCount'),refreshHistory=$('#refreshHistory');
let latest=null;

function setProgress(p,t){const n=Math.max(0,Math.min(100,p));bar.style.width=n+'%';statusText.textContent=t;const pct=document.querySelector('#statusPercent');if(pct)pct.textContent=Math.round(n)+'%'}
async function getTab(){const [t]=await chrome.tabs.query({active:true,currentWindow:true});return t}
async function send(m){return await chrome.runtime.sendMessage(m)}
function showError(e){error.textContent=e.message||String(e);error.classList.remove('hidden')}
function formatDate(ts){try{return new Date(ts).toLocaleString([], {dateStyle:'medium',timeStyle:'short'})}catch{return new Date(ts).toLocaleString()}}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

async function loadHistory(){
  try{
    const r=await send({type:'HISTORY_LIST'});
    if(!r?.success) throw Error(r?.error||'Could not load history.');
    const items=r.items||[];
    historyCount.textContent=`${items.length} capture${items.length===1?'':'s'}`;
    emptyHistory.classList.toggle('hidden',items.length>0);
    historyEl.innerHTML=items.map(item=>`
      <article class="history-item" data-id="${esc(item.id)}">
        <div class="history-title" title="${esc(item.title)}">${esc(item.title||'Captured page')}</div>
        <div class="history-meta">${formatDate(item.createdAt)} • ${item.width} × ${item.height}px</div>
        <div class="history-actions">
          <button data-history-format="png">PNG</button>
          <button data-history-format="jpg">JPG</button>
          <button data-history-format="pdf">PDF</button>
          <button data-history-delete="1" class="delete">Delete</button>
        </div>
      </article>`).join('');
  }catch(e){showError(e)}
}

async function run(){
  captureBtn.disabled=true;result.classList.add('hidden');error.classList.add('hidden');status.classList.remove('hidden');setProgress(2,'Finding the real scroll container…');
  try{
    const t=await getTab();
    if(!t?.id)throw Error('No active tab.');
    if(/^(edge|chrome|about|devtools):/i.test(t.url||''))throw Error('Open a normal webpage.');
    const r=await send({type:'CAPTURE_FULL_PAGE',tabId:t.id});
    if(!r?.success)throw Error(r?.error||'Capture failed.');
    latest=r;
    details.textContent=`${r.width} × ${r.height} CSS px • ${r.tiles} captures • ${r.scrollType} scroll`;
    result.classList.remove('hidden');setProgress(100,'Capture complete.');
    await loadHistory();
  }catch(e){showError(e)}finally{captureBtn.disabled=false}
}

chrome.runtime.onMessage.addListener(m=>{
  if(m?.type==='CAPTURE_PROGRESS')setProgress(5+Math.round((m.done/m.total)*90),`Capturing ${m.done} of ${m.total} • scroll ${Math.round(m.y)}`);
});

captureBtn.onclick=run;
again.onclick=run;
refreshHistory.onclick=loadHistory;

document.querySelectorAll('[data-format]').forEach(b=>b.onclick=async()=>{
  error.classList.add('hidden');const t=await getTab();if(!t?.id){showError(new Error('No active tab.'));return;}
  b.disabled=true;
  try{const r=await send({type:'EXPORT',tabId:t.id,format:b.dataset.format});if(!r?.success)throw Error(r?.error||'Export failed.');status.classList.remove('hidden');setProgress(100,`${b.dataset.format.toUpperCase()} downloaded.`)}catch(e){showError(e)}finally{b.disabled=false}
});

historyEl.addEventListener('click',async e=>{
  const button=e.target.closest('button');if(!button)return;
  const card=button.closest('.history-item');const id=card?.dataset.id;if(!id)return;
  error.classList.add('hidden');button.disabled=true;
  try{
    if(button.hasAttribute('data-history-delete')){
      const r=await send({type:'HISTORY_DELETE',id});if(!r?.success)throw Error(r?.error||'Delete failed.');
      await loadHistory();
    }else{
      const format=button.dataset.historyFormat;
      const r=await send({type:'HISTORY_EXPORT',id,format});if(!r?.success)throw Error(r?.error||'Export failed.');
    }
  }catch(e){showError(e)}finally{button.disabled=false}
});

loadHistory();
