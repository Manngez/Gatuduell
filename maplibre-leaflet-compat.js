'use strict';
(() => {
  if (!window.maplibregl) throw new Error('MapLibre saknas');

  let groupSeq = 0;

  class Handler {
    constructor(enableFn, disableFn){ this.enableFn=enableFn; this.disableFn=disableFn; }
    enable(){ try{ this.enableFn?.(); }catch{} }
    disable(){ try{ this.disableFn?.(); }catch{} }
  }

  class Bounds {
    constructor(){ this.w=Infinity; this.s=Infinity; this.e=-Infinity; this.n=-Infinity; }
    extendLatLng([lat,lon]){ this.w=Math.min(this.w,lon); this.s=Math.min(this.s,lat); this.e=Math.max(this.e,lon); this.n=Math.max(this.n,lat); return this; }
    pad(r){
      if(!Number.isFinite(this.w)) return this;
      const dx=(this.e-this.w)*r, dy=(this.n-this.s)*r;
      const b=new Bounds(); b.w=this.w-dx; b.e=this.e+dx; b.s=this.s-dy; b.n=this.n+dy; return b;
    }
    toArray(){ return [[this.w,this.s],[this.e,this.n]]; }
  }

  class MapWrapper {
    constructor(container,opts={}){
      this._map = new maplibregl.Map({
        container,
        style:'https://tiles.openfreemap.org/styles/positron',
        center:[20.263,63.826],
        zoom:13,
        minZoom:opts.minZoom ?? 8,
        maxZoom:opts.maxZoom ?? 19,
        dragRotate:false,
        pitchWithRotate:false,
        touchPitch:false,
        attributionControl:true,
        interactive:true,
        cooperativeGestures:false,
        fadeDuration:0
      });
      this._ready = false;
      this._pending = [];
      this._map.touchZoomRotate?.disableRotation?.();
      this._map.on('load',()=>{
        this._ready=true;
        this._hideLabels();
        for(const fn of this._pending.splice(0)) try{ fn(); }catch(e){ console.error(e); }
      });
      this._map.on('styledata',()=>this._hideLabels());

      this.dragging = new Handler(()=>this._map.dragPan.enable(),()=>this._map.dragPan.disable());
      this.touchZoom = new Handler(()=>this._map.touchZoomRotate.enable(),()=>this._map.touchZoomRotate.disable());
      this.doubleClickZoom = new Handler(()=>this._map.doubleClickZoom.enable(),()=>this._map.doubleClickZoom.disable());
      this.boxZoom = new Handler(()=>this._map.boxZoom.enable(),()=>this._map.boxZoom.disable());
      this.keyboard = new Handler(()=>this._map.keyboard.enable(),()=>this._map.keyboard.disable());
      this.scrollWheelZoom = new Handler(()=>this._map.scrollZoom.enable(),()=>this._map.scrollZoom.disable());
    }
    _hideLabels(){
      try{
        const style=this._map.getStyle();
        for(const layer of style?.layers||[]){
          if(layer.type==='symbol' && this._map.getLayoutProperty(layer.id,'visibility')!=='none'){
            this._map.setLayoutProperty(layer.id,'visibility','none');
          }
        }
      }catch{}
    }
    whenReady(fn){ if(this._ready && this._map.isStyleLoaded()) fn(); else this._pending.push(fn); }
    setView(latlng,zoom,options={}){
      const center=[latlng[1],latlng[0]];
      const cfg={center,zoom};
      options?.animate ? this._map.easeTo({...cfg,duration:300}) : this._map.jumpTo(cfg);
      return this;
    }
    invalidateSize(){ this._map.resize(); return this; }
    fitBounds(bounds,options={}){
      const b=bounds?.toArray?bounds.toArray():bounds;
      if(!b) return this;
      const padding=Math.max(18,Math.round((options.padding||0) || 42));
      this._map.fitBounds(b,{padding,maxZoom:options.maxZoom ?? 16,duration:options.animate===false?0:220});
      return this;
    }
    addControl(control,position){ this._map.addControl(control,position); return this; }
    triggerRepaint(){ this._map.triggerRepaint(); }
    get raw(){ return this._map; }
  }

  class TileLayer {
    addTo(map){ this.map=map; return this; }
    redraw(){ try{ this.map?._map?.resize(); this.map?._map?.triggerRepaint(); }catch{} return this; }
  }

  class PolylineSpec {
    constructor(latlngs,style={}){ this.latlngs=latlngs; this.style=style; }
  }

  class FeatureGroup {
    constructor(layers=[]){ this.layers=layers; this.map=null; this.ids=[]; this.removed=false; }
    addTo(map){
      this.map=map;
      map.whenReady(()=>{
        if(this.removed) return;
        const grouped=new Map();
        for(const line of this.layers){
          const s=line.style||{};
          const key=JSON.stringify({color:s.color||'#27c7ba',weight:s.weight||5,opacity:s.opacity??1});
          if(!grouped.has(key)) grouped.set(key,{style:s,features:[]});
          grouped.get(key).features.push({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:line.latlngs.map(([lat,lon])=>[lon,lat])}});
        }
        for(const {style,features} of grouped.values()){
          const sourceId=`gd-src-${++groupSeq}`;
          const layerId=`gd-line-${groupSeq}`;
          map._map.addSource(sourceId,{type:'geojson',data:{type:'FeatureCollection',features}});
          map._map.addLayer({
            id:layerId,
            type:'line',
            source:sourceId,
            layout:{'line-cap':'round','line-join':'round'},
            paint:{
              'line-color':style.color||'#27c7ba',
              'line-width':style.weight||5,
              'line-opacity':style.opacity??1
            }
          });
          this.ids.push({layerId,sourceId});
        }
      });
      return this;
    }
    remove(){
      this.removed=true;
      if(!this.map) return;
      for(const {layerId,sourceId} of this.ids.slice().reverse()){
        try{ if(this.map._map.getLayer(layerId)) this.map._map.removeLayer(layerId); }catch{}
        try{ if(this.map._map.getSource(sourceId)) this.map._map.removeSource(sourceId); }catch{}
      }
      this.ids=[];
    }
    getBounds(){
      const b=new Bounds();
      for(const line of this.layers) for(const ll of line.latlngs) b.extendLatLng(ll);
      return b;
    }
  }

  window.L = {
    map:(container,opts)=>new MapWrapper(container,opts),
    tileLayer:()=>new TileLayer(),
    polyline:(latlngs,style)=>new PolylineSpec(latlngs,style),
    featureGroup:layers=>new FeatureGroup(layers),
    control:{
      zoom:()=>({addTo(map){ map.addControl(new maplibregl.NavigationControl({showCompass:false,showZoom:true}),'bottom-right'); return this; }})
    }
  };
})();
