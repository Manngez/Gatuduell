'use strict';
(() => {
  const L=globalThis.L;
  const E=globalThis.UmeaStreetEngine;
  if(!L||!E) throw new Error('Kartmotorn kunde inte starta.');

  const CENTRAL={minLat:63.78,maxLat:63.87,minLon:20.13,maxLon:20.37};
  const originalBuildGraph=E.buildGraph.bind(E);
  const originalMap=L.map.bind(L);
  const originalFlyToBounds=L.Map.prototype.flyToBounds;
  let graph=null;
  let manualFocusUntil=0;

  E.buildGraph=function buildGraphAndKeep(features,options){
    graph=originalBuildGraph(features,options);
    return graph;
  };

  L.map=function createStableVectorMap(id,options={}){
    const map=originalMap(id,{
      ...options,
      preferCanvas:true,
      inertia:false,
      touchZoom:'center',
      zoomAnimation:false,
      fadeAnimation:false,
      markerZoomAnimation:false,
      bounceAtZoomLimits:false
    });
    map.whenReady(()=>{
      map.dragging.enable();
      map.touchZoom.enable();
      map.doubleClickZoom.enable();
      const container=map.getContainer();
      container.style.touchAction='none';
      container.style.overscrollBehavior='none';
      container.style.background='#f5f7f8';
      L.control.attribution({position:'bottomright',prefix:false})
        .addAttribution('Gator: Umeå Open Data / NVDB')
        .addTo(map);
    });
    return map;
  };

  // Appen anropar L.tileLayer, men vi returnerar i stället ett enda vektorlager
  // byggt av samma Umeå-data som spelmotorn. Ingen extern baskarta laddas.
  L.tileLayer=function createUmeaStreetLayer(){
    if(!graph?.names?.length) return L.layerGroup();
    const lines=[];
    for(const name of graph.names){
      const street=graph.get(name);
      for(const coords of street?.lines||[]){
        if(coords.length<2) continue;
        lines.push(coords.map(([lon,lat])=>[lat,lon]));
      }
    }
    const renderer=L.canvas({padding:.65,tolerance:4});
    return L.polyline(lines,{
      renderer,
      interactive:false,
      color:'#b8c1c7',
      weight:2,
      opacity:.8,
      smoothFactor:1.2,
      lineCap:'round',
      lineJoin:'round'
    });
  };

  // Spelet får inte flytta kartan automatiskt mellan turerna.
  // Endast användarens ◎-knapp får centrera på den röda gatan.
  L.Map.prototype.flyToBounds=function userControlledFlyToBounds(bounds,options={}){
    if(Date.now()>manualFocusUntil) return this;
    return originalFlyToBounds.call(this,bounds,{...options,animate:false});
  };

  const allowManualFocus=event=>{
    if(event.target?.closest?.('#recenterBtn')) manualFocusUntil=Date.now()+1500;
  };
  document.addEventListener('pointerdown',allowManualFocus,true);
  document.addEventListener('click',allowManualFocus,true);

  const originalChooseStart=E.chooseStart.bind(E);
  E.chooseStart=function chooseCentralUmeaStart(currentGraph,random=Math.random){
    if(!currentGraph?.names?.length) return originalChooseStart(currentGraph,random);
    const candidates=currentGraph.names.filter(name=>{
      const street=currentGraph.get(name);
      const degree=currentGraph.neighbors(name).length;
      if(degree<2||degree>14) return false;
      return (street?.lines||[]).some(line=>line.some(([lon,lat])=>
        lat>=CENTRAL.minLat&&lat<=CENTRAL.maxLat&&lon>=CENTRAL.minLon&&lon<=CENTRAL.maxLon
      ));
    });
    const pool=candidates.length?candidates:currentGraph.names;
    const r=Math.max(0,Math.min(.999999,Number(random())||0));
    return pool[Math.floor(r*pool.length)]||originalChooseStart(currentGraph,random);
  };
})();
