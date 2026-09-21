/* IDEAS Data Portal — vanilla JS, no dependencies. Renders from metadata.json. */
"use strict";
const $ = (s, r=document) => r.querySelector(s);
const el = (t, a={}, kids=[]) => {
  const n = document.createElement(t);
  for (const k in a){
    if (k === "class") n.className = a[k];
    else if (k === "html") n.innerHTML = a[k];
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), a[k]);
    else if (a[k] !== null && a[k] !== undefined) n.setAttribute(k, a[k]);
  }
  (Array.isArray(kids)?kids:[kids]).forEach(c => c!=null && n.append(c.nodeType?c:document.createTextNode(c)));
  return n;
};
const esc = s => String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const fmt = n => n==null?"":n.toLocaleString();
const isEmpty = v => v==null || v==="";

// ---- table categorisation (for colours / ERD grouping) ----
const CAT = {
  idea_protein:"entity", idea_mutant:"entity", idea_reactant:"entity", idea_reaction:"entity",
  idea_stoichiometry:"entity", idea_experiment:"entity", idea_sample:"entity",
  idea_strain:"entity", idea_measurement:"measure", protein_parameter:"measure",
  sample_parameter:"measure", protein_comparison:"measure",
  sample_protein:"link", sample_reactant:"link", sample_reaction:"link",
  idea_lab:"prov", idea_people:"prov", idea_procedure:"prov", idea_protocol:"prov",
  ai_design:"opt", computation:"opt", idea_dbxref:"opt",
};
const CATCOLOR = {entity:"var(--c-entity)",measure:"var(--c-measure)",link:"var(--c-link)",prov:"var(--c-prov)",opt:"var(--c-opt)"};
const CATLABEL = {entity:"Entity",measure:"Measurement",link:"Link / junction",prov:"Provenance",opt:"Optional / platform"};
const catOf = t => CAT[t] || "entity";

const DBURL = {
  PubChem: a=>`https://pubchem.ncbi.nlm.nih.gov/compound/${a}`,
  ChEBI:  a=>`https://www.ebi.ac.uk/chebi/searchId.do?chebiId=${a}`,
  PDB:    a=>`https://www.rcsb.org/structure/${a}`,
  UniProt:a=>`https://www.uniprot.org/uniprotkb/${a}`,
  NCBI_Protein:a=>`https://www.ncbi.nlm.nih.gov/protein/${a}`,
  KEGG:   a=>`https://www.genome.jp/dbget-bin/www_bget/${a}`,
  MetaCyc:a=>`https://metacyc.org/compound?orgid=META&id=${a}`,
};

let M = null;          // metadata
let TBL = {};          // name -> table object

const VIEWS = [
  ["overview","Overview"], ["schema","Schema & ERD"], ["tables","Tables"],
  ["dict","Data Dictionary"], ["rel","Relationships"], ["onto","Ontologies & Units"],
  ["quality","Data Quality"], ["download","Download"],
];

/* =============================================================== boot */
fetch("metadata.json").then(r=>r.json()).then(m=>{
  M = m; m.tables.forEach(t=>TBL[t.name]=t);
  buildNav(); route();
  window.addEventListener("hashchange", route);
}).catch(e=>{ $("#app").innerHTML = `<div class="loading">Failed to load metadata.json — ${esc(e)}</div>`; });

// theme
(function(){
  const btn=$("#theme"); const KEY="ideas_theme";
  try{ const s=localStorage.getItem(KEY); if(s) document.documentElement.setAttribute("data-theme",s);}catch(e){}
  btn.addEventListener("click",()=>{
    const cur=document.documentElement.getAttribute("data-theme");
    const dark=cur? cur==="dark" : matchMedia("(prefers-color-scheme:dark)").matches;
    const next=dark?"light":"dark";
    document.documentElement.setAttribute("data-theme",next);
    try{localStorage.setItem(KEY,next);}catch(e){}
    if($(".view.on")&&$(".view.on").id==="view-schema") drawERD();
  });
})();

function buildNav(){
  const nav=$("#nav");
  VIEWS.forEach(([id,label])=>nav.append(el("button",{id:"nav-"+id,onclick:()=>go(id)},label)));
}
function go(id){ location.hash = id; }
function route(){
  const id = (location.hash.slice(1).split("/")[0]) || "overview";
  const arg = location.hash.slice(1).split("/")[1];
  VIEWS.forEach(([v])=>{ const b=$("#nav-"+v); if(b) b.classList.toggle("on",v===id); });
  const app=$("#app"); app.innerHTML="";
  const view = el("section",{class:"view on",id:"view-"+id});
  app.append(view);
  ({overview:renderOverview,schema:renderSchema,tables:renderTables,dict:renderDict,
    rel:renderRel,onto:renderOnto,quality:renderQuality,download:renderDownload}[id]||renderOverview)(view,arg);
  window.scrollTo(0,0);
}

/* =============================================================== reusable sortable table */
function sortableTable(columns, rows, opts={}){
  // columns: [{key,label,num?,render?,cls?}]
  const state={sort:opts.sort||null, dir:opts.dir||1, q:""};
  const wrap=el("div");
  const controls=el("div",{class:"controls"});
  const search=el("div",{class:"search",html:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>'});
  const input=el("input",{type:"search",placeholder:opts.placeholder||"Search…","aria-label":"Search"});
  search.append(input); controls.append(search);
  (opts.filters||[]).forEach(f=>controls.append(f.node));
  const count=el("span",{class:"count"});
  controls.append(count);
  if(opts.exportName){
    controls.append(el("button",{class:"btn",onclick:()=>exportCSV(columns,filtered(),opts.exportName)},"⤓ CSV"));
  }
  wrap.append(controls);
  const tw=el("div",{class:"tablewrap"});
  const table=el("table",{class:"grid"});
  const thead=el("thead"); const tr=el("tr");
  columns.forEach(c=>{
    const th=el("th",{html:esc(c.label)+' <span class="arr"></span>'});
    if(c.num) th.style.textAlign="right";
    th.addEventListener("click",()=>{ if(state.sort===c.key)state.dir*=-1; else{state.sort=c.key;state.dir=1;} render(); });
    c._th=th; tr.append(th);
  });
  thead.append(tr); table.append(thead);
  const tbody=el("tbody"); table.append(tbody);
  tw.append(table); wrap.append(tw);

  function filtered(){
    let r=rows;
    const q=state.q.trim().toLowerCase();
    if(q) r=r.filter(row=>columns.some(c=>String(c.raw?c.raw(row):row[c.key]??"").toLowerCase().includes(q)));
    if(opts.extraFilter) r=r.filter(opts.extraFilter);
    if(state.sort){
      const c=columns.find(x=>x.key===state.sort);
      r=r.slice().sort((a,b)=>{
        let va=c.raw?c.raw(a):a[state.sort], vb=c.raw?c.raw(b):b[state.sort];
        if(c.num){va=parseFloat(va);vb=parseFloat(vb); if(isNaN(va))va=-Infinity; if(isNaN(vb))vb=-Infinity;}
        else {va=String(va??"").toLowerCase();vb=String(vb??"").toLowerCase();}
        return va<vb?-1*state.dir:va>vb?1*state.dir:0;
      });
    }
    return r;
  }
  function render(){
    columns.forEach(c=>{c._th.querySelector(".arr").textContent = state.sort===c.key?(state.dir>0?"▲":"▼"):"";});
    const r=filtered();
    count.textContent = `${fmt(r.length)}${r.length!==rows.length?" of "+fmt(rows.length):""} rows`;
    tbody.innerHTML="";
    const cap=opts.limit||2000;
    r.slice(0,cap).forEach(row=>{
      const trr=el("tr");
      columns.forEach(c=>{
        const td=el("td",{class:(c.num?"num ":"")+(c.cls||"")});
        const v=c.render?c.render(row):row[c.key];
        if(v==null||v==="") td.innerHTML='<span class="empty-cell">—</span>';
        else if(v.nodeType) td.append(v);
        else td.innerHTML = c.html? v : esc(v);
        trr.append(td);
      });
      tbody.append(trr);
    });
    if(r.length>cap) tbody.append(el("tr",{},el("td",{colspan:columns.length,class:"muted",style:"padding:.6rem;text-align:center"},`Showing first ${cap} of ${fmt(r.length)} rows — refine your search.`)));
  }
  input.addEventListener("input",()=>{state.q=input.value;render();});
  state.rerender=render;
  render();
  wrap._rerender=render;
  return wrap;
}
function exportCSV(columns,rows,name){
  const head=columns.map(c=>c.label).join(",");
  const body=rows.map(r=>columns.map(c=>{
    let v=c.raw?c.raw(r):(c.render&&!c.html?"":r[c.key]);
    v=String(v==null?"":v).replace(/"/g,'""');
    return /[",\n]/.test(v)?`"${v}"`:v;
  }).join(",")).join("\n");
  const blob=new Blob([head+"\n"+body],{type:"text/csv"});
  const a=el("a",{href:URL.createObjectURL(blob),download:name}); document.body.append(a); a.click(); a.remove();
}
function selectFilter(label, values, onchange){
  const s=el("select",{"aria-label":label});
  s.append(el("option",{value:""},label));
  values.forEach(v=>s.append(el("option",{value:v},v)));
  s.addEventListener("change",()=>onchange(s.value));
  return {node:s, get:()=>s.value, el:s};
}

/* =============================================================== Overview */
function renderOverview(v){
  const hero=el("div",{class:"card"});
  hero.append(el("div",{class:"hero"},[
    el("div",{class:"txt"},[
      el("div",{class:"kicker"},"IDEAS · Interoperable Design of Extreme-scale Application Software"),
      el("h1",{},"Enzyme-engineering dataset for AI-guided amide synthesis"),
      el("p",{class:"lead"},"A tight, fully-relational schema capturing every data element behind the IDEAS publication on AI-guided enzyme engineering — nylon / N66 activity and diad / triad / tetrad amide (oligoamide) synthesis. Explore the tables, fields, relationships, controlled vocabularies and data quality, and download the whole database as a single SQL dump."),
      el("div",{class:"legend",style:"margin-top:.8rem"},
        Object.keys(CATLABEL).map(k=>el("span",{},[el("span",{class:"dot",style:`background:${CATCOLOR[k]}`}),CATLABEL[k]]))
      ),
    ]),
  ]));

  const tiles=el("div",{class:"tiles"});
  const stat=(n,l,s)=>el("div",{class:"tile"},[el("div",{class:"n"},fmt(n)),el("div",{class:"l"},l),s?el("div",{class:"s"},s):null]);
  const rel=M.relationships;
  tiles.append(
    stat(M.n_tables,"Tables",`${M.n_populated} populated`),
    stat(M.total_rows,"Data rows","pilot release"),
    stat(M.total_columns,"Columns","across all tables"),
    stat(rel.length,"Relationships",`${rel.filter(r=>r.status==="declared").length} declared · ${rel.filter(r=>r.status==="inferred").length} inferred`),
    stat(Object.keys(M.dbxref_summary).length,"Cross-ref DBs","PubChem, PDB, UniProt…"),
    stat(Object.keys(M.units_used).length,"Distinct units","mg/L, mM, %, …"),
  );

  const about=el("div",{class:"card"});
  about.innerHTML = `<h3 style="margin-top:0">About this dataset</h3>
   <p class="ink2" style="max-width:74ch">This is the <b>IDEAS lakehouse tenant</b> minimal typed schema, derived from the <code>v9</code> prototype and prepared to support a JACS publication (Zenodo deposit, <code>ja-2026-03464t</code>). It records the enzymes and engineered variants studied, the substrates and synthesized products, the reactions and their stoichiometry, the assay samples/replicates, and every measured value — titers, mass-spec intensities, conversion percentages and fold-change-to-wild-type.</p>
   <div class="legend"><span><span class="dot" style="background:var(--good)"></span>715 pilot rows · zero-orphan FK backbone (design)</span>
   <span><span class="dot" style="background:var(--warn)"></span>${M.findings.filter(f=>f.severity==="warning").length} consistency notes flagged (see Data Quality)</span></div>`;

  // file inventory
  const inv=el("div",{class:"card"});
  inv.append(el("h3",{style:"margin-top:0"},"Source file inventory"));
  inv.append(el("p",{class:"muted",style:"margin-top:0"},`${M.files.length} files in ${esc(M.source_dir)}`));
  const cols=[
    {key:"name",label:"File",cls:"mono"},
    {key:"kind",label:"Type",render:r=>{const e=r.name.split(".").pop();return {parquet:"Parquet data",sql:"SQL schema",json:"JSON metadata",md:"Documentation",txt:"README"}[e]||e;}, raw:r=>r.name.split(".").pop()},
    {key:"bytes",label:"Size",num:true,render:r=>human(r.bytes),raw:r=>r.bytes},
    {key:"rows",label:"Rows",num:true,render:r=>{const t=r.name.endsWith(".parquet")?TBL[r.name.slice(0,-8)]:null;return t?fmt(t.nrows):"";},raw:r=>{const t=r.name.endsWith(".parquet")?TBL[r.name.slice(0,-8)]:null;return t?t.nrows:-1;}},
  ];
  inv.append(sortableTable(cols, M.files, {placeholder:"Filter files…", sort:"name"}));

  v.append(hero,tiles,about,inv);
}
function human(b){ if(b<1024)return b+" B"; if(b<1048576)return (b/1024).toFixed(1)+" KB"; return (b/1048576).toFixed(1)+" MB"; }

/* =============================================================== Schema & ERD */
const NS="http://www.w3.org/2000/svg";
function svgEl(tag,attrs){ const n=document.createElementNS(NS,tag); if(attrs)for(const k in attrs)n.setAttribute(k,attrs[k]); return n; }
// intended type -> short label
function typeShort(dt){
  const m=/\/\s*(.+?)\s*\(intended\)/.exec(dt||"");
  let t=m?m[1]:"";
  if(!t||t==="n/a") return "text";
  return ({TEXT:"text",INTEGER:"int",REAL:"real",NUMERIC:"num",BOOLEAN:"bool",DATE:"date",DATETIME:"datetime",TIMESTAMP:"timestamp"})[t.toUpperCase()] || t.toLowerCase();
}

function renderSchema(v){
  v.append(el("h2",{},"Schema & entity-relationship diagram"));
  v.append(el("p",{class:"sec-intro"},"A field-level ER diagram (dbdiagram.io style): every table lists its columns with primary-key / foreign-key markers and intended types, and each relationship is drawn from the exact foreign-key field to the primary key it references. Arrows point to the referenced key. Drag any table to rearrange it; scroll to pan (Ctrl/⌘ + scroll to zoom); click a table to spotlight its connections."));

  const legend=el("div",{class:"legend"},[
    el("span",{},[el("span",{class:"swatch k pk"},"PK"),"primary key"]),
    el("span",{},[el("span",{class:"swatch k fk"},"FK"),"foreign key"]),
    el("span",{},[el("span",{class:"swatch",style:"background:var(--good)"}),"declared FK (in DDL)"]),
    el("span",{},[el("span",{class:"swatch",style:"background:var(--accent)"}),"inferred FK (naming + 100% value match)"]),
    el("span",{},[el("span",{class:"swatch",style:"background:var(--warn)"}),"uncertain FK (unvalidated / orphaned)"]),
  ]);

  const toolbar=el("div",{class:"erd-toolbar"},[
    el("button",{id:"erd-zout",title:"Zoom out"},"−"),
    el("span",{class:"zlabel",id:"erd-zlabel"},"100%"),
    el("button",{id:"erd-zin",title:"Zoom in"},"+"),
    el("button",{id:"erd-fit",title:"Fit width"},"Fit"),
    el("button",{id:"erd-reset",title:"Reset layout & zoom"},"Reset"),
    el("button",{id:"erd-taller",title:"Make the canvas taller"},"⤢ Taller"),
    el("button",{id:"erd-defsize",title:"Reset canvas size"},"Default size"),
    el("span",{class:"hint"},"drag any table to move · scroll to pan · Ctrl/⌘+scroll to zoom · drag ⋰ bottom-right corner to resize"),
  ]);
  const scroll=el("div",{class:"erd-scroll",id:"erdhost"});
  const card=el("div",{class:"card"});
  card.append(legend,toolbar,scroll);
  v.append(card);

  // adjustable canvas: restore saved size, persist on resize, quick controls
  const SZKEY="ideas_erd_size";
  try{ const s=JSON.parse(localStorage.getItem(SZKEY)||"null"); if(s&&s.h) scroll.style.height=s.h+"px"; if(s&&s.w) scroll.style.width=s.w+"px"; }catch(e){}
  try{
    if(typeof ResizeObserver!=="undefined"){
      let tmr; const ro=new ResizeObserver(()=>{ clearTimeout(tmr); tmr=setTimeout(()=>{
        try{ localStorage.setItem(SZKEY,JSON.stringify({h:Math.round(scroll.clientHeight),w:Math.round(scroll.clientWidth)})); }catch(e){}
      },250); }); ro.observe(scroll);
    }
  }catch(e){}
  const btnTaller=$("#erd-taller"), btnDef=$("#erd-defsize");
  if(btnTaller) btnTaller.addEventListener("click",()=>{
    const h=Math.round((scroll.clientHeight||600)*1.35);
    scroll.style.height=h+"px";
    try{ localStorage.setItem(SZKEY,JSON.stringify({h,w:Math.round(scroll.clientWidth)})); }catch(e){}
  });
  if(btnDef) btnDef.addEventListener("click",()=>{
    scroll.style.height=""; scroll.style.width="";
    try{ localStorage.removeItem(SZKEY); }catch(e){}
  });

  // Mermaid reference
  const src=el("div",{class:"card"});
  src.append(el("h3",{style:"margin-top:0"},"Mermaid ER definition (from SCHEMA_DESIGN.md)"));
  src.append(el("pre",{},"erDiagram"+"\n"+M.erd_mermaid.replace(/^erDiagram/,"").trim()));
  v.append(src);

  drawERD();
}

function drawERD(){
  const host=$("#erdhost"); if(!host) return;
  host.innerHTML="";

  /* ---- geometry ---- */
  const RH=22, HH=28, TW=232, GUT=46, PAD=40, HGAP=140, VGAP=40;
  const colBy=t=>catOf(t);

  // build per-table field model
  const model={}; // name -> {fields:[{name,pk,fk,type}], idx:{field->i}, cat}
  M.tables.forEach(t=>{
    const meta={}; (t.col_meta||[]).forEach(c=>meta[c.field_name]=c);
    const fields=t.columns.map(c=>{
      const m=meta[c]||{};
      return {name:c, pk:m.is_primary_key==="yes", fk:m.is_foreign_key==="yes", type:typeShort(m.data_type)};
    });
    const idx={}; t.columns.forEach((c,i)=>idx[c]=i);
    model[t.name]={fields, idx, cat:colBy(t.name), nrows:t.nrows, desc:t.desc||t.name};
  });

  /* ---- layout: category columns, stacked ---- */
  const order=["measure","link","entity","prov","opt"];
  const byCat={}; order.forEach(o=>byCat[o]=[]);
  M.tables.forEach(t=>byCat[colBy(t.name)].push(t.name));
  const L={}; // name -> {x,y,w,h}
  let x=PAD, contentH=0;
  order.forEach(o=>{
    let y=PAD;
    byCat[o].forEach(name=>{
      const h=HH + model[name].fields.length*RH + 6;
      L[name]={x, y, w:TW, h};
      y += h + VGAP;
    });
    contentH=Math.max(contentH, y);
    if(byCat[o].length) x += TW + HGAP;
  });
  const contentW = x - HGAP + PAD;
  contentH += PAD - VGAP;

  /* ---- svg scaffold ---- */
  const svg=svgEl("svg",{id:"erd",viewBox:`0 0 ${contentW} ${contentH}`});
  svg.innerHTML=`<defs>
    <marker id="ah-d" markerWidth="9" markerHeight="9" refX="7.5" refY="3.5" orient="auto"><path d="M0 0 L7.5 3.5 L0 7 z" fill="var(--good)"/></marker>
    <marker id="ah-i" markerWidth="9" markerHeight="9" refX="7.5" refY="3.5" orient="auto"><path d="M0 0 L7.5 3.5 L0 7 z" fill="var(--accent)"/></marker>
    <marker id="ah-u" markerWidth="9" markerHeight="9" refX="7.5" refY="3.5" orient="auto"><path d="M0 0 L7.5 3.5 L0 7 z" fill="var(--warn)"/></marker>
  </defs>`;
  const gEdges=svgEl("g",{class:"edges"});
  const gNodes=svgEl("g",{class:"nodes"});
  svg.append(gEdges,gNodes);

  const anchorY=(name,fi)=>L[name].y + HH + (fi+0.5)*RH;
  const AH={declared:"url(#ah-d)",inferred:"url(#ah-i)",uncertain:"url(#ah-u)"};

  /* ---- edges (field-level) ---- */
  const edges=[];
  M.relationships.forEach(r=>{
    const cN=r.child_table, pN=r.parent_table;
    if(!L[cN]||!L[pN]) return;
    const cIdx=model[cN].idx[r.child_field], pIdx=model[pN].idx[r.parent_field];
    if(cIdx==null||pIdx==null) return;
    const self=(cN===pN);
    const path=svgEl("path",{class:`erd-edge ${r.status}`,"marker-end":AH[r.status]||"url(#ah-i)"});
    path.append(mkTitle(`${cN}.${r.child_field} → ${pN}.${r.parent_field}  ·  ${r.status}${r.coverage_percent!=null?` · ${r.coverage_percent}% coverage`:""}${r.orphans?` · ${r.orphans} orphan(s)`:""}`));
    const dot=svgEl("circle",{class:`erd-dot ${r.status}`,r:3});
    dot.style.fill=({declared:"var(--good)",inferred:"var(--accent)",uncertain:"var(--warn)"})[r.status]||"var(--accent)";
    gEdges.append(path); gEdges.append(dot);
    edges.push({path,dot,cN,pN,cIdx,pIdx,self,status:r.status});
  });

  function edgeGeom(e){
    const cL=L[e.cN], pL=L[e.pN];
    const y1=anchorY(e.cN,e.cIdx), y2=anchorY(e.pN,e.pIdx);
    let s1,s2,x1,x2;
    if(e.self){ s1="r"; s2="r"; x1=cL.x+TW; x2=pL.x+TW; }
    else if((pL.x+TW/2) >= (cL.x+TW/2)){ s1="r"; s2="l"; x1=cL.x+TW; x2=pL.x; }
    else { s1="l"; s2="r"; x1=cL.x; x2=pL.x+TW; }
    const k=Math.max(36, Math.abs(x2-x1)*0.42) + (e.self?24:0);
    const c1x=s1==="r"?x1+k:x1-k, c2x=s2==="r"?x2+k:x2-k;
    return {x1,y1,x2,y2,c1x,c2x};
  }
  function updateEdges(){
    edges.forEach(e=>{
      const g=edgeGeom(e);
      e.path.setAttribute("d",`M ${g.x1} ${g.y1} C ${g.c1x} ${g.y1}, ${g.c2x} ${g.y2}, ${g.x2} ${g.y2}`);
      e.dot.setAttribute("cx",g.x1); e.dot.setAttribute("cy",g.y1);
    });
  }

  /* ---- nodes (table boxes with fields) ---- */
  const nodeG={};
  M.tables.forEach(t=>{
    const name=t.name, m=model[name], P=L[name];
    const g=svgEl("g",{class:"erd-tbl","data-t":name,transform:`translate(${P.x},${P.y})`});
    // body
    const body=svgEl("rect",{class:"tbl-body",x:0,y:0,width:TW,height:P.h,rx:9});
    if(m.nrows===0){ body.setAttribute("stroke-dasharray","5 3"); }
    g.append(body);
    // row backgrounds
    m.fields.forEach((f,i)=>{
      const rb=svgEl("rect",{class:"rowbg"+((f.pk||f.fk)?" key":(i%2?" alt":"")),x:1,y:HH+i*RH,width:TW-2,height:RH});
      g.append(rb);
    });
    // header (rounded top only)
    const head=svgEl("g",{class:"tbl-head"});
    const hp=svgEl("path",{d:`M0 ${HH} L0 9 Q0 0 9 0 L ${TW-9} 0 Q ${TW} 0 ${TW} 9 L ${TW} ${HH} Z`});
    hp.style.fill=CATCOLOR[m.cat];
    head.append(hp);
    head.append(Object.assign(svgEl("text",{x:11,y:19}),{textContent:name}));
    const cnt=svgEl("text",{class:"cnt",x:TW-9,y:19,"text-anchor":"end"}); cnt.textContent=`${m.nrows}`;
    head.append(cnt);
    head.append(mkTitle(`${name} — ${m.desc}`));
    g.append(head);
    // fields
    m.fields.forEach((f,i)=>{
      const y=HH+i*RH;
      const yc=y+RH-6;
      if(f.pk){ const b=svgEl("text",{class:"badge pk",x:8,y:yc}); b.textContent="PK"; g.append(b); }
      if(f.fk){ const b=svgEl("text",{class:"badge fk",x:f.pk?26:8,y:yc}); b.textContent="FK"; g.append(b); }
      const nm=svgEl("text",{class:"fname",x:GUT,y:yc}); nm.textContent=f.name;
      if(f.pk) nm.style.textDecoration="underline";
      g.append(nm);
      const ty=svgEl("text",{class:"ftype",x:TW-10,y:yc,"text-anchor":"end"}); ty.textContent=f.type;
      g.append(ty);
      // separators between rows
      if(i>0){ const s=svgEl("line",{class:"rowsep",x1:1,y1:y,x2:TW-1,y2:y}); g.append(s); }
    });
    gNodes.append(g);
    nodeG[name]=g;

    // drag anywhere on the table to move it; a click without movement spotlights
    let dragging=false, moved=false, sx=0, sy=0, ox=0, oy=0;
    g.addEventListener("pointerdown",(ev)=>{
      ev.stopPropagation(); dragging=true; moved=false;
      sx=ev.clientX; sy=ev.clientY; ox=P.x; oy=P.y;
      g.classList.add("grabbing"); gNodes.appendChild(g); // raise above siblings
      try{ g.setPointerCapture(ev.pointerId); }catch(e){}
    });
    g.addEventListener("pointermove",(ev)=>{
      if(!dragging) return;
      const dx=(ev.clientX-sx)/state.zoom, dy=(ev.clientY-sy)/state.zoom;
      if(Math.abs(ev.clientX-sx)+Math.abs(ev.clientY-sy)>3) moved=true;
      P.x=ox+dx; P.y=oy+dy;
      g.setAttribute("transform",`translate(${P.x},${P.y})`);
      updateEdges();
    });
    const endDrag=(ev)=>{
      if(!dragging) return; dragging=false; g.classList.remove("grabbing");
      try{ g.releasePointerCapture(ev.pointerId); }catch(e){}
      if(!moved) spotlight(spotName===name?null:name);
    };
    g.addEventListener("pointerup",endDrag);
    g.addEventListener("pointercancel",endDrag);
  });

  updateEdges();
  host.append(svg);

  /* ---- spotlight ---- */
  let spotName=null;
  function spotlight(t){
    spotName=t;
    if(!t){
      Object.values(nodeG).forEach(n=>n.classList.remove("dim","focus"));
      edges.forEach(e=>{ e.path.classList.remove("dim","hot"); e.dot.classList.remove("dim"); });
      return;
    }
    const near=new Set([t]);
    edges.forEach(e=>{ if(e.cN===t)near.add(e.pN); if(e.pN===t)near.add(e.cN); });
    Object.entries(nodeG).forEach(([n,g])=>{ g.classList.toggle("dim",!near.has(n)); g.classList.toggle("focus",n===t); });
    edges.forEach(e=>{
      const on=(e.cN===t||e.pN===t);
      e.path.classList.toggle("dim",!on); e.path.classList.toggle("hot",on);
      e.dot.classList.toggle("dim",!on);
    });
  }

  /* ---- zoom / pan ---- */
  const state={zoom:1};
  const zlabel=$("#erd-zlabel");
  function applyZoom(){
    svg.style.width=(contentW*state.zoom)+"px";
    svg.style.height=(contentH*state.zoom)+"px";
    if(zlabel) zlabel.textContent=Math.round(state.zoom*100)+"%";
  }
  function setZoom(z,cx,cy){
    z=Math.max(0.3,Math.min(2,z));
    const prev=state.zoom;
    // keep point under cursor stable
    const sl=host.scrollLeft, st=host.scrollTop;
    const px=(cx==null?host.clientWidth/2:cx)+sl, py=(cy==null?host.clientHeight/2:cy)+st;
    state.zoom=z; applyZoom();
    const f=z/prev;
    host.scrollLeft = px*f - (cx==null?host.clientWidth/2:cx);
    host.scrollTop  = py*f - (cy==null?host.clientHeight/2:cy);
  }
  function fit(){
    const avail=(host.clientWidth||contentW)-20;
    setZoomAbs(Math.max(0.3,Math.min(1.4, avail/contentW)));
    host.scrollLeft=0; host.scrollTop=0;
  }
  function setZoomAbs(z){ state.zoom=Math.max(0.3,Math.min(2,z)); applyZoom(); }
  applyZoom();

  const zin=$("#erd-zin"), zout=$("#erd-zout"), fitb=$("#erd-fit"), rst=$("#erd-reset");
  if(zin) zin.addEventListener("click",()=>setZoom(state.zoom*1.2));
  if(zout) zout.addEventListener("click",()=>setZoom(state.zoom/1.2));
  if(fitb) fitb.addEventListener("click",fit);
  if(rst) rst.addEventListener("click",()=>{ spotlight(null); drawERD(); });

  // Ctrl/⌘ + wheel to zoom (otherwise native scroll-pan)
  host.addEventListener("wheel",(ev)=>{
    if(!(ev.ctrlKey||ev.metaKey)) return;
    ev.preventDefault();
    const rect=host.getBoundingClientRect();
    setZoom(state.zoom*(ev.deltaY<0?1.1:1/1.1), ev.clientX-rect.left, ev.clientY-rect.top);
  },{passive:false});

  // background drag = pan
  let panning=false, psx=0, psy=0, psl=0, pst=0;
  host.addEventListener("pointerdown",(ev)=>{
    if(ev.target.closest && ev.target.closest(".erd-tbl")) return;
    panning=true; host.classList.add("panning");
    psx=ev.clientX; psy=ev.clientY; psl=host.scrollLeft; pst=host.scrollTop;
  });
  host.addEventListener("pointermove",(ev)=>{
    if(!panning) return;
    host.scrollLeft=psl-(ev.clientX-psx); host.scrollTop=pst-(ev.clientY-psy);
  });
  const endPan=()=>{ panning=false; host.classList.remove("panning"); };
  host.addEventListener("pointerup",endPan);
  host.addEventListener("pointerleave",endPan);
  // click empty space clears spotlight
  host.addEventListener("click",(ev)=>{ if(!(ev.target.closest&&ev.target.closest(".erd-tbl"))) spotlight(null); });

  // fit on first paint
  requestAnimationFrame(()=>{ if(host.clientWidth) fit(); });
}
function mkTitle(txt){ const t=document.createElementNS("http://www.w3.org/2000/svg","title"); t.textContent=txt; return t; }

/* =============================================================== Tables */
function renderTables(v,arg){
  if(arg && TBL[arg]) return renderTableDetail(v,arg);
  v.append(el("h2",{},"Tables"));
  v.append(el("p",{class:"sec-intro"},"Every table in the dataset, with its row/column counts and metadata completeness. Click a table to see its full column definitions and browse the actual data (searchable and sortable)."));
  const grid=el("div",{class:"tlist"});
  const controls=el("div",{class:"controls"});
  const search=el("div",{class:"search",html:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>'});
  const input=el("input",{type:"search",placeholder:"Search tables…"});
  search.append(input); controls.append(search);
  let cat="";
  controls.append(selectFilter("All categories",Object.keys(CATLABEL).map(k=>CATLABEL[k]),val=>{cat=val;draw();}).node);
  const cnt=el("span",{class:"count"}); controls.append(cnt);
  v.append(controls,grid);
  function draw(){
    const q=input.value.toLowerCase();
    const list=M.tables.filter(t=>(!q||t.name.includes(q)||(t.desc||"").toLowerCase().includes(q))
       && (!cat||CATLABEL[catOf(t.name)]===cat));
    cnt.textContent=`${list.length} of ${M.tables.length} tables`;
    grid.innerHTML="";
    list.sort((a,b)=>b.nrows-a.nrows).forEach(t=>{
      const c=el("div",{class:"tcard",onclick:()=>go("tables/"+t.name)});
      c.style.borderLeftColor=CATCOLOR[catOf(t.name)];
      c.append(el("h4",{},[t.name, t.nrows===0?el("span",{class:"pill info"},"empty"):null]));
      c.append(el("p",{},t.desc||"—"));
      c.append(el("div",{class:"foot"},[
        el("span",{},`${fmt(t.nrows)} rows`), el("span",{},`${t.ncols} cols`),
        el("span",{class:"meter mini",title:`${t.completeness}% filled`},el("i",{style:`width:${t.completeness}%;background:${completenessColor(t.completeness)}`})),
      ]));
      grid.append(c);
    });
  }
  input.addEventListener("input",draw); draw();
}
function completenessColor(p){ return p>=80?"var(--good)":p>=50?"var(--warn)":"var(--crit)"; }

function renderTableDetail(v,name){
  const t=TBL[name];
  v.append(el("button",{class:"backlink",onclick:()=>go("tables")},"← All tables"));
  const head=el("div",{class:"card"});
  head.append(el("h2",{style:"font-family:var(--mono);display:flex;align-items:center;gap:.5rem;flex-wrap:wrap"},
     [name, el("span",{class:"pill",style:`background:transparent;color:${CATCOLOR[catOf(name)]};border:1px solid ${CATCOLOR[catOf(name)]}`},CATLABEL[catOf(name)])]));
  head.append(el("p",{class:"ink2",style:"max-width:78ch"},t.desc||""));
  const dl=el("dl",{class:"kv"});
  const add=(k,val)=>{dl.append(el("dt",{},k),el("dd",{},val));};
  add("Rows",fmt(t.nrows)); add("Columns",String(t.ncols));
  add("Metadata completeness", el("span",{},[el("span",{class:"meter mini"},el("i",{style:`width:${t.completeness}%;background:${completenessColor(t.completeness)}`}))," "+t.completeness+"%"]));
  const outFk=M.relationships.filter(r=>r.child_table===name);
  const inFk=M.relationships.filter(r=>r.parent_table===name);
  if(outFk.length) add("References", el("span",{},outFk.map(r=>el("a",{href:"#tables/"+r.parent_table,class:"tag",style:"margin:1px",title:r.status},`${r.child_field}→${r.parent_table}`))));
  if(inFk.length) add("Referenced by", el("span",{},inFk.map(r=>el("a",{href:"#tables/"+r.child_table,class:"tag",style:"margin:1px"},`${r.child_table}.${r.child_field}`))));
  head.append(dl);
  v.append(head);

  // columns definition
  v.append(el("h3",{},"Columns"));
  const cm=t.col_meta;
  const ccols=[
    {key:"field_name",label:"Field",cls:"mono",render:r=>{
      const b=[r.field_name];
      if(r.is_primary_key) b.push(" ",el("span",{class:"pill declared",title:"primary key"},"PK"));
      if(r.is_foreign_key) b.push(" ",el("span",{class:"pill inferred",title:"foreign key"},"FK"));
      return el("span",{},b);
    },raw:r=>r.field_name},
    {key:"role",label:"Role",render:r=>el("span",{class:"role"},r.role)},
    {key:"data_type",label:"Type",cls:"mono",render:r=>r.data_type.replace(" (source) / "," → ").replace(" (intended)","")},
    {key:"foreign",label:"References",render:r=>r.is_foreign_key?el("a",{href:"#tables/"+r.foreign_table,class:"tag"},`${r.foreign_table}.${r.foreign_field}`):"",raw:r=>r.foreign_table||""},
    {key:"unique_count",label:"Distinct",num:true},
    {key:"missing_percent",label:"Missing %",num:true,render:r=>r.missing_percent+"%",raw:r=>r.missing_percent},
    {key:"ontology",label:"Ontology / vocab",render:r=>r.ontology||(r.controlled_vocabulary?"enum: "+r.controlled_vocabulary:"")},
    {key:"description",label:"Description",render:r=>el("span",{class:"ink2"},r.description||"")},
  ];
  v.append(sortableTable(ccols,cm,{placeholder:"Search columns…",sort:null,exportName:name+"_columns.csv"}));

  // data browser
  v.append(el("h3",{},"Data"));
  if(t.nrows===0){ v.append(el("p",{class:"muted"},"This table has no rows in the current release.")); return; }
  const cols=t.columns.map((c,i)=>({key:c,label:c,cls:/id$|_at$|sequence|url|smiles|inchi/i.test(c)?"mono":"",
     render:r=>r[i], raw:r=>r[i], num: t.col_meta.find(m=>m.field_name===c)?.is_numeric}));
  v.append(sortableTable(cols,t.rows,{placeholder:`Search ${fmt(t.nrows)} rows…`,limit:1000,exportName:name+".csv"}));
}

/* =============================================================== Data Dictionary */
function renderDict(v){
  v.append(el("h2",{},"Data dictionary"));
  v.append(el("p",{class:"sec-intro"},"Every field across all tables, with plain-language descriptions, scientific meaning, inferred role, keys, foreign-key targets, ontologies/controlled vocabularies, distinct/missing counts, and a confidence rating for each interpretation. Fully searchable, sortable, and exportable."));
  const all=[]; M.tables.forEach(t=>t.col_meta.forEach(c=>all.push(c)));
  let fTable="", fRole="", fConf="";
  const roles=[...new Set(all.map(c=>c.role))].sort();
  const filters=[
    selectFilter("All tables",M.tables.map(t=>t.name),val=>{fTable=val;wrap._rerender();}),
    selectFilter("All roles",roles,val=>{fRole=val;wrap._rerender();}),
    selectFilter("Any confidence",["high","medium","low"],val=>{fConf=val;wrap._rerender();}),
  ];
  const cols=[
    {key:"table_name",label:"Table",cls:"mono"},
    {key:"field_name",label:"Field",cls:"mono",render:r=>{const b=[r.field_name];if(r.is_primary_key)b.push(" ",el("span",{class:"pill declared"},"PK"));if(r.is_foreign_key)b.push(" ",el("span",{class:"pill inferred"},"FK"));return el("span",{},b);},raw:r=>r.field_name},
    {key:"role",label:"Role"},
    {key:"data_type",label:"Type",cls:"mono",render:r=>r.data_type.replace(" (source) / "," → ").replace(" (intended)","")},
    {key:"foreign_table",label:"References",render:r=>r.foreign_table?el("a",{href:"#tables/"+r.foreign_table,class:"tag"},r.foreign_table+"."+r.foreign_field):""},
    {key:"description",label:"Description / meaning",render:r=>el("span",{class:"ink2"},r.description||"")},
    {key:"example_values",label:"Examples",cls:"mono",render:r=>r.example_values},
    {key:"ontology",label:"Ontology / vocab",render:r=>r.ontology||(r.controlled_vocabulary?"enum: "+r.controlled_vocabulary:"")},
    {key:"unique_count",label:"Distinct",num:true},
    {key:"missing_percent",label:"Missing %",num:true,render:r=>r.missing_percent+"%",raw:r=>r.missing_percent},
    {key:"interpretation_confidence",label:"Conf.",render:r=>el("span",{class:"pill "+r.interpretation_confidence},r.interpretation_confidence)},
  ];
  const wrap=sortableTable(cols,all,{placeholder:"Search every field…",sort:"table_name",filters,
    exportName:"ideas_data_dictionary.csv",
    extraFilter:r=>(!fTable||r.table_name===fTable)&&(!fRole||r.role===fRole)&&(!fConf||r.interpretation_confidence===fConf)});
  v.append(wrap);
}

/* =============================================================== Relationships */
function renderRel(v){
  v.append(el("h2",{},"Table relationships"));
  v.append(el("p",{class:"sec-intro"},"How records connect across tables. Each edge is classified by evidence: DECLARED (an explicit FOREIGN KEY … REFERENCES clause in the SQL DDL), INFERRED (name matches a parent table's id and 100% of child values resolve to a parent row), or UNCERTAIN (naming suggests a link but the parent is empty, values are unpopulated, or some child values have no parent). Coverage = share of populated child values that match a parent id."));
  const counts={declared:0,inferred:0,uncertain:0}; M.relationships.forEach(r=>counts[r.status]++);
  const tiles=el("div",{class:"tiles"});
  [["declared","Declared","In the SQL DDL"],["inferred","Inferred","Naming + 100% value match"],["uncertain","Uncertain","Needs review"]].forEach(([k,l,s])=>{
    tiles.append(el("div",{class:"tile"},[el("div",{class:"n"},String(counts[k])),
      el("div",{class:"l"},[el("span",{class:"pill "+k},l)]),el("div",{class:"s"},s)]));
  });
  v.append(tiles);
  let fStatus="";
  const filters=[selectFilter("All statuses",["declared","inferred","uncertain"],val=>{fStatus=val;wrap._rerender();})];
  const cols=[
    {key:"child_table",label:"Child table",cls:"mono",render:r=>el("a",{href:"#tables/"+r.child_table},r.child_table)},
    {key:"child_field",label:"Child field",cls:"mono"},
    {key:"arrow",label:"",render:()=>"→",raw:()=>""},
    {key:"parent_table",label:"Parent table",cls:"mono",render:r=>el("a",{href:"#tables/"+r.parent_table},r.parent_table)},
    {key:"parent_field",label:"Parent field",cls:"mono"},
    {key:"status",label:"Evidence",render:r=>el("span",{class:"pill "+r.status},r.status)},
    {key:"coverage_percent",label:"Coverage",num:true,render:r=>{
        if(r.coverage_percent==null) return el("span",{class:"muted"},"no values");
        return el("span",{},[el("span",{class:"meter mini"},el("i",{style:`width:${r.coverage_percent}%;background:${r.coverage_percent>=100?'var(--good)':r.coverage_percent>0?'var(--warn)':'var(--crit)'}`}))," "+r.coverage_percent+"%"]);
      },raw:r=>r.coverage_percent==null?-1:r.coverage_percent},
    {key:"n_distinct_child",label:"Child vals",num:true},
    {key:"orphans",label:"Orphans",num:true,render:r=>r.orphans==null?el("span",{class:"muted"},"—"):(r.orphans>0?el("span",{style:"color:var(--crit);font-weight:600"},String(r.orphans)):"0"),raw:r=>r.orphans==null?-1:r.orphans},
  ];
  const wrap=sortableTable(cols,M.relationships,{placeholder:"Search relationships…",sort:"child_table",
    filters,exportName:"ideas_relationships.csv",extraFilter:r=>!fStatus||r.status===fStatus});
  v.append(wrap);
}

/* =============================================================== Ontologies & Units */
function renderOnto(v){
  v.append(el("h2",{},"Ontologies, cross-references & units"));
  v.append(el("p",{class:"sec-intro"},"How the dataset connects to the wider world: every measured quantity and the unit it is recorded in, a UCUM-coded unit reference, external database cross-references with live links, and the chemical / biological identifier notations used — each mapped to the fields that carry it and to its authoritative registry or specification."));

  /* ---------- 1. Measured parameters catalogue ---------- */
  v.append(el("h3",{},"Measured parameters & their units"));
  v.append(el("p",{class:"muted",style:"margin-top:0"},"Every distinct measured/experimental quantity in the data, the unit it is recorded in and the physical quantity it represents. Values are stored as label / value / unit triples — assay conditions & readouts in sample_parameter, protein- and variant-level metrics in protein_parameter."));
  const MEAS=[["sample_parameter","assay condition / readout"],["protein_parameter","protein / variant metric"]];
  const prows=[]; const usedByUnit={};
  MEAS.forEach(([tn,kind])=>{
    const t=TBL[tn]; if(!t) return;
    const ci=t.columns.indexOf("label"), ui=t.columns.indexOf("unit"), vi=t.columns.indexOf("value");
    if(ci<0) return;
    const agg={};
    t.rows.forEach(r=>{
      const lab=r[ci]==null?"":r[ci], un=(ui>=0?(r[ui]||""):"");
      const k=lab+"\u0000"+un;
      const a=agg[k]||(agg[k]={parameter:lab,unit:un,table:tn,kind,n:0,ex:[]});
      a.n++; if(a.ex.length<3 && vi>=0 && r[vi]!=null && r[vi]!=="") a.ex.push(r[vi]);
    });
    Object.values(agg).forEach(a=>{
      a.quantity = a.unit ? (UNIT_REF[a.unit]?UNIT_REF[a.unit].quantity:"—") : "categorical / text";
      prows.push(a);
      if(a.unit){ (usedByUnit[a.unit]=usedByUnit[a.unit]||[]).push(a.parameter); }
    });
  });
  const pcols=[
    {key:"parameter",label:"Parameter",cls:"mono"},
    {key:"unit",label:"Unit",cls:"mono",render:r=>r.unit?r.unit:el("span",{class:"muted"},"— (categorical)")},
    {key:"quantity",label:"Quantity kind",render:r=>el("span",{class:"ink2"},r.quantity)},
    {key:"kind",label:"Role"},
    {key:"table",label:"Source table",cls:"mono"},
    {key:"n",label:"Records",num:true},
    {key:"ex",label:"Examples",cls:"mono",render:r=>r.ex.join(", "),raw:r=>r.ex.join(", ")},
  ];
  v.append(sortableTable(pcols,prows,{placeholder:"Search measured parameters…",sort:"parameter"}));

  /* ---------- 2. Unit reference (UCUM) ---------- */
  v.append(el("h3",{},"Unit reference (UCUM-coded)"));
  v.append(el("p",{class:"muted",style:"margin-top:0"},["Each unit that appears in the data, its physical quantity and dimension, and its ",
    el("a",{href:"https://ucum.org/",target:"_blank",rel:"noopener"},"UCUM"),
    " code — the machine-readable unit notation used for interoperable exchange. “Used by” lists the measured parameters recorded in that unit."]));
  const urows=Object.entries(M.units_used).map(([u,n])=>{
    const ref=UNIT_REF[u]||{};
    const params=[...new Set(usedByUnit[u]||[])];
    return {unit:u,n,name:ref.name||"",quantity:ref.quantity||"—",dim:ref.dim||"—",ucum:ref.ucum||u,params};
  });
  const ucols=[
    {key:"unit",label:"Unit",cls:"mono"},
    {key:"name",label:"Name"},
    {key:"quantity",label:"Quantity",render:r=>el("span",{class:"ink2"},r.quantity)},
    {key:"dim",label:"Dimension",render:r=>el("span",{class:"muted"},r.dim)},
    {key:"ucum",label:"UCUM",cls:"mono"},
    {key:"n",label:"Occurrences",num:true},
    {key:"params",label:"Used by",render:r=>r.params.length?el("span",{class:"muted"},r.params.join(", ")):el("span",{class:"muted"},"—"),raw:r=>r.params.length},
  ];
  v.append(sortableTable(ucols,urows,{placeholder:"Search units…",sort:"n",dir:-1}));

  /* ---------- 3. External database cross-references ---------- */
  v.append(el("h3",{},"External database cross-references"));
  v.append(el("p",{class:"muted",style:"margin-top:0"},"From the idea_dbxref table — links from IDEAS entities out to authoritative external resources. Each accession is a live link; the registry name links to its home page."));
  const dbwrap=el("div",{class:"dlgrid"});
  Object.entries(M.dbxref_summary).forEach(([db,accs])=>{
    const c=el("div",{class:"dl"});
    c.append(el("div",{class:"ic",html:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>'}));
    const body=el("div");
    const reg=REGISTRY[db];
    const head=reg? el("a",{href:reg.url,target:"_blank",rel:"noopener"},reg.name||db) : (db+" ");
    body.append(el("h4",{},[head]));
    body.append(el("div",{class:"sz"},`${reg&&reg.desc?reg.desc+" · ":""}${accs.length} accession${accs.length>1?"s":""}`));
    const list=el("div",{style:"margin-top:.3rem;display:flex;gap:.3rem;flex-wrap:wrap"});
    [...new Set(accs)].forEach(a=>{
      const u=DBURL[db]?DBURL[db](a.replace(/^CHEBI:/,"")):null;
      list.append(u?el("a",{href:u,target:"_blank",rel:"noopener",class:"tag"},a):el("span",{class:"tag",title:reg&&!reg.url?"internal identifier — no public resolver":""},a));
    });
    body.append(list); c.append(body); dbwrap.append(c);
  });
  v.append(dbwrap);

  /* ---------- 4. Chemical & biological identifier notations ---------- */
  v.append(el("h3",{},"Chemical & biological identifier notations"));
  v.append(el("p",{class:"muted",style:"margin-top:0"},"Structured identifiers and controlled notations embedded in the data (not free text) — each linked to its specification/registry, with the fields that carry it and, where a public resolver exists, a live lookup of an example value."));
  const refKeys=Object.keys(ONTO_REF).sort((a,b)=>b.length-a.length);
  const grouped={};
  M.tables.forEach(t=>t.col_meta.forEach(c=>{
    if(!c.ontology) return;
    const fn=c.field_name;
    const key=refKeys.find(k=>fn===k||fn.includes(k)) || fn;
    const g=grouped[key]||(grouped[key]={key,fields:new Set(),tables:new Set(),example:"",label:c.ontology});
    g.fields.add(`${t.name}.${fn}`); g.tables.add(t.name);
    if(!g.example && c.example_values) g.example=String(c.example_values).split(";")[0].trim();
  }));
  const nrows=Object.values(grouped).map(g=>{
    const ref=ONTO_REF[g.key]||{};
    return {notation:ref.name||g.label||g.key, category:ref.cat||"Structured identifier",
      spec:ref.spec||"", resolve:ref.resolve||null,
      fields:[...g.fields], example:g.example||""};
  });
  const ncols=[
    {key:"notation",label:"Notation / identifier",render:r=>r.spec?el("a",{href:r.spec,target:"_blank",rel:"noopener"},r.notation):r.notation,raw:r=>r.notation},
    {key:"category",label:"Category",render:r=>el("span",{class:"ink2"},r.category)},
    {key:"fields",label:"Fields",cls:"mono",render:r=>r.fields.join(", "),raw:r=>r.fields.join(", ")},
    {key:"example",label:"Example",cls:"mono",render:r=>{
        const ex=r.example.length>34?r.example.slice(0,33)+"…":r.example;
        if(r.resolve && r.example) return el("a",{href:r.resolve(r.example),target:"_blank",rel:"noopener",class:"mono",title:r.example},ex);
        return el("span",{title:r.example},ex);
      },raw:r=>r.example},
  ];
  v.append(sortableTable(ncols,nrows,{placeholder:"Search notations…",sort:"category"}));
}
// UCUM-coded unit reference: symbol -> {name, quantity, dim, ucum}
const UNIT_REF={
  mM:{name:"Millimolar",quantity:"Amount concentration",dim:"amount·volume⁻¹",ucum:"mmol/L"},
  uL:{name:"Microlitre",quantity:"Volume",dim:"length³",ucum:"uL"},
  C:{name:"Degree Celsius",quantity:"Temperature",dim:"temperature",ucum:"Cel"},
  h:{name:"Hour",quantity:"Time",dim:"time",ucum:"h"},
  rpm:{name:"Revolutions per minute",quantity:"Rotational frequency",dim:"time⁻¹",ucum:"{rpm}"},
  angstrom:{name:"Ångström",quantity:"Length (structural, RMSD)",dim:"length",ucum:"Ao"},
  fold:{name:"Fold-change",quantity:"Ratio vs reference (WT)",dim:"dimensionless",ucum:"1"},
  ratio:{name:"Ratio",quantity:"Dimensionless ratio",dim:"dimensionless",ucum:"1"},
  "%":{name:"Percent",quantity:"Conversion / fraction",dim:"dimensionless",ucum:"%"},
  score:{name:"Score",quantity:"Model confidence score (e.g. pLDDT)",dim:"dimensionless",ucum:"1"},
  log_likelihood_ratio:{name:"Log-likelihood ratio",quantity:"Model log-likelihood (e.g. ESM-1v)",dim:"dimensionless",ucum:"1"},
  relative_abundance:{name:"Relative abundance",quantity:"Mass-spec relative abundance (a.u.)",dim:"dimensionless",ucum:"1"},
  intensity:{name:"Intensity",quantity:"Mass-spec intensity (a.u.)",dim:"dimensionless",ucum:"1"},
  "mg/L":{name:"Milligrams per litre",quantity:"Mass concentration / titer",dim:"mass·volume⁻¹",ucum:"mg/L"},
};
// registry home pages for dbxref sources
const REGISTRY={
  UniProt:{name:"UniProt",url:"https://www.uniprot.org/",desc:"Protein sequences & function"},
  PDB:{name:"RCSB PDB",url:"https://www.rcsb.org/",desc:"Experimental protein structures"},
  NCBI_Protein:{name:"NCBI Protein",url:"https://www.ncbi.nlm.nih.gov/protein/",desc:"Protein sequence records"},
  PubChem:{name:"PubChem",url:"https://pubchem.ncbi.nlm.nih.gov/",desc:"Chemical compounds"},
  ChEBI:{name:"ChEBI",url:"https://www.ebi.ac.uk/chebi/",desc:"Chemical entities ontology"},
  KEGG:{name:"KEGG",url:"https://www.genome.jp/kegg/",desc:"Pathways, reactions & compounds"},
  MetaCyc:{name:"MetaCyc",url:"https://metacyc.org/",desc:"Metabolic pathways & reactions"},
  ORNL_LIMS:{name:"ORNL LIMS",url:"",desc:"Internal ORNL sample tracking (no public resolver)"},
};
// structured-identifier notations: key -> {name, cat, spec, resolve?}
const ONTO_REF={
  smiles:{name:"SMILES",cat:"Chemical structure notation",spec:"https://www.daylight.com/dayhtml/doc/theory/theory.smiles.html"},
  inchi_key:{name:"InChIKey",cat:"Chemical structure hash",spec:"https://www.inchi-trust.org/",resolve:k=>`https://pubchem.ncbi.nlm.nih.gov/#query=${encodeURIComponent(k)}`},
  inchi:{name:"InChI",cat:"Chemical structure notation",spec:"https://iupac.org/who-we-are/divisions/division-details/inchi/",resolve:k=>`https://pubchem.ncbi.nlm.nih.gov/#query=${encodeURIComponent(k)}`},
  molecular_formula:{name:"Molecular formula (Hill)",cat:"Chemical descriptor",spec:"https://en.wikipedia.org/wiki/Chemical_formula#Hill_system"},
  smarts:{name:"SMARTS",cat:"Substructure / reaction pattern",spec:"https://www.daylight.com/dayhtml/doc/theory/theory.smarts.html"},
  kb_protein_id:{name:"KBase protein ID",cat:"KBase / ModelSEED identifier",spec:"https://www.kbase.us/"},
  kb_genome_id:{name:"KBase genome ID",cat:"KBase / ModelSEED identifier",spec:"https://www.kbase.us/"},
  kb_metabolite_id:{name:"ModelSEED compound ID",cat:"KBase / ModelSEED identifier",spec:"https://modelseed.org/"},
  kb_reaction_id:{name:"ModelSEED reaction ID",cat:"KBase / ModelSEED identifier",spec:"https://modelseed.org/"},
  structure_url:{name:"RCSB PDB structure URL",cat:"Structure reference",spec:"https://www.rcsb.org/"},
  mutations:{name:"Protein variant notation",cat:"Sequence variant notation (HGVS-like)",spec:"https://varnomen.hgvs.org/"},
};

/* =============================================================== Data Quality */
function renderQuality(v){
  v.append(el("h2",{},"Data quality & completeness"));
  v.append(el("p",{class:"sec-intro"},"How complete and internally consistent the metadata are. Completeness is the share of non-empty cells per table. Findings flag discrepancies between the delivered data, the SQL DDL, and the shipped data dictionary — the things a downstream consumer should know before relying on a field."));

  // findings by severity
  v.append(el("h3",{},"Consistency findings"));
  const sev={warning:"warning",info:"info",critical:"critical"};
  const bysev={warning:[],info:[],critical:[]};
  M.findings.forEach(f=>bysev[f.severity]?.push(f));
  ["critical","warning","info"].forEach(s=>{
    bysev[s].forEach(f=>{
      const d=el("details",{class:"finding"});
      d.append(el("summary",{},[el("span",{class:"pill "+sev[s]},s)," ",el("b",{style:"font-family:var(--mono)"},f.table)]));
      d.append(el("p",{class:"ink2",style:"margin:.4rem 0 0"},f.finding));
      v.append(d);
    });
  });

  // completeness bars
  v.append(el("h3",{},"Per-table completeness"));
  const rows=M.tables.map(t=>({name:t.name,nrows:t.nrows,ncols:t.ncols,completeness:t.completeness,
     empties:t.col_meta.filter(c=>c.missing_percent===100).length}));
  const cols=[
    {key:"name",label:"Table",cls:"mono",render:r=>el("a",{href:"#tables/"+r.name},r.name)},
    {key:"nrows",label:"Rows",num:true,render:r=>fmt(r.nrows)},
    {key:"ncols",label:"Cols",num:true},
    {key:"completeness",label:"Filled",num:true,render:r=>el("span",{},[el("span",{class:"meter mini"},el("i",{style:`width:${r.completeness}%;background:${completenessColor(r.completeness)}`}))," "+r.completeness+"%"]),raw:r=>r.completeness},
    {key:"empties",label:"Fully-empty cols",num:true,render:r=>r.empties>0?el("span",{style:"color:var(--warn)"},String(r.empties)):"0",raw:r=>r.empties},
  ];
  v.append(sortableTable(cols,rows,{placeholder:"Search tables…",sort:"completeness",dir:1,exportName:"ideas_completeness.csv"}));
}

/* =============================================================== Download */
function renderDownload(v){
  v.append(el("h2",{},"Download the data"));
  v.append(el("p",{class:"sec-intro"},"The full dataset is available as a single SQL dump, a ready-to-query SQLite database, the enriched data dictionary, and the original Parquet source files. Everything is generated directly from the source data in this portal."));

  const items=[
    ["ideas_dump.sql","SQL dump (schema + all data)","downloads/ideas_dump.sql",
      "Complete SQLite-dialect dump: CREATE TABLE statements plus every row. Load with <code>sqlite3 ideas.db &lt; ideas_dump.sql</code>.","db"],
    ["ideas.db","SQLite database","downloads/ideas.db",
      "Ready-to-query SQLite file (all 21 tables). Open with <code>sqlite3 ideas.db</code>, DB Browser, or pandas/duckdb.","db"],
    ["data_dictionary.csv","Data dictionary (CSV)","downloads/data_dictionary.csv",
      "Every field with type, keys, description, ontology, distinct/missing counts and interpretation confidence.","csv"],
    ["data_dictionary.enriched.json","Data dictionary (JSON)","downloads/data_dictionary.enriched.json",
      "The same dictionary as structured JSON, including numeric ranges and allowed-value enumerations.","json"],
    ["metadata.json","Full portal metadata (JSON)","downloads/metadata.json",
      "The complete analysis bundle powering this site: tables, stats, relationships, findings, units, cross-refs and all rows.","json"],
    ["ideas_db_source.zip","Original source files (ZIP)","downloads/ideas_db_source.zip",
      "All original Parquet files, the SQL schema (<code>ideas_min_schema.sql</code>), the shipped data dictionary and design docs.","zip"],
  ];
  const grid=el("div",{class:"dlgrid"});
  const fileSize={}; M.files.forEach(f=>fileSize[f.name]=f.bytes);
  items.forEach(([name,title,href,desc,kind])=>{
    const c=el("a",{class:"dl",href,download:name,style:"text-decoration:none;color:inherit"});
    c.append(el("div",{class:"ic",html:ICON[kind]||ICON.file}));
    const body=el("div",{style:"flex:1"});
    body.append(el("h4",{},[title," ",el("span",{class:"pill inferred"},"↓")]));
    body.append(el("div",{html:desc,class:"ink2",style:"font-size:.82rem;margin:.1rem 0 .3rem"}));
    body.append(el("div",{class:"sz"},esc(name)));
    c.append(body); grid.append(c);
  });
  v.append(grid);

  v.append(el("h3",{},"Quick start"));
  v.append(el("pre",{},
`# Query the SQL dump
sqlite3 ideas.db < ideas_dump.sql
sqlite3 ideas.db "SELECT name, source_organism FROM idea_protein;"

# Or query the parquet directly with duckdb / pandas
python3 -c "import duckdb; print(duckdb.sql(\\"SELECT label,value,unit FROM 'sample_parameter.parquet' LIMIT 5\\"))"

# Example join: every measured value with its sample and analyte context
SELECT s.name AS sample, sp.label, sp.value, sp.unit
FROM sample_parameter sp
JOIN idea_sample s ON s.id = sp.sample_id
LIMIT 20;`));

  v.append(el("p",{class:"muted"},`Generated ${esc(M.generated)} · ${M.n_tables} tables · ${fmt(M.total_rows)} rows.`));
}
const ICON={
  db:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>',
  csv:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/></svg>',
  json:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H6a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h2M16 3h2a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-2"/></svg>',
  zip:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M12 11v6M10 13h4M10 16h4"/></svg>',
  file:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
};
