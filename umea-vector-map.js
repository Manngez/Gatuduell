'use strict';
(() => {
  const L=globalThis.L;
  const E=globalThis.UmeaStreetEngine;
  if(!L||!E) throw new Error('Kartmotorn kunde inte starta.');

  const CENTRAL={minLat:63.78,maxLat:63.87,minLon:20.13,maxLon:20.37};
  const originalBuildGraph=E.buildGraph.bind(E);
  const originalMap=L.map.bind(L);
  const originalPolyline=L.polyline.bind(L);
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
      touchZoom:true,
      zoomSnap:0,
      zoomDelta:.25,
      zoomAnimation:true,
      fadeAnimation:false,
      markerZoomAnimation:false,
      bounceAtZoomLimits:false
    });

    if(!map.getPane('streetRoutePane')){
      const routePane=map.createPane('streetRoutePane');
      routePane.style.zIndex='650';
      routePane.style.pointerEvents='none';
    }

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

  // Alla spelade gator läggs i ett eget översta lager så att de alltid syns.
  // Tidigare val blir röda; den aktuella gatan får en vit kant och starkare röd kärna.
  L.polyline=function createGamePolyline(latlngs,options={}){
    const color=String(options?.color||'').toLowerCase();
    const isPrevious=color==='#7b8791';
    const isCurrentOutline=color==='#ffffff';
    const isCurrent=color==='#e53935';
    if(!isPrevious&&!isCurrentOutline&&!isCurrent) return originalPolyline(latlngs,options);

    const styled={...options,pane:'streetRoutePane'};
    if(isPrevious) Object.assign(styled,{color:'#e53935',weight:5,opacity:.72});
    if(isCurrentOutline) Object.assign(styled,{color:'#ffffff',weight:13,opacity:.98});
    if(isCurrent) Object.assign(styled,{color:'#d91f1f',weight:8,opacity:1});
    return originalPolyline(latlngs,styled);
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
