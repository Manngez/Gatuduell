'use strict';
(() => {
  const L=globalThis.L;
  const E=globalThis.UmeaStreetEngine;
  if(!L||!E) throw new Error('Kartmotorn kunde inte starta.');

  const CENTRAL={minLat:63.78,maxLat:63.87,minLon:20.13,maxLon:20.37};
  const originalMap=L.map.bind(L);
  const originalTileLayer=L.tileLayer.bind(L);
  const originalPolyline=L.polyline.bind(L);
  const originalFlyToBounds=L.Map.prototype.flyToBounds;
  let manualFocusUntil=0;

  // Behåll Leaflets vanliga mobilbeteende. Framför allt ska pinch-zoom följa
  // fingrarna och inte behöva rita om hela Umeås gatunät under gesten.
  L.map=function createStableMap(id,options={}){
    const map=originalMap(id,{
      ...options,
      inertia:true,
      touchZoom:true,
      zoomSnap:0,
      zoomDelta:.25,
      zoomAnimation:true,
      fadeAnimation:true,
      markerZoomAnimation:true,
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

  // Använd en vanlig rasterbaskarta. Den tidigare versionen byggde hela Umeås
  // gatunät som ett enda tungt canvaslager, vilket gjorde pinch-zoom ryckig.
  L.tileLayer=function createFastBaseMap(url,options={}){
    return originalTileLayer(url,{
      ...options,
      updateWhenZooming:false,
      updateWhenIdle:true,
      keepBuffer:4
    });
  };

  // Spelade gator ligger i ett separat lager ovanför baskartan.
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
