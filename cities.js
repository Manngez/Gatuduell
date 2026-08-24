'use strict';

(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.GatduellCities=api;
})(typeof window!=='undefined'?window:globalThis,()=>{
  const CITIES=[
    {
      slug:'umea',name:'Umeå',region:'Västerbotten',premium:false,available:true,
      center:[63.8258,20.2630],zoom:13,
      bbox:{west:20.10,south:63.76,east:20.50,north:63.91},
      source:'umea-open-data',
      urls:[
        'https://opendataumea.opendatasoft.com/api/explore/v2.1/catalog/datasets/roads_umea/exports/geojson?timezone=Europe%2FStockholm&use_labels=false&epsg=4326',
        'https://opendata.umea.se/api/explore/v2.1/catalog/datasets/roads_umea/exports/geojson?timezone=Europe%2FStockholm&use_labels=false&epsg=4326'
      ]
    },
    {
      slug:'stockholm',name:'Stockholm',region:'Stockholm',premium:true,available:true,
      center:[59.3293,18.0686],zoom:12,
      bbox:{west:17.89,south:59.255,east:18.185,north:59.405},source:'overpass'
    },
    {
      slug:'goteborg',name:'Göteborg',region:'Västra Götaland',premium:true,available:true,
      center:[57.7089,11.9746],zoom:12,
      bbox:{west:11.82,south:57.62,east:12.10,north:57.79},source:'overpass'
    },
    {
      slug:'malmo',name:'Malmö',region:'Skåne',premium:true,available:true,
      center:[55.6050,13.0038],zoom:12,
      bbox:{west:12.86,south:55.53,east:13.13,north:55.66},source:'overpass'
    }
  ];

  const cache=new Map();
  const overpassEndpoints=[
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];

  function all(){return CITIES.map(city=>({...city,bbox:{...city.bbox}}));}
  function get(slug='umea'){return CITIES.find(city=>city.slug===slug)||CITIES[0];}

  function overpassQuery(city){
    const b=city.bbox;
    return `[out:json][timeout:35];way["highway"]["name"]["highway"!~"^(footway|path|cycleway|steps|track|service|construction|proposed)$"](${b.south},${b.west},${b.north},${b.east});out geom;`;
  }

  function overpassToFeatures(payload={}){
    return (payload.elements||[])
      .filter(item=>item?.type==='way'&&item?.tags?.name&&Array.isArray(item.geometry)&&item.geometry.length>=2)
      .map(item=>({
        type:'Feature',
        properties:{name:String(item.tags.name).trim(),highway:item.tags.highway||''},
        geometry:{type:'LineString',coordinates:item.geometry.map(point=>[Number(point.lon),Number(point.lat)]).filter(([lon,lat])=>Number.isFinite(lon)&&Number.isFinite(lat))}
      }))
      .filter(feature=>feature.geometry.coordinates.length>=2);
  }

  async function fetchJson(url,options={},fetchImpl=globalThis.fetch){
    const response=await fetchImpl(url,options);
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function load(cityOrSlug='umea',fetchImpl=globalThis.fetch){
    const city=typeof cityOrSlug==='string'?get(cityOrSlug):cityOrSlug;
    if(cache.has(city.slug)) return cache.get(city.slug);
    let lastError=null;

    if(city.source==='umea-open-data'){
      for(const url of city.urls||[]){
        try{
          const data=await fetchJson(url,{cache:'no-cache'},fetchImpl);
          const features=Array.isArray(data?.features)?data.features:Array.isArray(data)?data:[];
          if(!features.length) throw new Error('Tom datamängd');
          const result={city,features};
          cache.set(city.slug,result);
          return result;
        }catch(error){lastError=error;}
      }
    }else if(city.source==='overpass'){
      const query=overpassQuery(city);
      for(const endpoint of overpassEndpoints){
        try{
          const data=await fetchJson(endpoint,{
            method:'POST',
            headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
            body:`data=${encodeURIComponent(query)}`
          },fetchImpl);
          const features=overpassToFeatures(data);
          if(!features.length) throw new Error('Inga spelbara gator hittades');
          const result={city,features};
          cache.set(city.slug,result);
          return result;
        }catch(error){lastError=error;}
      }
    }

    throw lastError||new Error(`Kunde inte hämta gator för ${city.name}`);
  }

  return {all,get,load,overpassQuery,overpassToFeatures};
});
