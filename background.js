const CAPTURE_INTERVAL = 550;
let lastCaptureAt = 0;
let captureQueue = Promise.resolve();
const latestByTab = new Map();

const HISTORY_DB='snapscroll-history-db';
const HISTORY_STORE='captures';
const HISTORY_LIMIT=20;

function openHistoryDb(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(HISTORY_DB,1);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(HISTORY_STORE)) db.createObjectStore(HISTORY_STORE,{keyPath:'id'});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('Could not open capture history.'));
  });
}
async function historyPut(record){
  const db=await openHistoryDb();
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(HISTORY_STORE,'readwrite');
    tx.objectStore(HISTORY_STORE).put(record);
    tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error);
  });
  db.close();
  await historyTrim();
}
async function historyTrim(){
  const db=await openHistoryDb();
  const records=await new Promise((resolve,reject)=>{
    const tx=db.transaction(HISTORY_STORE,'readonly');
    const req=tx.objectStore(HISTORY_STORE).getAll();
    req.onsuccess=()=>resolve(req.result||[]); req.onerror=()=>reject(req.error);
  });
  const old=records.sort((a,b)=>b.createdAt-a.createdAt).slice(HISTORY_LIMIT);
  if(old.length){
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(HISTORY_STORE,'readwrite'); const store=tx.objectStore(HISTORY_STORE);
      old.forEach(r=>store.delete(r.id));
      tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error);
    });
  }
  db.close();
}
async function historyList(){
  const db=await openHistoryDb();
  const records=await new Promise((resolve,reject)=>{
    const tx=db.transaction(HISTORY_STORE,'readonly'); const req=tx.objectStore(HISTORY_STORE).getAll();
    req.onsuccess=()=>resolve((req.result||[]).sort((a,b)=>b.createdAt-a.createdAt)); req.onerror=()=>reject(req.error);
  });
  db.close();
  return records.map(r=>({id:r.id,title:r.title,url:r.url,createdAt:r.createdAt,width:r.width,height:r.height}));
}
async function historyGet(id){
  const db=await openHistoryDb();
  const record=await new Promise((resolve,reject)=>{
    const tx=db.transaction(HISTORY_STORE,'readonly'); const req=tx.objectStore(HISTORY_STORE).get(id);
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
  });
  db.close();
  if(!record) throw new Error('History item no longer exists.');
  return record;
}
async function historyDelete(id){
  const db=await openHistoryDb();
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(HISTORY_STORE,'readwrite'); tx.objectStore(HISTORY_STORE).delete(id);
    tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error);
  });
  db.close();
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function captureVisible(windowId){
  const run = async () => {
    const wait = CAPTURE_INTERVAL - (Date.now() - lastCaptureAt);
    if (wait > 0) await sleep(wait);
    let last;
    for(let i=0;i<4;i++){
      try{
        const data = await chrome.tabs.captureVisibleTab(windowId,{format:'png'});
        lastCaptureAt = Date.now();
        return data;
      }catch(e){
        last=e;
        await sleep(Math.min(1600,CAPTURE_INTERVAL*(i+1)));
      }
    }
    throw new Error(`captureVisibleTab failed: ${last?.message||last}`);
  };
  const p = captureQueue.catch(()=>{}).then(run);
  captureQueue = p.catch(()=>{});
  return p;
}

async function inject(tabId, func, args=[]){
  const r = await chrome.scripting.executeScript({target:{tabId,frameIds:[0]},func,args});
  return r?.[0]?.result;
}

async function inspect(tabId){
  return inject(tabId,()=>{
    const old=document.querySelector('[data-snapscroll-root]');
    if(old) old.removeAttribute('data-snapscroll-root');
    const de=document.documentElement, body=document.body;
    const vh=window.innerHeight, vw=window.innerWidth;
    const candidates=[];
    const add=(el,type)=>{
      if(!el) return;
      const cs=getComputedStyle(el), sh=el.scrollHeight||0,ch=el.clientHeight||0,sw=el.scrollWidth||0,cw=el.clientWidth||0;
      const dy=Math.max(0,sh-ch),dx=Math.max(0,sw-cw);
      if(dy<20 && dx<20) return;
      const r=el.getBoundingClientRect();
      if(r.width<80 || r.height<80) return;
      if(cs.display==='none'||cs.visibility==='hidden') return;
      candidates.push({el,type,dy,dx,area:r.width*r.height,top:r.top,left:r.left,width:r.width,height:r.height,sh,ch,sw,cw});
    };
    for(const el of document.querySelectorAll('*')){
      const cs=getComputedStyle(el);
      if(!/(auto|scroll|overlay|clip|hidden)/.test(cs.overflowY) && !/(auto|scroll|overlay|clip|hidden)/.test(cs.overflow)) continue;
      add(el,'element');
      if(candidates.length>500) break;
    }
    const pageH=Math.max(de?.scrollHeight||0,body?.scrollHeight||0);
    const pageW=Math.max(de?.scrollWidth||0,body?.scrollWidth||0);
    const pageDy=Math.max(0,pageH-vh);
    let chosen={type:'window',dy:pageDy,dx:Math.max(0,pageW-vw),sh:pageH,ch:vh,sw:pageW,cw:vw};
    const nested=candidates.filter(c=>c.dy>20).sort((a,b)=> (b.dy*b.area)-(a.dy*a.area))[0];
    if(pageDy<80 && nested) chosen=nested;
    else if(nested && nested.dy>pageDy*1.15 && nested.area>vw*vh*0.35) chosen=nested;
    if(chosen.type==='element'){
      const token='ss-'+Math.random().toString(36).slice(2);
      chosen.el.setAttribute('data-snapscroll-root',token);
      chosen.token=token;
      return {type:'element',token,scrollHeight:chosen.sh,clientHeight:chosen.ch,scrollWidth:chosen.sw,clientWidth:chosen.cw,browserWidth:window.innerWidth,browserHeight:window.innerHeight,rect:{top:chosen.top,left:chosen.left,width:chosen.width,height:chosen.height}};
    }
    return {type:'window',scrollHeight:pageH,clientHeight:vh,scrollWidth:pageW,clientWidth:vw,viewportWidth:vw,viewportHeight:vh,scrollY:window.scrollY,scrollX:window.scrollX,rect:{top:0,left:0,width:vw,height:vh}};
  },[]);
}

async function scrollTarget(tabId,state,target){
  return inject(tabId,(state,target)=>{
    let max,actual;
    if(state.type==='element'){
      const el=document.querySelector(`[data-snapscroll-root="${CSS.escape(state.token)}"]`);
      if(!el) throw new Error('SnapScroll scroll container disappeared.');
      max=Math.max(0,el.scrollHeight-el.clientHeight);
      const y=Math.min(Math.max(0,target),max);
      el.scrollTop=y;
      void el.offsetHeight;
      actual=el.scrollTop;
      return {requested:y,actual,max,client:el.clientHeight,scrollHeight:el.scrollHeight};
    }
    const root=document.scrollingElement||document.documentElement||document.body;
    max=Math.max(0,root.scrollHeight-window.innerHeight);
    const y=Math.min(Math.max(0,target),max);
    root.scrollTop=y;
    document.documentElement.scrollTop=y;
    if(document.body) document.body.scrollTop=y;
    window.scrollTo(0,y);
    void root.offsetHeight;
    actual=window.scrollY;
    return {requested:y,actual,rootY:root.scrollTop,max,client:window.innerHeight,scrollHeight:root.scrollHeight};
  },[state,target]);
}

async function getText(tabId,state){
  return inject(tabId,(state)=>{
    const root=state.type==='element'?document.querySelector(`[data-snapscroll-root="${CSS.escape(state.token)}"]`):null;
    const baseX=state.type==='element'?(root?.getBoundingClientRect().left||0):0;
    const baseY=state.type==='element'?(root?.getBoundingClientRect().top||0):0;
    const scrollX=state.type==='element'?(root?.scrollLeft||0):window.scrollX;
    const scrollY=state.type==='element'?(root?.scrollTop||0):window.scrollY;
    const out=[]; const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    let n; while((n=walker.nextNode()) && out.length<30000){
      const text=(n.nodeValue||'').replace(/\s+/g,' ').trim();
      if(!text) continue;
      const el=n.parentElement; if(!el) continue;
      const cs=getComputedStyle(el);
      if(cs.display==='none'||cs.visibility==='hidden'||parseFloat(cs.opacity||'1')===0) continue;
      if(root && !root.contains(el)) continue;
      const r=document.createRange(); r.selectNodeContents(n);
      const rects=[...r.getClientRects()];
      for(const q of rects){
        if(q.width<1||q.height<1) continue;
        const x=(q.left-baseX)+scrollX+(state.type==='element'?baseX:0);
        const y=(q.top-baseY)+scrollY+(state.type==='element'?baseY:0);
        out.push({text,x,y,w:q.width,h:q.height});
      }
    }
    return out;
  },[state]);
}

async function restore(tabId,state){
  try{await inject(tabId,state=>{
    if(state.type==='element'){
      const el=document.querySelector(`[data-snapscroll-root="${CSS.escape(state.token)}"]`);
      if(el){el.removeAttribute('data-snapscroll-root');el.scrollTop=0;}
    }else window.scrollTo(0,0);
  },[state]);}catch{}
}

async function runCapture(tabId){
  const tab=await chrome.tabs.get(tabId);
  if(typeof tab?.windowId!=='number') throw new Error('Could not access active tab.');
  const state=await inspect(tabId);
  const browserW=state.browserWidth||state.clientWidth;
  const browserH=state.browserHeight||state.clientHeight;
  const maxY=Math.max(0,state.scrollHeight-state.clientHeight);
  const step=Math.max(1,state.clientHeight-4);
  const positions=[];
  for(let y=0;y<maxY;y+=step) positions.push(y);
  if(!positions.length||positions.at(-1)!==maxY) positions.push(maxY);
  const tiles=[];
  let text;
  try{
    for(let i=0;i<positions.length;i++){
      const pos=await scrollTarget(tabId,state,positions[i]);
      await sleep(180);
      const verify=await inject(tabId,state=>{
        if(state.type==='element'){
          const el=document.querySelector(`[data-snapscroll-root="${CSS.escape(state.token)}"]`);return el?{y:el.scrollTop}:null;
        }
        return {y:window.scrollY};
      },[state]);
      if(!verify) throw new Error('Could not verify scroll position.');
      const data=await captureVisible(tab.windowId);
      tiles.push({data,y:verify.y});
      try{chrome.runtime.sendMessage({type:'CAPTURE_PROGRESS',done:i+1,total:positions.length,y:verify.y}).catch(()=>{});}catch{}
    }
    text=await getText(tabId,state);
  } finally {
    await restore(tabId,state);
  }
  const latest={tiles,viewportWidth:state.clientWidth,viewportHeight:state.clientHeight,browserWidth:browserW,browserHeight:browserH,totalWidth:state.scrollWidth,totalHeight:state.scrollHeight,clientWidth:state.clientWidth,clientHeight:state.clientHeight,scrollType:state.type,rect:state.rect,text:text||[]};
  latestByTab.set(tabId,latest);

  // Persist the finished continuous image in IndexedDB. History stores one
  // PNG plus text metadata, so users can later export PNG/JPG/PDF without
  // retaining all individual viewport screenshots.
  const historyCanvas=await stitch(latest);
  const historyBlob=await historyCanvas.convertToBlob({type:'image/png'});
  const tabInfo=await chrome.tabs.get(tabId).catch(()=>({}));
  await historyPut({
    id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
    createdAt:Date.now(),
    title:tabInfo?.title||'Captured page',
    url:tabInfo?.url||'',
    width:historyCanvas.width,
    height:historyCanvas.height,
    png:historyBlob,
    text:text||[]
  });
  historyCanvas.width=0; historyCanvas.height=0;
  return {tiles:tiles.length,width:state.scrollWidth,height:state.scrollHeight,scrollType:state.type,positions:tiles.map(t=>t.y)};
}

async function dataUrlToBlob(url){
  const res=await fetch(url); return await res.blob();
}
async function blobToDataUrl(blob){
  const buf=await blob.arrayBuffer();
  const bytes=new Uint8Array(buf); let binary=''; const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk){binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+chunk,bytes.length)));}
  return `data:${blob.type||'application/octet-stream'};base64,${btoa(binary)}`;
}
async function decodeData(url){
  const blob=await dataUrlToBlob(url);
  return await createImageBitmap(blob);
}

async function stitch(latest){
  if(!latest?.tiles?.length) throw new Error('No captured tiles. Capture the page first.');
  const first=await decodeData(latest.tiles[0].data);

  const browserW=Math.max(1,latest.browserWidth||latest.viewportWidth||first.width);
  const browserH=Math.max(1,latest.browserHeight||latest.viewportHeight||first.height);
  const pxPerCssX=first.width/browserW;
  const pxPerCssY=first.height/browserH;

  let outW=Math.max(1,Math.round(latest.totalWidth*pxPerCssX));
  let outH=Math.max(1,Math.round(latest.totalHeight*pxPerCssY));

  // For a nested scroll container, the browser viewport may contain a fixed
  // application header (Gmail's logo/search bar is a common example) above
  // the scrolling list. The old stitcher cropped that header away. Instead,
  // keep the FIRST viewport intact, then extend the scrolling container below
  // it using the real scrollTop positions. Subsequent tiles contribute only
  // the scroll-container rectangle, so fixed headers are never duplicated.
  const nested=latest.scrollType==='element';
  const rect=latest.rect||{};
  const left=Math.max(0,Number(rect.left)||0);
  const top=Math.max(0,Number(rect.top)||0);
  const width=Math.max(1,Number(rect.width)||latest.clientWidth||browserW);
  const height=Math.max(1,Number(rect.height)||latest.clientHeight||browserH);

  if(nested){
    outW=Math.max(1,Math.round(Math.max(browserW,width)*pxPerCssX));
    outH=Math.max(1,Math.round((top+latest.totalHeight)*pxPerCssY));
  }

  if(outW>10000||outH>30000) throw new Error(`Page is too large to stitch (${outW}×${outH}px).`);
  const canvas=new OffscreenCanvas(outW,outH);
  const ctx=canvas.getContext('2d',{alpha:false});
  ctx.fillStyle='#fff';ctx.fillRect(0,0,outW,outH);

  if(!nested){
    // Normal document scrolling: the screenshot itself is the viewport tile.
    for(const tile of latest.tiles){
      const bmp=await decodeData(tile.data);
      const dy=Math.max(0,Math.round(tile.y*pxPerCssY));
      const drawH=Math.min(first.height,outH-dy);
      if(drawH>0) ctx.drawImage(bmp,0,0,first.width,drawH,0,dy,first.width,drawH);
      bmp.close();
    }
  }else{
    const cropX=Math.max(0,Math.min(first.width-1,Math.round(left*pxPerCssX)));
    const cropY=Math.max(0,Math.min(first.height-1,Math.round(top*pxPerCssY)));
    const cropW=Math.max(1,Math.min(first.width-cropX,Math.round(width*pxPerCssX)));
    const cropH=Math.max(1,Math.min(first.height-cropY,Math.round(height*pxPerCssY)));

    // First capture: preserve the entire visible browser viewport. This keeps
    // the upper app chrome/header that sits outside the scroll container.
    ctx.drawImage(first,0,0,Math.min(first.width,outW),Math.min(first.height,outH),0,0,Math.min(first.width,outW),Math.min(first.height,outH));

    // Following captures: crop only the scrollable element and place it at
    // top + actual scrollTop. The first crop is already present in the first
    // viewport, so later tiles begin at their exact scroll coordinates.
    for(let i=1;i<latest.tiles.length;i++){
      const tile=latest.tiles[i];
      const bmp=await decodeData(tile.data);
      const dy=Math.round((top+tile.y)*pxPerCssY);
      const visibleH=Math.min(cropH,outH-dy);
      if(visibleH>0){
        ctx.drawImage(bmp,cropX,cropY,cropW,visibleH,Math.round(left*pxPerCssX),dy,cropW,visibleH);
      }
      bmp.close();
    }
  }

  first.close();
  return canvas;
}
function escPdf(s){return s.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)').replace(/[^\x20-\x7E]/g,' ');}
function bytesFromBase64(b64){const bin=atob(b64);const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return a;}
async function jpegBytesFromCanvas(canvas){
  const blob=await canvas.convertToBlob({type:'image/jpeg',quality:.9});
  return new Uint8Array(await blob.arrayBuffer());
}
function makePdf(jpeg,w,h,text,scale){
  // Keep the entire stitched screenshot on ONE PDF page.
  // Object numbers are deliberately fixed and non-overlapping:
  // 1=image, 2=font, 3=content, 4=page, 5=pages, 6=catalog.
  const pageW=595.28;
  const pageH=pageW*(h/Math.max(1,w));
  if(!Number.isFinite(pageH) || pageH<=0) throw new Error('Invalid PDF page size.');
  if(pageH>14400) throw new Error(`The captured page is too tall for a single PDF page (${Math.round(pageH)} pt).`);

  const objects=[]; const add=o=>{objects.push(o);return objects.length;};
  const imgObj=add(null);      // 1
  const fontObj=add(null);     // 2
  const contentObj=add(null);  // 3
  const pageObj=add(null);     // 4
  const pagesObj=add(null);    // 5
  const catalogObj=add(null);  // 6

  const content=[];
  content.push('q');
  content.push(`${pageW.toFixed(3)} 0 0 ${pageH.toFixed(3)} 0 0 cm`);
  content.push('/Im0 Do');
  content.push('Q');

  // Invisible selectable text layer over the screenshot.
  content.push('BT /F1 1 Tf 3 Tr');
  for(const t of (text||[])){
    const x=(t.x/Math.max(1,w))*pageW;
    const y=pageH-((t.y+t.h)/Math.max(1,h))*pageH;
    const fs=Math.max(.5,Math.min(72,(t.h/Math.max(1,h))*pageH*.9));
    if(x<0 || y<-fs || x>pageW) continue;
    content.push(`${fs.toFixed(3)} Tf 1 0 0 1 ${x.toFixed(3)} ${y.toFixed(3)} Tm (${escPdf(t.text)}) Tj`);
  }
  content.push('ET');
  const contentBody=content.join('\n');

  let parts=['%PDF-1.4\n%\xFF\xFF\xFF\xFF\n'];
  const objStart=[];
  const currentOffset=()=>parts.reduce((n,x)=>n+x.length,0);
  const emitText=(id,body)=>{
    objStart[id]=currentOffset();
    parts.push(`${id} 0 obj\n${body}\nendobj\n`);
  };
  const emitBinary=(id,dict,data)=>{
    objStart[id]=currentOffset();
    parts.push(`${id} 0 obj\n${dict}\nstream\n`);
    parts.push(data);
    parts.push('\nendstream\nendobj\n');
  };

  let jpegBinaryParts=[];
  for(let i=0;i<jpeg.length;i+=0x8000){
    jpegBinaryParts.push(String.fromCharCode(...jpeg.subarray(i,Math.min(i+0x8000,jpeg.length))));
  }
  emitBinary(imgObj,
    `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`,
    jpegBinaryParts.join('')
  );
  emitText(fontObj,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  emitText(contentObj,`<< /Length ${contentBody.length} >>\nstream\n${contentBody}\nendstream`);
  emitText(pageObj,
    `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${pageW.toFixed(3)} ${pageH.toFixed(3)}] `+
    `/Resources << /XObject << /Im0 ${imgObj} 0 R >> /Font << /F1 ${fontObj} 0 R >> >> `+
    `/Contents ${contentObj} 0 R >>`
  );
  emitText(pagesObj,`<< /Type /Pages /Count 1 /Kids [${pageObj} 0 R] >>`);
  emitText(catalogObj,`<< /Type /Catalog /Pages ${pagesObj} 0 R >>`);

  const xrefPos=currentOffset();
  const count=7;
  parts.push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for(let i=1;i<count;i++) parts.push(`${String(objStart[i]||0).padStart(10,'0')} 00000 n \n`);
  parts.push(`trailer\n<< /Size ${count} /Root ${catalogObj} 0 R >>\nstartxref\n${xrefPos}\n%%EOF`);
  return parts.join('');
}
async function makePdfDataUrl(canvas,text){
  const jpeg=await jpegBytesFromCanvas(canvas);
  // Browser canvas dimensions are physical pixels; keep them within PDF numeric limits.
  const pdfBinary=makePdf(jpeg,canvas.width,canvas.height,text,1);
  let binary='';const chunk=0x8000;
  for(let i=0;i<pdfBinary.length;i+=chunk) binary+=pdfBinary.slice(i,i+chunk);
  return 'data:application/pdf;base64,'+btoa(binary);
}


async function exportHistory(id,format){
  const record=await historyGet(id);
  const blob=record.png;
  if(format==='png'){
    const url=await blobToDataUrl(blob);
    return {id:await chrome.downloads.download({url,filename:'snapscroll-history.png',saveAs:false,conflictAction:'uniquify'})};
  }
  const bmp=await createImageBitmap(blob);
  const canvas=new OffscreenCanvas(bmp.width,bmp.height);
  const ctx=canvas.getContext('2d',{alpha:false});
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,bmp.width,bmp.height); ctx.drawImage(bmp,0,0); bmp.close();
  if(format==='jpg'){
    const jpg=await canvas.convertToBlob({type:'image/jpeg',quality:.92});
    const url=await blobToDataUrl(jpg);
    return {id:await chrome.downloads.download({url,filename:'snapscroll-history.jpg',saveAs:false,conflictAction:'uniquify'})};
  }
  if(format==='pdf'){
    const url=await makePdfDataUrl(canvas,record.text||[]);
    return {id:await chrome.downloads.download({url,filename:'snapscroll-history.pdf',saveAs:false,conflictAction:'uniquify'})};
  }
  throw new Error('Unknown history export format.');
}

async function exportTab(tabId,format){
  const latest=latestByTab.get(tabId); if(!latest) throw new Error('Capture the page first.');
  const canvas=await stitch(latest);
  let blob,filename;
  if(format==='png'){
    blob=await canvas.convertToBlob({type:'image/png'}); filename='snapscroll-full-page.png';
  }else if(format==='jpg'){
    blob=await canvas.convertToBlob({type:'image/jpeg',quality:.92}); filename='snapscroll-full-page.jpg';
  }else if(format==='pdf'){
    const url=await makePdfDataUrl(canvas,latest.text||[]); filename='snapscroll-full-page.pdf';
    const id=await chrome.downloads.download({url,filename,saveAs:false,conflictAction:'uniquify'}); return {id};
  }else throw new Error('Unknown export format.');
  const url=await blobToDataUrl(blob);
  const id=await chrome.downloads.download({url,filename,saveAs:false,conflictAction:'uniquify'});
  return {id};
}

chrome.runtime.onMessage.addListener((m,s,sendResponse)=>{
  if(m?.type==='CAPTURE_FULL_PAGE'){
    runCapture(m.tabId).then(r=>sendResponse({success:true,...r})).catch(e=>sendResponse({success:false,error:e.message||String(e)}));
    return true;
  }
  if(m?.type==='EXPORT'){
    exportTab(m.tabId,m.format).then(r=>sendResponse({success:true,...r})).catch(e=>sendResponse({success:false,error:e.message||String(e)}));
    return true;
  }
  if(m?.type==='HISTORY_LIST'){
    historyList().then(r=>sendResponse({success:true,items:r})).catch(e=>sendResponse({success:false,error:e.message||String(e)}));
    return true;
  }
  if(m?.type==='HISTORY_EXPORT'){
    exportHistory(m.id,m.format).then(r=>sendResponse({success:true,...r})).catch(e=>sendResponse({success:false,error:e.message||String(e)}));
    return true;
  }
  if(m?.type==='HISTORY_DELETE'){
    historyDelete(m.id).then(()=>sendResponse({success:true})).catch(e=>sendResponse({success:false,error:e.message||String(e)}));
    return true;
  }
});
