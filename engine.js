'use strict';

(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.UmeaStreetEngine=api;
})(typeof window!=='undefined'?window:globalThis,()=>{
  const DEFAULT_BBOX={west:20.10,south:63.76,east:20.50,north:63.91};

  function norm(value=''){
    return String(value).trim().toLowerCase().normalize('NFKD').replace(/\p{M}/gu,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  }

  function flattenCoords(value){
    if(!Array.isArray(value)) return [];
    if(value.length>=2&&Number.isFinite(Number(value[0]))&&Number.isFinite(Number(value[1]))) return [[Number(value[0]),Number(value[1])]];
    return value.flatMap(flattenCoords);
  }

  function parseWktLine(wkt=''){
    const text=String(wkt||'');
    if(!/LINESTRING/i.test(text)) return [];
    return [...text.matchAll(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)]
      .map(match=>[Number(match[1]),Number(match[2])])
      .filter(([lon,lat])=>Number.isFinite(lon)&&Number.isFinite(lat));
  }

  function featureName(feature={}){
    const p=feature.properties||feature.fields||feature;
    return String(p.namn??p.Namn??p.name??p.NAME??'').trim();
  }

  function featureCoords(feature={}){
    const p=feature.properties||feature.fields||feature;
    const fromWkt=parseWktLine(p.geometry??p.Geometry??'');
    if(fromWkt.length>=2) return fromWkt;
    const fromGeo=flattenCoords(feature.geometry?.coordinates??p.geojson?.coordinates??p.GeoJSON?.coordinates);
    return fromGeo.length>=2?fromGeo:[];
  }

  function insideBbox([lon,lat],bbox=DEFAULT_BBOX){
    return lon>=bbox.west&&lon<=bbox.east&&lat>=bbox.south&&lat<=bbox.north;
  }

  function pointSegmentDistanceXY(p,a,b){
    const dx=b[0]-a[0],dy=b[1]-a[1];
    const len2=dx*dx+dy*dy;
    if(!len2) return Math.hypot(p[0]-a[0],p[1]-a[1]);
    const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/len2));
    const x=a[0]+t*dx,y=a[1]+t*dy;
    return Math.hypot(p[0]-x,p[1]-y);
  }

  function segmentEndpointDistanceXY(a,b,c,d){
    return Math.min(
      pointSegmentDistanceXY(a,c,d),
      pointSegmentDistanceXY(b,c,d),
      pointSegmentDistanceXY(c,a,b),
      pointSegmentDistanceXY(d,a,b)
    );
  }

  function connect(streets,a,b){
    if(!a||!b||a===b) return;
    streets.get(a)?.neighbors.add(b);
    streets.get(b)?.neighbors.add(a);
  }

  function buildGraph(features=[],options={}){
    const bbox=options.bbox||DEFAULT_BBOX;
    const tolerance=Math.max(1,Number(options.toleranceMeters)||7);
    const junctionRadius=Math.max(tolerance,Number(options.junctionRadiusMeters)||32);
    const streets=new Map();
    const endpoints=[];
    const segments=[];
    const lat0=(bbox.south+bbox.north)/2*Math.PI/180;
    const toMeters=([lon,lat])=>[lon*111320*Math.cos(lat0),lat*110540];
    let endpointId=0,segmentId=0;

    for(const feature of features||[]){
      const name=featureName(feature);
      if(!name||!/[A-Za-zÅÄÖåäöÉéÜü]/.test(name)) continue;
      const coords=featureCoords(feature);
      if(coords.length<2||!coords.some(point=>insideBbox(point,bbox))) continue;
      const key=norm(name);
      if(!key) continue;
      if(!streets.has(key)) streets.set(key,{key,name,lines:[],neighbors:new Set()});
      streets.get(key).lines.push(coords);

      const firstXY=toMeters(coords[0]);
      const secondXY=toMeters(coords[1]);
      const lastXY=toMeters(coords[coords.length-1]);
      const prevXY=toMeters(coords[coords.length-2]);
      endpoints.push({id:endpointId++,key,xy:firstXY,approach:[firstXY[0]-secondXY[0],firstXY[1]-secondXY[1]]});
      endpoints.push({id:endpointId++,key,xy:lastXY,approach:[lastXY[0]-prevXY[0],lastXY[1]-prevXY[1]]});

      for(let i=1;i<coords.length;i++){
        const a=toMeters(coords[i-1]),b=toMeters(coords[i]);
        segments.push({id:segmentId++,key,a,b,minX:Math.min(a[0],b[0]),maxX:Math.max(a[0],b[0]),minY:Math.min(a[1],b[1]),maxY:Math.max(a[1],b[1])});
      }
    }

    const segmentCell=Math.max(16,tolerance*4);
    const segmentBuckets=new Map();
    for(const segment of segments){
      const minBx=Math.floor((segment.minX-tolerance)/segmentCell),maxBx=Math.floor((segment.maxX+tolerance)/segmentCell);
      const minBy=Math.floor((segment.minY-tolerance)/segmentCell),maxBy=Math.floor((segment.maxY+tolerance)/segmentCell);
      const candidates=new Set();
      for(let bx=minBx;bx<=maxBx;bx++) for(let by=minBy;by<=maxBy;by++){
        for(const other of segmentBuckets.get(`${bx}:${by}`)||[]) candidates.add(other);
      }
      for(const other of candidates){
        if(other.key===segment.key) continue;
        if(other.maxX+tolerance<segment.minX||other.minX-tolerance>segment.maxX||other.maxY+tolerance<segment.minY||other.minY-tolerance>segment.maxY) continue;
        if(segmentEndpointDistanceXY(segment.a,segment.b,other.a,other.b)<=tolerance) connect(streets,segment.key,other.key);
      }
      for(let bx=minBx;bx<=maxBx;bx++) for(let by=minBy;by<=maxBy;by++){
        const key=`${bx}:${by}`;
        if(!segmentBuckets.has(key)) segmentBuckets.set(key,[]);
        segmentBuckets.get(key).push(segment);
      }
    }

    // NVDB delar ibland upp rondeller och trafiköar så att gatarmar slutar några meter från varandra.
    // En kompakt grupp av gatarmar behandlas då som samma korsning.
    const endpointBuckets=new Map();
    const cellKey=(x,y,size)=>`${Math.floor(x/size)}:${Math.floor(y/size)}`;
    for(const endpoint of endpoints){
      const [x,y]=endpoint.xy;
      const bx=Math.floor(x/junctionRadius),by=Math.floor(y/junctionRadius);
      const nearby=[];
      for(let ox=-1;ox<=1;ox++) for(let oy=-1;oy<=1;oy++){
        for(const other of endpointBuckets.get(`${bx+ox}:${by+oy}`)||[]){
          if(Math.hypot(other.xy[0]-x,other.xy[1]-y)<=junctionRadius) nearby.push(other);
        }
      }
      const distinct=[...new Map([endpoint,...nearby].map(item=>[item.id,item])).values()];
      const counts=new Map();
      for(const item of distinct) counts.set(item.key,(counts.get(item.key)||0)+1);
      const keys=[...counts.keys()];
      const compact=distinct.every((a,i)=>distinct.slice(i+1).every(b=>Math.hypot(a.xy[0]-b.xy[0],a.xy[1]-b.xy[1])<=junctionRadius));
      const twoStreetRoundabout=keys.length===2&&distinct.length>=4&&keys.every(key=>(counts.get(key)||0)>=2);
      const multiStreetJunction=keys.length>=3&&distinct.length>=3;
      if(compact&&(multiStreetJunction||twoStreetRoundabout)){
        const center=distinct.reduce((sum,item)=>[sum[0]+item.xy[0],sum[1]+item.xy[1]],[0,0]).map(value=>value/distinct.length);
        const aimed=distinct.filter(item=>{
          const ax=item.approach[0],ay=item.approach[1],cx=center[0]-item.xy[0],cy=center[1]-item.xy[1];
          const al=Math.hypot(ax,ay),cl=Math.hypot(cx,cy);
          return !al||!cl||((ax*cx+ay*cy)/(al*cl))>-.15;
        }).length;
        if(aimed/distinct.length>=.66){
          for(let i=0;i<keys.length;i++) for(let j=i+1;j<keys.length;j++) connect(streets,keys[i],keys[j]);
        }
      }
      const key=cellKey(x,y,junctionRadius);
      if(!endpointBuckets.has(key)) endpointBuckets.set(key,[]);
      endpointBuckets.get(key).push(endpoint);
    }

    const active=[...streets.values()].filter(street=>street.neighbors.size>0);
    const names=active.map(street=>street.name).sort((a,b)=>a.localeCompare(b,'sv'));
    const byKey=new Map(active.map(street=>[street.key,street]));
    return {
      names,size:names.length,bbox:{...bbox},streets:byKey,
      get(name){return byKey.get(norm(name))||null;},
      neighbors(name){
        const street=byKey.get(norm(name));
        if(!street) return [];
        return [...street.neighbors].map(key=>byKey.get(key)?.name).filter(Boolean).sort((a,b)=>a.localeCompare(b,'sv'));
      },
      crosses(a,b){
        const one=byKey.get(norm(a)),two=byKey.get(norm(b));
        return !!one&&!!two&&one.neighbors.has(two.key);
      }
    };
  }

  function suggestions(graph,input='',limit=8){
    if(!graph) return [];
    const q=norm(input);
    if(!q) return [];
    return graph.names.filter(name=>norm(name).includes(q)).sort((a,b)=>{
      const aa=norm(a).startsWith(q)?0:1,bb=norm(b).startsWith(q)?0:1;
      return aa-bb||a.localeCompare(b,'sv');
    }).slice(0,Math.max(1,limit));
  }

  function shortestPath(graph,from,to,maxSteps=3){
    const start=graph?.get(from)?.name,target=graph?.get(to)?.name;
    if(!start||!target) return null;
    if(norm(start)===norm(target)) return [start];
    const limit=Math.max(0,Math.min(12,Number(maxSteps)||0));
    const targetKey=norm(target);
    const queue=[[start]];
    const visited=new Set([norm(start)]);
    while(queue.length){
      const path=queue.shift();
      const steps=path.length-1;
      if(steps>=limit) continue;
      for(const next of graph.neighbors(path[path.length-1])){
        const key=norm(next);
        if(visited.has(key)) continue;
        const nextPath=[...path,next];
        if(key===targetKey) return nextPath;
        visited.add(key);
        queue.push(nextPath);
      }
    }
    return null;
  }

  function validateMove(graph,current,candidate,used=[],maxSteps=1){
    const currentName=graph?.get(current)?.name;
    const candidateName=graph?.get(candidate)?.name;
    if(!candidateName) return {ok:false,reason:'unknown'};
    const usedKeys=new Set((used||[]).map(norm));
    if(usedKeys.has(norm(candidateName))) return {ok:false,reason:'used',name:candidateName};
    if(!currentName) return {ok:false,reason:'not-crossing',name:candidateName};
    const path=shortestPath(graph,currentName,candidateName,maxSteps);
    if(!path) return {ok:false,reason:'not-crossing',name:candidateName,current:currentName,maxSteps};
    return {ok:true,name:candidateName,current:currentName,steps:path.length-1,path,maxSteps};
  }

  function reachableUnused(graph,current,used=[],maxSteps=1){
    const start=graph?.get(current)?.name;
    if(!start) return [];
    const limit=Math.max(1,Math.min(12,Number(maxSteps)||1));
    const usedKeys=new Set((used||[]).map(norm));
    const visited=new Set([norm(start)]);
    const result=[];
    let frontier=[start];
    for(let depth=1;depth<=limit;depth++){
      const nextFrontier=[];
      for(const item of frontier){
        for(const next of graph.neighbors(item)){
          const key=norm(next);
          if(visited.has(key)) continue;
          visited.add(key);
          nextFrontier.push(next);
          if(!usedKeys.has(key)) result.push(next);
        }
      }
      frontier=nextFrontier;
      if(!frontier.length) break;
    }
    return result.sort((a,b)=>a.localeCompare(b,'sv'));
  }

  function chooseStart(graph,random=Math.random){
    if(!graph?.names?.length) return null;
    const preferred=graph.names.filter(name=>{const degree=graph.neighbors(name).length;return degree>=3&&degree<=14;});
    const pool=preferred.length?preferred:graph.names.filter(name=>graph.neighbors(name).length>=2);
    if(!pool.length) return graph.names[0]||null;
    return pool[Math.floor(Math.max(0,Math.min(.999999,Number(random())||0))*pool.length)];
  }

  return {DEFAULT_BBOX,norm,parseWktLine,featureName,featureCoords,buildGraph,suggestions,shortestPath,validateMove,reachableUnused,chooseStart};
});
