/* Optional visual grid. No audio, no changes to the review archive or its exports. */
(function(root){
  'use strict';
  const colors=['#ffb454','#62c9f5','#ba9bff','#83d9a0','#ff829d'];
  const label=(c,r)=>String.fromCharCode(65+c)+(r+1);
  function rectangle(a,b){const out=[];for(let r=Math.min(a.r,b.r);r<=Math.max(a.r,b.r);r++)for(let c=Math.min(a.c,b.c);c<=Math.max(a.c,b.c);c++)out.push(label(c,r));return out;}
  function paint(source,cells,color,erase=false){const out={...source};for(const cell of cells){if(erase)delete out[cell];else out[cell]=color;}return out;}
  function imageBox(rect,width,height,fit='contain'){if(fit==='fill')return {...rect};const scale=fit==='cover'?Math.max(rect.width/width,rect.height/height):Math.min(rect.width/width,rect.height/height),w=width*scale,h=height*scale;return {left:rect.left+(rect.width-w)/2,top:rect.top+(rect.height-h)/2,width:w,height:h};}
  function hit(x,y,box){if(x<box.left||y<box.top||x>=box.left+box.width||y>=box.top+box.height)return null;return {c:Math.min(11,Math.floor((x-box.left)/box.width*12)),r:Math.min(7,Math.floor((y-box.top)/box.height*8))};}
  const model={colors,label,rectangle,paint,imageBox,hit};
  if(typeof module==='object'&&module.exports){module.exports=model;return;}
  root.QublyQuickGrid=model;
  const stage=document.getElementById('stage'),img=document.getElementById('preview'),viewer=document.querySelector('.viewer'),toolbar=document.querySelector('.viewer-toolbar');
  if(!stage||!img||!viewer||!toolbar)return;
  const storageKey='qubly-quick-visual-grid-v1';let enabled=false,color=1,erase=false,stroke=null,queued=false,key='',box=null,selections={};
  try{const data=JSON.parse(localStorage.getItem(storageKey)||'{}');if(data&&typeof data==='object')for(const [name,cells] of Object.entries(data)){selections[name]={};for(const [cell,n] of Object.entries(cells||{}))if(/^[A-L][1-8]$/.test(cell)&&Number.isInteger(n)&&n>=1&&n<=5)selections[name][cell]=n;}}catch{}
  const toggle=document.createElement('button');toggle.id='quickGridToggle';toggle.type='button';toggle.textContent='Griglia';toggle.setAttribute('aria-pressed','false');toggle.setAttribute('aria-label','Mostra griglia colorata');toolbar.insertBefore(toggle,document.getElementById('fullscreen'));
  const controls=document.createElement('div');controls.className='quick-grid-controls';controls.hidden=true;controls.setAttribute('role','group');controls.setAttribute('aria-label','Griglia e cinque colori');
  controls.innerHTML='<span>A–L / 1–8</span>'+colors.map((v,i)=>`<button class="quick-grid-swatch color-${i+1}" data-color="${i+1}" aria-label="Colore ${i+1}" aria-pressed="${i===0}">${i+1}</button>`).join('')+'<button data-erase aria-pressed="false">Gomma</button><button data-clear>Svuota</button><small>Clic o trascina · celle salvate solo su questo browser</small>';
  toolbar.append(controls);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('quick-grid-overlay');svg.setAttribute('viewBox','0 0 1200 800');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-label','Griglia dell’immagine corrente');svg.toggleAttribute('hidden',true);stage.append(svg);
  function save(){try{localStorage.setItem(storageKey,JSON.stringify(selections));}catch{}}
  function content(){
    const cells=selections[key]||{};let s='';
    for(let r=0;r<8;r++)for(let c=0;c<12;c++){const cell=label(c,r),n=cells[cell];s+=`<rect x="${c*100}" y="${r*100}" width="100" height="100" fill="${n?colors[n-1]:'transparent'}" fill-opacity="${n?0.24:0}" stroke="#ffffff90" stroke-width="1" vector-effect="non-scaling-stroke" data-cell="${cell}" role="button" tabindex="0" aria-label="Cella ${cell}${n?' · colore '+n:''}" aria-pressed="${Boolean(n)}"/>`;if(n)s+=`<text class="quick-grid-label" x="${c*100+50}" y="${r*100+58}" text-anchor="middle" pointer-events="none">${cell} · ${n}</text>`;}
    for(let c=0;c<12;c++)s+=`<g class="quick-grid-header" data-col="${c}" role="button" tabindex="0" aria-label="Colonna ${String.fromCharCode(65+c)}"><rect x="${c*100+30}" y="1" width="40" height="29" rx="4"/><text x="${c*100+50}" y="24" text-anchor="middle">${String.fromCharCode(65+c)}</text></g>`;
    for(let r=0;r<8;r++)s+=`<g class="quick-grid-header" data-row="${r}" role="button" tabindex="0" aria-label="Riga ${r+1}"><rect x="1" y="${r*100+35}" width="30" height="30" rx="4"/><text x="16" y="${r*100+59}" text-anchor="middle">${r+1}</text></g>`;
    svg.innerHTML=s;
  }
  function render(){
    const visible=enabled&&!img.hidden&&img.naturalWidth>0&&img.getClientRects().length>0&&!img.closest('[hidden]');svg.toggleAttribute('hidden',!visible);controls.hidden=!enabled||!visible;toolbar.classList.toggle('grid-expanded',visible);toggle.disabled=!img.naturalWidth||img.hidden;
    if(!visible)return;
    const r=img.getBoundingClientRect(),parent=stage.getBoundingClientRect();box=imageBox({left:r.left,top:r.top,width:r.width,height:r.height},img.naturalWidth,img.naturalHeight,getComputedStyle(img).objectFit);
    const next=JSON.stringify([document.getElementById('filename').textContent,img.naturalWidth,img.naturalHeight]);if(next!==key&&stroke){selections[stroke.key]=stroke.before;stroke=null;}key=next;
    Object.assign(svg.style,{left:(box.left-parent.left)+'px',top:(box.top-parent.top)+'px',width:box.width+'px',height:box.height+'px'});content();
  }
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;render();});}
  toggle.addEventListener('click',()=>{enabled=!enabled;toggle.setAttribute('aria-pressed',String(enabled));render();});
  controls.querySelectorAll('[data-color]').forEach(b=>b.addEventListener('click',()=>{color=Number(b.dataset.color);erase=false;for(const c of controls.querySelectorAll('[data-color]'))c.setAttribute('aria-pressed',String(Number(c.dataset.color)===color));controls.querySelector('[data-erase]').setAttribute('aria-pressed','false');}));
  controls.querySelector('[data-erase]').addEventListener('click',e=>{erase=!erase;e.currentTarget.setAttribute('aria-pressed',String(erase));});
  controls.querySelector('[data-clear]').addEventListener('click',()=>{delete selections[key];save();content();});
  function select(cells){const before=selections[key]||{};selections[key]=paint(before,cells,color,erase||cells.every(c=>before[c]===color));save();content();}
  svg.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();const c=e.target.closest('[data-col]'),r=e.target.closest('[data-row]');if(c){select(rectangle({c:Number(c.dataset.col),r:0},{c:Number(c.dataset.col),r:7}));return;}if(r){select(rectangle({c:0,r:Number(r.dataset.row)},{c:11,r:Number(r.dataset.row)}));return;}const start=hit(e.clientX,e.clientY,box);if(!start)return;const before=selections[key]||{};stroke={key,start,before,color,erase:erase||before[label(start.c,start.r)]===color};svg.setPointerCapture(e.pointerId);selections[key]=paint(before,[label(start.c,start.r)],color,stroke.erase);content();});
  svg.addEventListener('pointermove',e=>{if(!stroke)return;const end=hit(e.clientX,e.clientY,box);if(end){selections[stroke.key]=paint(stroke.before,rectangle(stroke.start,end),stroke.color,stroke.erase);content();}});
  svg.addEventListener('pointerup',()=>{if(stroke){stroke=null;save();}});
  svg.addEventListener('pointercancel',()=>{if(stroke){selections[stroke.key]=stroke.before;stroke=null;content();}});
  svg.addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!==' ')return;e.preventDefault();e.stopPropagation();const cell=e.target.closest('[data-cell]'),c=e.target.closest('[data-col]'),r=e.target.closest('[data-row]');if(cell)select([cell.dataset.cell]);else if(c)select(rectangle({c:Number(c.dataset.col),r:0},{c:Number(c.dataset.col),r:7}));else if(r)select(rectangle({c:0,r:Number(r.dataset.row)},{c:11,r:Number(r.dataset.row)}));});
  const observer=new MutationObserver(schedule);observer.observe(img,{attributes:true,attributeFilter:['src','hidden','style','class']});observer.observe(document.getElementById('workspace'),{attributes:true,attributeFilter:['hidden']});img.addEventListener('load',schedule);new ResizeObserver(schedule).observe(stage);addEventListener('resize',schedule);document.addEventListener('fullscreenchange',schedule);schedule();
})(typeof window!=='undefined'?window:globalThis);
