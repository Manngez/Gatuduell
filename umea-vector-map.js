'use strict';
(() => {
  const L=globalThis.L;
  const E=globalThis.UmeaStreetEngine;
  if(!L||!E) throw new Error('Kartmotorn kunde inte starta.');

  const CENTRAL={minLat:63.78,maxLat:63.87,minLon:20.13,maxLon:20.37};
  const originalPolyline=L.polyline.bind(L);


  // Spelade gator ligger i ett separat lager ovanför baskartan.
  L.polyline=function createGamePolyline(latlngs,options={}){
    const color=String(options?.color||'').toLowerCase();
    const isPrevious=color==='#7b8791';
    const isCurrentOutline=color==='#ffffff';
    const isCurrent=color==='#e53935';
    if(!isPrevious&&!isCurrentOutline&&!isCurrent) return originalPolyline(latlngs,options);

    const styled={...options,pane:'streetRoutePane'};
    if(isPrevious) Object.assign(styled,{color:'#7b8791',weight:5,opacity:.65,dashArray:'8 5'});
    if(isCurrentOutline) Object.assign(styled,{color:'#ffffff',weight:13,opacity:.98});
    if(isCurrent) Object.assign(styled,{color:'#d91f1f',weight:8,opacity:1});
    return originalPolyline(latlngs,styled);
  };

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
