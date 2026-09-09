import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Small DOM model: mutations are delivered asynchronously just as in a browser.
function effectsHarness(blockStorage=false){
  const observers=[], pending=new Set(), elements=new Map();
  function notify(target,type,attributeName){
    for(const observer of observers) for(const {node,options} of observer.targets){
      let matches=target===node;
      if(options.subtree)for(let p=target.parent;p;p=p.parent)if(p===node)matches=true;
      if(matches&&options[type]&&(!options.attributeFilter||options.attributeFilter.includes(attributeName)))pending.add(observer);
    }
  }
  class Element{
    constructor(){this.style=new Proxy({}, {set:(obj,k,v)=>{obj[k]=v;notify(this,'attributes','style');return true}});this.dataset={};this.children=[];this._hidden=false;this._text='';this.classes=new Set();this.classList={add:(x)=>{this.classes.add(x);notify(this,'attributes','class')},remove:(x)=>{this.classes.delete(x);notify(this,'attributes','class')},contains:x=>this.classes.has(x),toggle:(x,on)=>{on?this.classes.add(x):this.classes.delete(x);notify(this,'attributes','class')}};}
    set hidden(v){this._hidden=v;notify(this,'attributes','hidden')} get hidden(){return this._hidden}
    set textContent(v){this._text=v;notify(this,'childList')} get textContent(){return this._text}
    appendChild(n){n.parent=this;this.children.push(n);notify(this,'childList');return n}
    setAttribute(k,v){this[k]=v;notify(this,'attributes',k)}
    addEventListener(){} querySelectorAll(){return []} querySelector(){return null}
  }
  const body=new Element();
  const el=id=>{if(!elements.has(id)){const node=new Element();body.appendChild(node);elements.set(id,node)}return elements.get(id)};
  for(const id of ['gameScreen','resultModal','message','roundNo','currentStreet','resultTitle','resultText','playerStrip','timerTrack','timerBar','streetInput','answerForm','composer','street-meta','street-hud'])el(id);
  el('gameScreen').hidden=true;el('resultModal').hidden=true;
  const document={body,getElementById:el,createElement:()=>new Element(),querySelector:s=>s==='.map-preview'?null:s.startsWith('.')?el(s.slice(1)):null,querySelectorAll:()=>[],addEventListener(){}};
  class MutationObserver{constructor(cb){this.cb=cb;this.targets=[];observers.push(this)}observe(node,options){this.targets.push({node,options})}}
  const context={document,MutationObserver,localStorage:{getItem(){if(blockStorage)throw Error('blocked');return '0'},setItem(){}},setInterval(){},setTimeout(){},clearTimeout(){},navigator:{},matchMedia:()=>({matches:true}),console};context.window=context;
  vm.runInNewContext(fs.readFileSync(new URL('../attractive.js',import.meta.url),'utf8'),context);
  return {el,flush(){let deliveries=0;while(pending.size){assert.ok(++deliveries<25,'Effects must settle instead of observing their own writes');const batch=[...pending];pending.clear();for(const observer of batch)observer.cb([])}return deliveries}};
}

test('effects settle after startup, game entry, a turn change and exit',()=>{
  const h=effectsHarness();h.flush();
  h.el('gameScreen').hidden=false;h.el('message').textContent='Albin: skriv nästa gata.';h.flush();
  h.el('message').textContent='Magnus: skriv nästa gata.';h.flush();
  h.el('gameScreen').hidden=true;h.flush();
});
test('effects work when browser storage is unavailable',()=>{effectsHarness(true).flush()});
