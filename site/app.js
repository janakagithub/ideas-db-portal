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
  ["overview","Overview"], ["project","The Project"], ["schema","Schema & ERD"],
  ["linkml","Schema (LinkML)"], ["tables","Tables"],
  ["dict","Data Dictionary"], ["rel","Relationships"], ["measure","Measurements"],
  ["onto","Ontologies & Units"], ["quality","Data Quality"], ["explore","Iceberg & Files"],
  ["download","Download"],
];

// ---- release flags: which release each table / column / parameter came from ----
// UNION of the earlier all-TEXT release (21 tables) and the typed tetrad_v1 release (12 tables).
const RLS = {
  both:      {cls:"rls-both", sym:"=", label:"in both releases (unchanged)"},
  tetrad_v1: {cls:"rls-new", sym:"+", label:"added in tetrad_v1"},
  earlier:   {cls:"rls-old", sym:"−", label:"only in earlier release — dropped in tetrad_v1"},
};
function releaseBadge(state, opts={}){
  const r = RLS[state] || RLS.both;
  let title = opts.title || r.label;
  if(opts.removed) title = "column removed in tetrad_v1 (present in earlier release only)";
  return el("span",{class:"rls "+r.cls, title}, r.sym);
}
function releaseLegend(){
  const wrap = el("div",{class:"legend rls-legend"});
  const leg = (M.releases && M.releases.legend) || [];
  leg.forEach(x=>{
    const r = RLS[x.state] || RLS.both;
    wrap.append(el("span",{},[el("span",{class:"rls "+r.cls}, x.symbol||r.sym), " ", x.label]));
  });
  return wrap;
}

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
  ({overview:renderOverview,project:renderProject,schema:renderSchema,linkml:renderLinkml,
    tables:renderTables,dict:renderDict,
    rel:renderRel,measure:renderMeasure,onto:renderOnto,quality:renderQuality,
    explore:renderExplore,download:renderDownload}[id]||renderOverview)(view,arg);
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
    stat(Object.keys(M.units_used).length,"Distinct units","intensity, mg/L, %"),
  );

  const nInf=M.relationships.filter(r=>r.status==="inferred").length;
  const about=el("div",{class:"card"});
  about.innerHTML = `<h3 style="margin-top:0">About this dataset</h3>
   <p class="ink2" style="max-width:76ch">This is the <b>IDEAS</b> enzyme-engineering dataset, loaded from the <code>tetrad_v1</code> <b>Apache Iceberg</b> warehouse — a typed, versioned export produced for the DOE <b>BRIDGE</b> project (see <a href="#project">The Project</a>). Every column keeps its real type (integers, reals, dates, booleans, timestamps), and every record carries a stable CURIE identifier (<code>SMP:1</code>, <code>EXP:…</code>). It records the enzymes and their engineered variants, the substrates and synthesized products, the reactions and their stoichiometry, the assay samples/replicates, and — its focus — every measured value: mass-spec intensities, titers and conversion percentages.</p>
   <div class="legend"><span><span class="dot" style="background:var(--good)"></span>${fmt(M.total_rows)} typed rows · ${nInf}/${M.relationships.length} foreign keys resolve at 100% coverage</span>
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

  v.append(hero,tiles,about,releasePanel(),inv);
}

/* What changed between the earlier release and the newer tetrad_v1 release.
   Renders from M.releases (see also the inline badges throughout the portal). */
function releasePanel(){
  const R = M.releases; if(!R) return null;
  const c = el("div",{class:"card"});
  c.append(el("h3",{style:"margin-top:0"},"What changed between releases"));
  c.append(el("p",{class:"ink2",style:"margin-top:0;max-width:82ch"},
    `This portal shows the UNION of two releases so nothing is lost. The earlier all-TEXT release had `+
    `${R.earlier.n_tables} tables / ${fmt(R.earlier.n_rows)} rows; the newer typed `+
    `${R.tetrad_v1.name} release has ${R.tetrad_v1.n_tables} tables / ${fmt(R.tetrad_v1.n_rows)} rows. `+
    `Everywhere in the portal a small badge marks which release each table, column and measured parameter came from:`));
  c.append(releaseLegend());

  // headline counts
  const tiles = el("div",{class:"tiles",style:"margin-top:.7rem"});
  const stat=(n,l,s,badge)=>el("div",{class:"tile"},[
    el("div",{class:"n"},[badge?releaseBadge(badge):null," ",fmt(n)]),
    el("div",{class:"l"},l), s?el("div",{class:"s"},s):null]);
  tiles.append(
    stat(R.tables_both.length,"Tables in both","carried forward (typed)","both"),
    stat(R.tables_only_earlier.length,"Tables dropped","restored here from earlier","earlier"),
    stat(R.added_columns.length,"Columns added","in tetrad_v1","tetrad_v1"),
    stat(R.removed_columns.length,"Columns removed","kept & flagged","earlier"),
  );
  c.append(tiles);

  // dropped tables (names)
  if(R.tables_only_earlier.length){
    const d=el("div",{style:"margin-top:.6rem"});
    d.append(el("div",{class:"ink2",style:"font-weight:600;margin-bottom:.25rem"},
      [releaseBadge("earlier")," ",`${R.tables_only_earlier.length} tables were in the earlier release but dropped in ${R.tetrad_v1.name} (restored here):`]));
    const wrap=el("div",{style:"display:flex;gap:.35rem;flex-wrap:wrap"});
    R.tables_only_earlier.forEach(tn=>wrap.append(
      TBL[tn]? el("a",{href:"#tables/"+tn,class:"tag mono"},tn) : el("span",{class:"tag mono"},tn)));
    d.append(wrap); c.append(d);
  }

  // added / removed columns
  const colLine=(state,label,arr)=>{
    if(!arr||!arr.length) return null;
    const d=el("div",{style:"margin-top:.5rem"});
    d.append(el("span",{class:"ink2",style:"font-weight:600"},[releaseBadge(state)," ",label+": "]));
    d.append(el("span",{class:"mono ink2",style:"font-size:.84rem"},arr.join(", ")));
    return d;
  };
  c.append(colLine("tetrad_v1","Columns added in tetrad_v1",R.added_columns));
  c.append(colLine("earlier","Columns removed in tetrad_v1 (documented, values shown from earlier release)",R.removed_columns));
  if(R.audit_note) c.append(el("p",{class:"muted",style:"margin:.5rem 0 0;font-size:.84rem"},R.audit_note));

  // narrative summary
  if(R.summary && R.summary.length){
    const ul=el("ul",{class:"proselist",style:"margin-top:.6rem"});
    R.summary.forEach(s=>ul.append(el("li",{class:"ink2"},s)));
    c.append(ul);
  }

  // essential-but-missing
  if(R.essential_missing && R.essential_missing.length){
    c.append(el("h4",{style:"margin:.8rem 0 .3rem"},
      [releaseBadge("earlier")," Essential data missing from the newer release"]));
    c.append(el("p",{class:"muted",style:"margin:0 0 .4rem"},
      "What the reduced tetrad_v1 release leaves out that the hackathon and the AI↔experiment loop rely on — all restored in this union view."));
    const g=el("div",{class:"dlgrid"});
    R.essential_missing.forEach(e=>{
      const d=el("div",{class:"dl",style:"cursor:default"});
      const body=el("div",{style:"flex:1"});
      body.append(el("h4",{},e.item));
      body.append(el("div",{class:"ink2",style:"font-size:.84rem;margin-top:.15rem"},e.why));
      d.append(body); g.append(d);
    });
    c.append(g);
  }
  return c;
}
function human(b){ if(b<1024)return b+" B"; if(b<1048576)return (b/1024).toFixed(1)+" KB"; return (b/1048576).toFixed(1)+" MB"; }

/* =============================================================== The Project (BRIDGE) */
function renderProject(v){
  const P=M.project||{};
  v.append(el("h2",{},P.name||"The project"));
  v.append(el("p",{class:"sec-intro"},"A plain-language orientation for anyone new to the project: what it is, what it is trying to do, where it stands, and what happens next — distilled from the team's weekly meeting notes. This page explains the why; the rest of the portal is the what."));

  // mission callout
  if(P.mission){
    const mc=el("div",{class:"card",style:"border-left:4px solid var(--accent)"});
    mc.append(el("div",{class:"kicker"},"Data Modeling Team — mission"));
    mc.append(el("p",{class:"lead",style:"margin:.3rem 0 0"},P.mission));
    v.append(mc);
  }

  const section=(title,items,opts={})=>{
    if(!items||!items.length) return;
    const c=el("div",{class:"card"});
    c.append(el("h3",{style:"margin-top:0"},title));
    if(opts.intro) c.append(el("p",{class:"ink2",style:"margin-top:0"},opts.intro));
    const ul=el("ul",{class:"proselist"});
    items.forEach(x=>ul.append(el("li",{class:"ink2"},x)));
    c.append(ul); v.append(c);
  };

  section("What is it?",P.what_is_it);
  section("Goals",P.goals,{intro:"What the Data Modeling Team is trying to achieve."});

  // BRIDGE base model -> tables
  if(P.base_classes && P.base_classes.length){
    const c=el("div",{class:"card"});
    c.append(el("h3",{style:"margin-top:0"},"The shared data model"));
    c.append(el("p",{class:"ink2",style:"margin-top:0"},"BRIDGE models every dataset against a small set of base classes. Here is how this IDEAS dataset's tables map onto them — the same backbone every BRIDGE resource shares."));
    const grid=el("div",{class:"dlgrid"});
    P.base_classes.forEach(bc=>{
      const [nm,desc,tbls]=bc;
      const d=el("div",{class:"dl",style:"cursor:default"});
      const body=el("div",{style:"flex:1"});
      body.append(el("h4",{},nm));
      body.append(el("div",{class:"ink2",style:"font-size:.84rem;margin:.15rem 0"},desc));
      const tagwrap=el("div",{style:"display:flex;gap:.3rem;flex-wrap:wrap;margin-top:.25rem"});
      (tbls||[]).forEach(tn=>tagwrap.append(
        TBL[tn]? el("a",{href:"#tables/"+tn,class:"tag mono"},tn) : el("span",{class:"tag mono muted",title:"not in this release"},tn)
      ));
      if(!tbls||!tbls.length) tagwrap.append(el("span",{class:"muted"},"—"));
      body.append(tagwrap);
      d.append(body); grid.append(d);
    });
    c.append(grid); v.append(c);
  }

  section("Progress so far",P.progress,{intro:"Where the project stands today."});
  section("Immediate next goals",P.immediate,{intro:"What the team is working toward right now."});
  section("How this IDEAS dataset fits in",P.how_ideas_fits);

  if(P.source) v.append(el("p",{class:"muted"},"Source: "+P.source));
}

/* =============================================================== Iceberg & Files (explore + download typed data) */
function renderExplore(v){
  const IB=M.iceberg||{tables:[]};
  v.append(el("h2",{},"Iceberg warehouse & files"));
  v.append(el("p",{class:"sec-intro",html:'This dataset ships as an <b>Apache Iceberg v2</b> warehouse: each table is a folder of columnar <b>Parquet</b> data files plus a <code>metadata/</code> tree (a chain of <code>metadata.json</code> versions, Avro manifest &amp; snapshot files) that records its full <b>snapshot history</b>. Iceberg gives every table schema evolution, ACID snapshots and time-travel. Below you can inspect each table\'s snapshots and current files, and download the whole warehouse or per-table Parquet.'}));

  // downloads first (what the user asked for)
  const dl=el("div",{class:"card"});
  dl.append(el("h3",{style:"margin-top:0"},"Download & explore"));
  const dlgrid=el("div",{class:"dlgrid"});
  const item=(title,desc,href,name,kind)=>{
    const c=el("a",{class:"dl",href,download:name,style:"text-decoration:none;color:inherit"});
    c.append(el("div",{class:"ic",html:ICON[kind]||ICON.file}));
    const body=el("div",{style:"flex:1"});
    body.append(el("h4",{},[title," ",el("span",{class:"pill inferred"},"↓")]));
    body.append(el("div",{html:desc,class:"ink2",style:"font-size:.82rem;margin:.1rem 0 .3rem"}));
    body.append(el("div",{class:"sz"},esc(name)));
    c.append(body); return c;
  };
  dlgrid.append(item("Full Iceberg warehouse (ZIP)",
    "Every table's Parquet data + Iceberg metadata (all snapshots). Open with PyIceberg, Spark, or DuckDB's <code>iceberg</code> extension.",
    "downloads/tetrad_v1_iceberg.zip","tetrad_v1_iceberg.zip","zip"));
  v.append(dl);
  dl.append(dlgrid);

  // per-table parquet downloads
  v.append(el("h3",{},"Per-table Parquet (current snapshot)"));
  v.append(el("p",{class:"muted",style:"margin-top:0"},"Each table's current snapshot as a single typed Parquet file — the quickest way to query one table with pandas / DuckDB / Polars."));
  const pcols=[
    {key:"name",label:"Table",cls:"mono",render:r=>el("a",{href:"#tables/"+r.name},r.name),raw:r=>r.name},
    {key:"rows",label:"Rows",num:true,render:r=>fmt((TBL[r.name]||{}).nrows||0),raw:r=>(TBL[r.name]||{}).nrows||0},
    {key:"snaps",label:"Snapshots",num:true,render:r=>String(r.n_snapshots),raw:r=>r.n_snapshots},
    {key:"files",label:"Data files",num:true,render:r=>String(r.current_data_files.length),raw:r=>r.current_data_files.length},
    {key:"bytes",label:"Size",num:true,render:r=>human(r.current_bytes),raw:r=>r.current_bytes},
    {key:"dl",label:"Parquet",render:r=>el("a",{href:"downloads/parquet/"+r.name+".parquet",download:r.name+".parquet",class:"tag"},"↓ "+r.name+".parquet"),raw:r=>r.name},
  ];
  v.append(sortableTable(pcols,IB.tables,{placeholder:"Search tables…",sort:"bytes",dir:-1}));

  // snapshot history explorer
  v.append(el("h3",{},"Snapshot history"));
  v.append(el("p",{class:"muted",style:"margin-top:0"},"Every Iceberg table here has a chain of snapshots (append / overwrite / delete operations). The current snapshot is highlighted; only it is loaded into the portal. Pick a table to see its timeline."));
  let cur=IB.tables[0]?IB.tables[0].name:null;
  const sel=selectFilter("Choose a table",IB.tables.map(t=>t.name),val=>{cur=val||(IB.tables[0]&&IB.tables[0].name);drawSnaps();});
  const controls=el("div",{class:"controls"}); controls.append(sel.node); v.append(controls);
  const snapHost=el("div"); v.append(snapHost);
  function drawSnaps(){
    snapHost.innerHTML="";
    const it=IB.tables.find(x=>x.name===cur); if(!it) return;
    const meta=el("dl",{class:"kv"});
    const add=(k,val)=>{meta.append(el("dt",{},k),el("dd",{},val));};
    add("Format",`Iceberg v${it.format_version}`);
    add("Engine",it.iceberg_version||"—");
    add("metadata.json versions",String(it.n_metadata_versions));
    add("Current snapshot",el("span",{class:"mono"},it.current_snapshot));
    add("Current data files",`${it.current_data_files.length} (${human(it.current_bytes)})`);
    const card=el("div",{class:"card"}); card.append(el("h4",{style:"margin-top:0;font-family:var(--mono)"},it.name),meta);
    snapHost.append(card);
    const scols=[
      {key:"timestamp",label:"When (UTC)",render:r=>r.timestamp.replace("T"," ").replace("Z","")},
      {key:"operation",label:"Operation",render:r=>el("span",{class:"pill "+(r.operation==="append"?"declared":r.operation==="delete"?"uncertain":"inferred")},r.operation||"—"),raw:r=>r.operation},
      {key:"records",label:"Records",num:true,render:r=>fmt(r.records)},
      {key:"data_files",label:"Data files",num:true},
      {key:"is_current",label:"Current",render:r=>r.is_current?el("span",{class:"pill declared"},"current"):"",raw:r=>r.is_current?1:0},
      {key:"snapshot_id",label:"Snapshot ID",cls:"mono"},
    ];
    snapHost.append(sortableTable(scols,it.snapshots,{placeholder:"",sort:"timestamp",dir:1}));
  }
  drawSnaps();

  // how to read
  v.append(el("h3",{},"Read it yourself"));
  v.append(el("pre",{},
`# DuckDB — query a per-table Parquet directly
import duckdb
duckdb.sql("SELECT label, value, unit FROM 'parquet/sample_parameter.parquet' LIMIT 5")

# DuckDB — read the Iceberg table (after unzipping the warehouse)
duckdb.sql("INSTALL iceberg; LOAD iceberg;")
duckdb.sql("SELECT * FROM iceberg_scan('tetrad_v1/idea_sample')")

# PyIceberg — load the warehouse catalog and scan a table
from pyiceberg.catalog import load_catalog   # pip install pyiceberg`));
}

/* =============================================================== Schema & ERD */
const NS="http://www.w3.org/2000/svg";
function svgEl(tag,attrs){ const n=document.createElementNS(NS,tag); if(attrs)for(const k in attrs)n.setAttribute(k,attrs[k]); return n; }
// real (duckdb/iceberg) column type -> short label for the ERD
function typeShort(dt){
  let t=String(dt||"").trim();
  if(!t) return "text";
  const T=t.toUpperCase();
  if(T.startsWith("DECIMAL")) return "decimal";
  return ({
    BIGINT:"int", INTEGER:"int", SMALLINT:"int", TINYINT:"int", HUGEINT:"int",
    DOUBLE:"real", FLOAT:"real",
    VARCHAR:"text", TEXT:"text",
    BOOLEAN:"bool", DATE:"date",
    "TIMESTAMP WITH TIME ZONE":"timestamptz", TIMESTAMP:"timestamp", DATETIME:"datetime",
    // legacy "(intended)" fallbacks
    NUMERIC:"num", REAL:"real", INT:"int",
  })[T] || t.toLowerCase();
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
  const rlegend=releaseLegend();
  rlegend.style.marginTop=".4rem";

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
  card.append(legend,rlegend,toolbar,scroll);
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
      return {name:c, pk:m.is_primary_key==="yes", fk:m.is_foreign_key==="yes", type:m.short_type||typeShort(m.data_type)};
    });
    const idx={}; t.columns.forEach((c,i)=>idx[c]=i);
    model[t.name]={fields, idx, cat:colBy(t.name), nrows:t.nrows, desc:t.desc||t.name, release:t.release||"both"};
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
    const rsym = (RLS[m.release]||RLS.both).sym;
    head.append(Object.assign(svgEl("text",{x:11,y:19}),{textContent: m.release==="both"?name:`${name}  ${rsym}`}));
    const cnt=svgEl("text",{class:"cnt",x:TW-9,y:19,"text-anchor":"end"}); cnt.textContent=`${m.nrows}`;
    head.append(cnt);
    head.append(mkTitle(`${name} — ${m.desc}  ·  ${(RLS[m.release]||RLS.both).label}`));
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
      P.x=Math.max(4, ox+dx); P.y=Math.max(4, oy+dy); // never slide under the top/left edge
      g.setAttribute("transform",`translate(${P.x},${P.y})`);
      if(growForTables()) applyCanvas();               // extend canvas to the right/bottom as needed
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

  /* ---- canvas sizing / zoom / pan ---- */
  // vbW/vbH: the canvas (viewBox) size in user units. It grows to fill the
  // (resizable) container and to contain any table dragged toward the edges,
  // so a table dragged into the newly-revealed area is never clipped by the SVG.
  const state={zoom:1};
  let vbW=contentW, vbH=contentH;
  const zlabel=$("#erd-zlabel");
  function applyCanvas(){
    svg.setAttribute("viewBox",`0 0 ${vbW} ${vbH}`);
    svg.style.width=(vbW*state.zoom)+"px";
    svg.style.height=(vbH*state.zoom)+"px";
    if(zlabel) zlabel.textContent=Math.round(state.zoom*100)+"%";
  }
  function fillToContainer(){
    const cw=(host.clientWidth||0)/state.zoom, ch=(host.clientHeight||0)/state.zoom;
    let changed=false;
    if(cw>vbW){vbW=cw;changed=true;} if(ch>vbH){vbH=ch;changed=true;}
    return changed;
  }
  function growForTables(){
    let changed=false;
    Object.values(L).forEach(l=>{
      if(l.x+l.w+PAD>vbW){vbW=l.x+l.w+PAD;changed=true;}
      if(l.y+l.h+PAD>vbH){vbH=l.y+l.h+PAD;changed=true;}
    });
    return changed;
  }
  function setZoom(z,cx,cy){
    z=Math.max(0.3,Math.min(2,z));
    const prev=state.zoom;
    const px=(cx==null?host.clientWidth/2:cx)+host.scrollLeft;
    const py=(cy==null?host.clientHeight/2:cy)+host.scrollTop;
    state.zoom=z; fillToContainer(); growForTables(); applyCanvas();
    const f=z/prev;
    host.scrollLeft = px*f - (cx==null?host.clientWidth/2:cx);
    host.scrollTop  = py*f - (cy==null?host.clientHeight/2:cy);
  }
  function fit(){
    const avail=(host.clientWidth||contentW)-20;
    state.zoom=Math.max(0.3,Math.min(1.4, avail/contentW));
    vbW=contentW; vbH=contentH; fillToContainer(); growForTables(); applyCanvas();
    host.scrollLeft=0; host.scrollTop=0;
  }
  growForTables(); fillToContainer(); applyCanvas();
  // keep the canvas filling the container when it is resized (drag-handle / window)
  try{
    if(typeof ResizeObserver!=="undefined"){
      if(host._erdRO) host._erdRO.disconnect();
      host._erdRO=new ResizeObserver(()=>{ if(fillToContainer()) applyCanvas(); });
      host._erdRO.observe(host);
    }
  }catch(e){}

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

/* =============================================================== Schema (LinkML) */
function renderLinkml(v){
  const K=M.linkml;
  v.append(el("h2",{},"Schema as LinkML"));
  if(!K){ v.append(el("p",{class:"muted"},"LinkML schema not available in this build.")); return; }
  v.append(el("p",{class:"sec-intro",html:'<b>LinkML</b> (Linked Data Modeling Language) is the schema language the DOE <b>BRIDGE</b> project uses to describe every dataset the same way: classes, typed slots, controlled units and CURIE identifiers, all resolvable to shared base classes. A LinkML schema is both human-readable YAML and machine-actionable — it can generate JSON-Schema, SQL DDL, Python/Pydantic classes, SHACL and documentation, and is what gets registered in the <a href="https://github.com/ber-data/lakehouse-registry" target="_blank" rel="noopener">BRIDGE lakehouse registry</a>. This page is the IDEAS schema rendered against the BRIDGE base model — and the worked example for the first modelling hackathon.'}));

  // stat tiles
  const tiles=el("div",{class:"tiles"});
  const stat=(n,l,s)=>el("div",{class:"tile"},[el("div",{class:"n"},fmt(n)),el("div",{class:"l"},l),s?el("div",{class:"s"},s):null]);
  const nMeas=(K.classes||[]).filter(c=>c.is_measurement).length;
  tiles.append(
    stat(K.n_classes,"Classes","one per table + base classes"),
    stat(K.n_slots,"Slots","typed attributes"),
    stat((K.bases||[]).length,"BRIDGE base classes","shared backbone"),
    stat(nMeas,"Measurement classes","attribute / value / unit"),
  );
  v.append(tiles);

  // schema identity
  const idc=el("div",{class:"card"});
  const dl=el("dl",{class:"kv"});
  const add=(k,val)=>dl.append(el("dt",{},k),el("dd",{},val));
  add("Schema name",el("span",{class:"mono"},K.name));
  add("Schema id",el("span",{class:"mono"},K.schema_id));
  add("Default range",el("span",{class:"mono"},"string"));
  add("Download",el("a",{href:K.download,download:"ideas.linkml.yaml",class:"tag"},"↓ ideas.linkml.yaml"));
  idc.append(el("h3",{style:"margin-top:0"},"Schema identity"),dl);
  v.append(idc);

  // rules checklist
  if(K.rules && K.rules.length){
    v.append(el("h3",{},"BRIDGE modelling rules — and how this schema meets them"));
    v.append(el("p",{class:"muted",style:"margin-top:0"},"The conventions every BRIDGE dataset schema must follow (from the project notes), each with how the IDEAS schema satisfies it."));
    K.rules.forEach(r=>{
      const d=el("div",{class:"rulecard"});
      d.append(el("div",{class:"rc-head"},[el("span",{class:"rc-check"},"✓"),el("b",{},r.rule)]));
      d.append(el("div",{class:"ink2",style:"margin-top:.2rem"},r.how_ideas_meets));
      v.append(d);
    });
  }

  // base classes -> tables
  if(K.bases && K.bases.length){
    v.append(el("h3",{},"The shared base model"));
    v.append(el("p",{class:"muted",style:"margin-top:0"},"BRIDGE models everything against a small set of base classes. Each IDEAS table is declared as a subclass (is_a) of one of these — the same backbone every BRIDGE resource shares."));
    const grid=el("div",{class:"dlgrid"});
    K.bases.forEach(b=>{
      const d=el("div",{class:"dl",style:"cursor:default"});
      const body=el("div",{style:"flex:1"});
      body.append(el("h4",{},b.name));
      body.append(el("div",{class:"ink2",style:"font-size:.84rem;margin:.15rem 0"},b.desc));
      const tw=el("div",{style:"display:flex;gap:.3rem;flex-wrap:wrap;margin-top:.25rem"});
      (b.tables||[]).forEach(tn=>tw.append(TBL[tn]?el("a",{href:"#tables/"+tn,class:"tag mono"},tn):el("span",{class:"tag mono muted"},tn)));
      if(!b.tables||!b.tables.length) tw.append(el("span",{class:"muted"},"—"));
      body.append(tw); d.append(body); grid.append(d);
    });
    v.append(grid);
  }

  // class -> base mapping table
  if(K.classes && K.classes.length){
    v.append(el("h3",{},"Classes"));
    v.append(el("p",{class:"muted",style:"margin-top:0"},"Every table as a LinkML class, its base class, and the release it came from. Measurement classes (the attribute/value/unit pattern) are highlighted — they are the hackathon target."));
    v.append(releaseLegend());
    const cols=[
      {key:"name",label:"Class",cls:"mono",render:r=>el("span",{},[
        r.is_measurement?el("span",{class:"pill declared",title:"measurement (attribute/value/unit) class"},"MEAS"):null,
        r.is_measurement?" ":null, el("a",{href:"#tables/"+r.table},r.name)," ", releaseBadge(r.release)]),raw:r=>r.name},
      {key:"base_class",label:"is_a (base class)",render:r=>el("span",{class:"ink2"},r.base_class)},
      {key:"nrows",label:"Rows",num:true,render:r=>fmt(r.nrows),raw:r=>r.nrows},
      {key:"n_slots",label:"Slots",num:true},
      {key:"base_desc",label:"What the base class represents",render:r=>el("span",{class:"muted"},r.base_desc)},
    ];
    v.append(sortableTable(cols,K.classes,{placeholder:"Search classes…",sort:"name"}));
  }

  // measurement modelling worked example
  const meas=(K.classes||[]).filter(c=>c.is_measurement);
  if(meas.length){
    const c=el("div",{class:"card",style:"border-left:4px solid var(--c-measure)"});
    c.append(el("div",{class:"kicker"},"Hackathon worked example"));
    c.append(el("h3",{style:"margin:.2rem 0 .3rem"},"Modelling a measurement in LinkML"));
    c.append(el("p",{class:"ink2",style:"margin-top:0",html:'BRIDGE models a measurement as an <b>attribute + value + unit</b> triple attached to an observed sample, with the unit carrying an ontology (UCUM) code and provenance recorded on every record. In this schema that pattern is the <code>MeasurementValue</code> base class, realised by:'}));
    const grid=el("div",{class:"dlgrid"});
    meas.forEach(m=>{
      const d=el("div",{class:"dl",style:"cursor:default"}); const b=el("div",{style:"flex:1"});
      b.append(el("h4",{},[el("a",{href:"#tables/"+m.table,class:"mono"},m.name)," ",releaseBadge(m.release)]));
      b.append(el("div",{class:"ink2",style:"font-size:.84rem;margin:.15rem 0"},
        `is_a ${m.base_class} · ${fmt(m.nrows)} rows · ${m.n_slots} slots`));
      // list attribute/value/unit slots if present
      const key=(m.slots||[]).filter(s=>/^(label|value|unit|attribute|value_type)$/i.test(s.name));
      if(key.length){
        const tw=el("div",{style:"display:flex;gap:.3rem;flex-wrap:wrap;margin-top:.2rem"});
        key.forEach(s=>tw.append(el("span",{class:"tag mono",title:s.unit?"unit slot (UCUM-annotated)":s.range},s.name+": "+s.range)));
        b.append(tw);
      }
      d.append(b); grid.append(d);
    });
    c.append(grid);
    // UCUM unit table
    if(K.units && K.units.length){
      c.append(el("h4",{style:"margin:.8rem 0 .2rem"},"Units are UCUM-coded"));
      c.append(el("p",{class:"muted",style:"margin:0 0 .3rem"},"Every unit in the data maps to a machine-readable UCUM code in the schema, so the same quantity is comparable across datasets."));
      const uc=el("div",{style:"display:flex;gap:.4rem;flex-wrap:wrap"});
      K.units.forEach(u=>uc.append(el("span",{class:"tag mono"},`${u.unit} → ${u.ucum}`)));
      c.append(uc);
    }
    v.append(c);
  }

  // prefixes
  if(K.prefixes && K.prefixes.length){
    v.append(el("h3",{},"CURIE prefixes"));
    v.append(el("p",{class:"muted",style:"margin-top:0"},"Identifiers are CURIEs (prefix:local) resolvable via these bioregistry-style prefixes, declared in the schema's prefixes block."));
    const pc=[
      {key:"prefix",label:"Prefix",cls:"mono"},
      {key:"uri",label:"Expands to",cls:"mono",render:r=>/^https?:/.test(r.uri)?el("a",{href:r.uri,target:"_blank",rel:"noopener"},r.uri):r.uri,raw:r=>r.uri},
    ];
    v.append(sortableTable(pc,K.prefixes,{placeholder:"Search prefixes…",sort:"prefix"}));
  }

  // full YAML
  v.append(el("h3",{},"Full LinkML schema (YAML)"));
  v.append(el("p",{class:"muted",style:"margin-top:0"},["The complete generated schema. ",
    el("a",{href:K.download,download:"ideas.linkml.yaml"},"Download ideas.linkml.yaml"),
    " to feed the LinkML toolchain (gen-json-schema, gen-sqlddl, gen-pydantic, gen-owl…)."]));
  const box=el("div",{class:"linkml-yaml"});
  box.append(el("pre",{},K.yaml||""));
  v.append(box);
}

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
      c.append(el("h4",{},[t.name, t.release?releaseBadge(t.release):null,
        t.nrows===0?el("span",{class:"pill info"},"empty"):null]));
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
     [name, t.release?releaseBadge(t.release):null, el("span",{class:"pill",style:`background:transparent;color:${CATCOLOR[catOf(name)]};border:1px solid ${CATCOLOR[catOf(name)]}`},CATLABEL[catOf(name)])]));
  if(t.release && t.release!=="both"){
    head.append(el("p",{class:"muted",style:"margin:.2rem 0 0"},
      t.release==="earlier"
        ? "This table was in the earlier release only — dropped in tetrad_v1 and restored here from the earlier all-TEXT parquet export."
        : "This table was added in the typed tetrad_v1 release."));
  }
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
      const nm = r.is_removed ? el("s",{title:"removed in tetrad_v1"},r.field_name) : r.field_name;
      const b=[nm];
      if(r.release) b.push(" ",releaseBadge(r.release,{removed:r.is_removed}));
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
    {key:"field_name",label:"Field",cls:"mono",render:r=>{const b=[r.is_removed?el("s",{title:"removed in tetrad_v1"},r.field_name):r.field_name];if(r.release)b.push(" ",releaseBadge(r.release,{removed:r.is_removed}));if(r.is_primary_key)b.push(" ",el("span",{class:"pill declared"},"PK"));if(r.is_foreign_key)b.push(" ",el("span",{class:"pill inferred"},"FK"));return el("span",{},b);},raw:r=>r.field_name},
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
/* =============================================================== Measurements */
// Aggregate the EAV measured-value tables into one (parameter × unit) catalogue
// with numeric summaries. Shared by the Measurements tab and the unit reference.
// Drive the catalogue from the backend's union parameter list (M.measurements.eav_parameters),
// which spans BOTH releases: assay readouts (tetrad_v1) + reaction conditions + computed protein
// metrics (earlier release). Each param already carries unit, release, source_table, quantity,
// kind, meaning and numeric min/median/max.
const KIND_GROUP={
  "assay readout":"Assay readout (measured)",
  "condition":"Reaction condition",
  "computed metric":"Computed protein metric",
};
function measureCatalogue(){
  const eav=(M.measurements&&M.measurements.eav_parameters)||[];
  return eav.map(p=>{
    const numeric = p.min!=null;
    const tbl = String(p.source_table||"").replace(/\s*\(earlier\)$/,"");
    return {
      parameter:p.label, unit:p.unit||"", table:tbl, source_table:p.source_table||tbl,
      kind:p.kind||"", release:p.release||"both", quantity:p.quantity||"—",
      meaning:p.meaning||"", numeric, records:p.records||0,
      min:p.min, median:p.median, max:p.max,
      group: KIND_GROUP[p.kind] || (p.unit?(UNIT_GROUP[p.unit]||"Other measured quantity"):"Other measured quantity"),
    };
  });
}
function fmtMeas(x){
  if(x===0) return "0";
  const a=Math.abs(x);
  if(a>=1e4||a<1e-3) return x.toExponential(2);
  return String(Math.round(x*1e4)/1e4);
}
function renderMeasure(v){
  v.append(el("h2",{},"Measurements & observations"));
  v.append(el("p",{class:"sec-intro",html:'This is the heart of the dataset and the current focus of the BRIDGE Data Modeling Team (see <a href="#project">The Project</a>). A <b>measurement / observation</b> is a value produced by an <b>instrument or assay</b> against a <b>sample</b>. Here that is modelled in two layers: <code>idea_measurement</code> records each measurement <b>event</b> (what was run, on which sample, from which raw file), and the measured <b>values</b> are held as label / value / unit rows — the entity–attribute–value (EAV) pattern — in <code>sample_parameter</code> (assay readouts + reaction conditions) and <code>protein_parameter</code> (computed protein metrics). Categories below are grouped by kind of measurement, and each parameter is flagged by the release it came from.'}));

  /* ---- hackathon framing (drawn from the project notes) ---- */
  const HK=M.hackathon;
  if(HK){
    const c=el("div",{class:"card",style:"border-left:4px solid var(--accent)"});
    c.append(el("div",{class:"kicker"},"Hackathon focus"));
    c.append(el("h3",{style:"margin:.2rem 0 .1rem"},HK.title));
    c.append(el("p",{class:"muted",style:"margin:0 0 .5rem"},HK.when));
    if(HK.focus) c.append(el("p",{class:"ink2",style:"margin:.2rem 0"},[el("b",{},"Goal: "),HK.focus]));
    if(HK.pattern && HK.pattern.length){
      c.append(el("h4",{style:"margin:.7rem 0 .2rem"},"The measurement modelling pattern"));
      const ul=el("ul",{class:"proselist"}); HK.pattern.forEach(x=>ul.append(el("li",{class:"ink2"},x))); c.append(ul);
    }
    const two=el("div",{class:"dlgrid"});
    if(HK.homework && HK.homework.length){
      const d=el("div",{class:"dl",style:"cursor:default"}); const b=el("div",{style:"flex:1"});
      b.append(el("h4",{},"Come prepared with"));
      const ul=el("ul",{class:"proselist",style:"margin:.2rem 0 0"}); HK.homework.forEach(x=>ul.append(el("li",{class:"ink2"},x))); b.append(ul);
      d.append(b); two.append(d);
    }
    if(HK.how_this_dataset_helps){
      const d=el("div",{class:"dl",style:"cursor:default"}); const b=el("div",{style:"flex:1"});
      b.append(el("h4",{},"How this dataset helps"));
      b.append(el("div",{class:"ink2",style:"font-size:.86rem;margin-top:.2rem"},HK.how_this_dataset_helps));
      b.append(el("div",{style:"margin-top:.4rem"},el("a",{href:"#linkml",class:"tag"},"→ See the LinkML schema tab")));
      d.append(b); two.append(d);
    }
    c.append(two);
    v.append(c);
  }

  v.append(releaseLegend());

  /* ---- measurement events (idea_measurement) ---- */
  const MM=(M.measurements||{});
  if(MM.events_by_type && MM.events_by_type.length){
    v.append(el("h3",{},"Measurement events"));
    v.append(el("p",{class:"muted",style:"margin-top:0"},`${fmt(MM.n_events)} measurement events in idea_measurement — each is one instrument run against one sample, linked to the values it produced in sample_parameter.`));
    const ewrap=el("div",{class:"tiles"});
    MM.events_by_type.forEach(e=>ewrap.append(
      el("div",{class:"tile"},[el("div",{class:"n"},fmt(e.count)),el("div",{class:"l"},e.type),el("div",{class:"s"},"measurement events")])
    ));
    v.append(ewrap);
  }

  v.append(el("h3",{},"Measured parameters (values)"));
  const params=measureCatalogue();
  const numeric=params.filter(p=>p.numeric);
  const units=new Set(params.filter(p=>p.unit).map(p=>p.unit));
  const totalRecords=params.reduce((s,p)=>s+p.records,0);

  const tiles=el("div",{class:"tiles"});
  const stat=(n,l,s)=>el("div",{class:"tile"},[el("div",{class:"n"},fmt(n)),el("div",{class:"l"},l),s?el("div",{class:"s"},s):null]);
  tiles.append(
    stat(params.length,"Measured parameters","distinct label × unit"),
    stat(totalRecords,"Measured records","label/value/unit rows"),
    stat(numeric.length,"Numeric parameters",`${params.length-numeric.length} categorical`),
    stat(units.size,"Distinct units","see Ontologies & Units"),
  );
  v.append(tiles);

  /* by-category summary */
  v.append(el("h3",{},"By measurement category"));
  const groups={};
  params.forEach(p=>{ (groups[p.group]=groups[p.group]||[]).push(p); });
  const gorder=["Assay readout (measured)","Reaction condition","Computed protein metric","Other measured quantity"];
  const gkeys=Object.keys(groups).sort((a,b)=>{
    const ia=gorder.indexOf(a), ib=gorder.indexOf(b);
    return (ia<0?99:ia)-(ib<0?99:ib);
  });
  const gwrap=el("div",{class:"dlgrid"});
  gkeys.forEach(g=>{
    const ps=groups[g];
    const gunits=[...new Set(ps.filter(p=>p.unit).map(p=>p.unit))];
    const c=el("div",{class:"dl",style:"cursor:default"});
    const body=el("div",{style:"flex:1"});
    body.append(el("h4",{},[g," ",el("span",{class:"pill inferred"},String(ps.length))]));
    body.append(el("div",{class:"ink2",style:"font-size:.82rem;margin:.15rem 0"},
      gunits.length?("Units: "+gunits.join(", ")):"no unit (categorical / unitless)"));
    body.append(el("div",{class:"sz"},ps.slice(0,4).map(p=>p.parameter).join(", ")+(ps.length>4?" …":"")));
    c.append(body); gwrap.append(c);
  });
  v.append(gwrap);

  /* full catalogue */
  v.append(el("h3",{},"All measured parameters"));
  v.append(el("p",{class:"muted",style:"margin-top:0"},"Search or sort by any column — including category, unit, or release. Min / median / max are computed from the numeric values; “—” marks non-numeric (categorical) parameters. The release badge marks which dataset each parameter came from (＋ tetrad_v1 assay readouts, − earlier conditions & protein metrics)."));
  const cols=[
    {key:"parameter",label:"Parameter",cls:"mono",render:r=>el("span",{},[r.parameter," ",releaseBadge(r.release)]),raw:r=>r.parameter},
    {key:"group",label:"Category",render:r=>el("span",{class:"ink2"},r.group)},
    {key:"unit",label:"Unit",cls:"mono",render:r=>r.unit?r.unit:el("span",{class:"muted"},"—"),raw:r=>r.unit},
    {key:"quantity",label:"Quantity",render:r=>el("span",{class:"ink2"},r.quantity),raw:r=>r.quantity},
    {key:"table",label:"Source table",cls:"mono",render:r=>TBL[r.table]?el("a",{href:"#tables/"+r.table},r.source_table):r.source_table,raw:r=>r.source_table},
    {key:"type",label:"Type",render:r=>r.numeric?"numeric":"categorical",raw:r=>r.numeric?1:0},
    {key:"min",label:"Min",num:true,render:r=>r.numeric?fmtMeas(r.min):"—",raw:r=>r.numeric?r.min:null},
    {key:"median",label:"Median",num:true,render:r=>r.numeric?fmtMeas(r.median):"—",raw:r=>r.numeric?r.median:null},
    {key:"max",label:"Max",num:true,render:r=>r.numeric?fmtMeas(r.max):"—",raw:r=>r.numeric?r.max:null},
    {key:"records",label:"Records",num:true},
    {key:"meaning",label:"Meaning",render:r=>el("span",{class:"ink2"},r.meaning),raw:r=>r.meaning},
  ];
  v.append(sortableTable(cols,params,{placeholder:"Search measured parameters…",sort:"group",exportName:"ideas_measurements.csv"}));
}

function renderOnto(v){
  v.append(el("h2",{},"Ontologies, cross-references & units"));
  v.append(el("p",{class:"sec-intro"},["How the dataset connects to the wider world: a UCUM-coded reference for every unit, external database cross-references with live links, and the chemical / biological identifier notations used — each mapped to the fields that carry it and to its authoritative registry or specification. The measured quantities recorded in these units are catalogued in the ",
    el("a",{href:"#measure"},"Measurements"),
    " tab."]));

  /* ---------- unit -> parameters map (drives the unit reference "Used by") ---------- */
  const usedByUnit={};
  measureCatalogue().forEach(a=>{ if(a.unit){ (usedByUnit[a.unit]=usedByUnit[a.unit]||[]).push(a.parameter); } });

  /* ---------- 1. Unit reference (UCUM) ---------- */
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

  /* ---------- 2. External database cross-references ---------- */
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

  /* ---------- 3. Chemical & biological identifier notations ---------- */
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
  "intensity (a.u.)":{name:"Intensity (arbitrary units)",quantity:"Mass-spec peak intensity",dim:"dimensionless (a.u.)",ucum:"{a.u.}"},
};
// measurement category per unit (coarse grouping for the Measurements tab, grounded in the unit's physical quantity)
const UNIT_GROUP={
  mM:"Concentration", "mg/L":"Concentration",
  uL:"Volume",
  C:"Incubation condition", h:"Incubation condition", rpm:"Incubation condition",
  angstrom:"Structural prediction", score:"Structural / model score",
  log_likelihood_ratio:"Sequence-model score",
  relative_abundance:"Proteomics readout (abundance)",
  fold:"Proteomics readout (fold-change)",
  intensity:"Proteomics readout (intensity)",
  ratio:"Ratio / fraction", "%":"Ratio / fraction",
  "intensity (a.u.)":"Proteomics readout (intensity)",
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
  const rows=M.tables.map(t=>({name:t.name,release:t.release,nrows:t.nrows,ncols:t.ncols,completeness:t.completeness,
     empties:t.col_meta.filter(c=>c.missing_percent===100 && !c.is_removed).length}));
  const cols=[
    {key:"name",label:"Table",cls:"mono",render:r=>el("span",{},[el("a",{href:"#tables/"+r.name},r.name),r.release?el("span",{},[" ",releaseBadge(r.release)]):null]),raw:r=>r.name},
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
  v.append(el("p",{class:"sec-intro",html:"Everything below is generated by the portal's reproducible pipeline (<code>analyze_iceberg.py</code>) from the <b>union</b> of both releases — the typed <code>tetrad_v1</code> Iceberg warehouse overlaid on the earlier all-TEXT release, so nothing is lost. You can download each raw release, the typed union database, the field-level data dictionary, and the LinkML schema. For per-table Parquet and the full snapshot history, see the <a href='#explore'>Iceberg &amp; Files</a> page."}));

  const groups=[
    ["Typed data (source)", [
      ["tetrad_v1_iceberg.zip","Apache Iceberg warehouse — tetrad_v1 (ZIP)","downloads/tetrad_v1_iceberg.zip",
        "The newer typed release: every surviving table's Parquet data + Iceberg metadata and all snapshots. Read with PyIceberg, Spark, or DuckDB's <code>iceberg</code> extension. Real column types preserved.","zip"],
      ["ideas_earlier_parquet.zip","Earlier release — Parquet (ZIP)","downloads/ideas_earlier_parquet.zip",
        "The earlier all-TEXT release restored here: the 9 tables dropped in tetrad_v1 (protein metrics, mutants, AI design, methods, people…) plus the earlier sample_parameter reaction conditions, as Parquet.","zip"],
      ["ideas.db","SQLite database (typed, union)","downloads/ideas.db",
        "All 21 tables of the union as a ready-to-query SQLite file with real types (INTEGER / REAL / TEXT). Open with <code>sqlite3 ideas.db</code>, DB Browser, pandas or DuckDB.","db"],
      ["ideas_dump.sql","SQL dump (schema + all data)","downloads/ideas_dump.sql",
        "Complete SQL dump: CREATE TABLE statements plus every row. Restore with <code>sqlite3 ideas.db &lt; ideas_dump.sql</code>.","db"],
      ["metadata.json","Full portal metadata (JSON)","downloads/metadata.json",
        "The complete analysis bundle powering this site: typed union schema, stats, relationships, findings, units, cross-refs, release-change flags, the LinkML schema, the BRIDGE project model, and all rows.","json"],
    ]],
    ["Schema", [
      ["ideas.linkml.yaml","LinkML schema (YAML)","downloads/ideas.linkml.yaml",
        "The full dataset modelled in <b>LinkML</b> against the BRIDGE base classes — typed slots, UCUM-coded units, CURIE prefixes. Feed to <code>gen-json-schema</code>, <code>gen-sqlddl</code>, <code>gen-pydantic</code>, <code>gen-owl</code>. See the <a href='#linkml'>Schema (LinkML)</a> tab.","file"],
    ]],
    ["Data dictionary", [
      ["data_dictionary.csv","Data dictionary (CSV)","downloads/data_dictionary.csv",
        "Every field with real type, keys, role, description, ontology, distinct/missing counts and interpretation confidence.","csv"],
      ["data_dictionary.tsv","Data dictionary (TSV)","downloads/data_dictionary.tsv",
        "The same field-level dictionary, tab-separated for spreadsheet / awk pipelines.","csv"],
      ["data_dictionary.enriched.json","Data dictionary (JSON)","downloads/data_dictionary.enriched.json",
        "Structured JSON dictionary including per-column stats, roles and ontology hints.","json"],
    ]],
  ];
  const fileSize={}; M.files.forEach(f=>fileSize[f.name]=f.bytes);
  groups.forEach(([gname,items])=>{
    v.append(el("h3",{},gname));
    const grid=el("div",{class:"dlgrid"});
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
  });

  v.append(el("h3",{},"Quick start"));
  v.append(el("pre",{},
`# Query the typed SQLite database
sqlite3 ideas.db "SELECT name, source_organism FROM idea_protein;"

# Or query a per-table Parquet directly with duckdb / pandas (see Iceberg & Files)
python3 -c "import duckdb; print(duckdb.sql(\\"SELECT label,value,unit FROM 'parquet/sample_parameter.parquet' LIMIT 5\\"))"

# Example join: every measured value with its sample context
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
