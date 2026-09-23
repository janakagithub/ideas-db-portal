// Minimal DOM shim to execute app.js render paths headlessly and catch runtime errors.
const fs = require("fs");
const META = JSON.parse(fs.readFileSync(__dirname + "/site/metadata.json", "utf8"));

function makeNode(tag, ns) {
  const n = {
    tagName: (tag||"").toUpperCase(), ns, children: [], _attrs: {}, _listeners: {},
    style: {}, dataset: {}, className: "", _html: "", _text: "",
    classList: { _s: new Set(),
      add(...c){c.forEach(x=>this._s.add(x));}, remove(...c){c.forEach(x=>this._s.delete(x));},
      toggle(c,f){ if(f===undefined)f=!this._s.has(c); f?this._s.add(c):this._s.delete(c); return f;},
      contains(c){return this._s.has(c);} },
    append(...ks){ ks.forEach(k=>{ if(k==null)return; if(typeof k==="object"&&k.nodeType!==undefined){this.children.push(k);} else {this.children.push({nodeType:3,text:String(k)});} }); },
    appendChild(k){ this.append(k); return k; },
    addEventListener(ev,fn){ (this._listeners[ev]=this._listeners[ev]||[]).push(fn); },
    setAttribute(k,v){ this._attrs[k]=String(v); if(k==="class")this.className=v; },
    getAttribute(k){ return this._attrs[k]; },
    removeAttribute(k){ delete this._attrs[k]; },
    querySelector(sel){ return findIn(this,sel) || makeNode("stub"); },
    querySelectorAll(){ return []; },
    remove(){}, click(){},
    nodeType: 1,
    get firstChild(){return this.children[0];},
  };
  Object.defineProperty(n, "innerHTML", { get(){return n._html;}, set(v){n._html=String(v); n.children=[];} });
  Object.defineProperty(n, "textContent", { get(){return n._text;}, set(v){n._text=String(v); n.children=[];} });
  return n;
}
function findIn(node, sel){
  // supports #id and .class and tag, shallow-ish recursive
  function match(n){
    if(!n||n.nodeType!==1) return false;
    if(sel[0]==="#") return n._attrs.id===sel.slice(1);
    if(sel[0]===".") return (n.className||"").split(/\s+/).includes(sel.slice(1)) || n.classList._s.has(sel.slice(1));
    return n.tagName===sel.toUpperCase();
  }
  const stack=[...(node.children||[])];
  while(stack.length){ const c=stack.shift(); if(c.nodeType===1){ if(match(c))return c; stack.push(...(c.children||[])); } }
  return null;
}

const registry = {};
const document = {
  _root: makeNode("body"),
  createElement(t){ return makeNode(t); },
  createElementNS(ns,t){ return makeNode(t,ns); },
  createTextNode(s){ return {nodeType:3, text:String(s)}; },
  querySelector(sel){
    if(sel==="#app") return registry.app;
    if(sel==="#nav") return registry.nav;
    if(sel==="#theme") return registry.theme;
    if(sel===".view.on") return findIn(registry.app,".view");
    return findIn(document._root, sel) || registry.app.querySelector(sel);
  },
  body: null, documentElement: makeNode("html"),
};
document.body = document._root;
registry.app = makeNode("main"); registry.app.setAttribute("id","app");
registry.nav = makeNode("nav"); registry.nav.setAttribute("id","nav");
registry.theme = makeNode("button"); registry.theme.setAttribute("id","theme");
document._root.append(registry.app, registry.nav, registry.theme);

global.document = document;
const _win = { _l:{}, addEventListener(ev,fn){ (this._l[ev]=this._l[ev]||[]).push(fn); }, scrollTo(){}, matchMedia:()=>({matches:false}) };
global.window = _win;
global.location = { hash: "" };
global.localStorage = { getItem(){return null;}, setItem(){}, };
global.matchMedia = global.window.matchMedia;
global.URL = { createObjectURL(){return "blob:x";} };
global.Blob = function(){};
global.fetch = (url) => Promise.resolve({ json: () => Promise.resolve(META) });
global.requestAnimationFrame = (f)=>f();
global.Node = { prototype:{} };

// load app.js
require("./site/app.js");

function fire(ev){ (_win._l[ev]||[]).forEach(f=>f()); }
setTimeout(()=>{
  const views = ["overview","schema","tables","dict","rel","measure","onto","quality","download",
                 "tables/idea_protein","tables/sample_parameter","tables/idea_lab"];
  let fail=0;
  console.log("nav buttons:", registry.nav.children.length, "| app children after boot:", registry.app.children.length);
  for(const v of views){
    try{ global.location.hash = v; fire("hashchange");
      const n = registry.app.children.length;
      if(n===0) throw new Error("empty render");
      console.log("OK  "+v+"  (#app children="+n+")");
    }catch(e){ console.log("FAIL "+v+"  -> "+e.message+"\n"+(e.stack||"").split("\n").slice(1,3).join("\n")); fail++; }
  }
  // exercise theme toggle + a table's internal search rerender
  try{ (registry.theme._listeners.click||[]).forEach(f=>f()); console.log("OK  theme toggle"); }catch(e){ console.log("FAIL theme "+e.message); fail++; }
  console.log(fail? ("\n"+fail+" FAILURES") : "\nALL VIEWS RENDERED OK");
}, 60);
