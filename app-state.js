'use strict';
(() => {
  const E=window.UmeaStreetEngine,C=window.GatduellCities,B=window.GatduellBackend,$=id=>document.getElementById(id);
  if(!E||!C) throw new Error('Gatduell-moduler saknas.');
  const LEVELS={hard:{label:'Hard',icon:'🔴',steps:1,help:'direkt anslutande gata'},medium:{label:'Medium',icon:'🟡',steps:2,help:'direkt eller via en gata'},easy:{label:'Easy',icon:'🟢',steps:3,help:'upp till två mellanliggande gator'}};
  const store={get(k,f=''){try{return localStorage.getItem(`umea-gatduell:${k}`)??f}catch{return f}},set(k,v){try{localStorage.setItem(`umea-gatduell:${k}`,String(v))}catch{}}};
  const S={requested:store.get('city','umea'),city:null,profile:null,session:null,graph:null,map:null,baseLayer:null,highlight:null,timer:null,state:null,modalMode:'setup',mapExplore:false,lastShare:null,mapRefreshTimer:null};
  S.city=C.get(S.requested);if(S.city.premium)S.city=C.get('umea');
  const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const premium=()=>!!S.profile?.is_premium,locked=c=>!!c?.premium&&!premium(),level=()=>LEVELS[S.state?.difficulty||$('difficultySelect')?.value]||LEVELS.hard;
  const open=id=>{$(id)?.classList.remove('hidden');$(id)?.setAttribute('aria-hidden','false')},close=id=>{$(id)?.classList.add('hidden');$(id)?.setAttribute('aria-hidden','true')};

  function refreshMapTiles(forceTiles=false){
    if(!S.map)return;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      S.map.invalidateSize({pan:false,debounceMoveend:true});
      if(forceTiles&&S.baseLayer)S.baseLayer.redraw();
    }));
  }

  const live=v=>{
    const active=!!v;
    document.body.classList.toggle('game-live',active);
    if(!S.map)return;
    setMapExplore(active);
    clearTimeout(S.mapRefreshTimer);
    refreshMapTiles(false);
    S.mapRefreshTimer=setTimeout(()=>refreshMapTiles(active),180);
  };

  function initMap(){
    if(!window.L)return;
    S.map=L.map('map',{
      zoomControl:false,
      minZoom:10,
      maxZoom:19,
      scrollWheelZoom:false,
      dragging:true,
      touchZoom:true,
      doubleClickZoom:true,
      zoomAnimation:true,
      fadeAnimation:false,
      markerZoomAnimation:true
    }).setView(S.city.center,S.city.zoom||13);
    L.control.zoom({position:'bottomright'}).addTo(S.map);
    S.baseLayer=L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/light_nolabels/{z}/{x}/{y}.png',{
      tileSize:256,
      subdomains:'abcd',
      maxZoom:20,
      attribution:'&copy; OpenStreetMap &copy; CARTO',
      updateWhenIdle:true,
      updateWhenZooming:false,
      keepBuffer:2
    }).addTo(S.map);
    setMapExplore(false);

    let resizeTimer=null;
    const onResize=()=>{
      clearTimeout(resizeTimer);
      resizeTimer=setTimeout(()=>{
        setMapExplore(document.body.classList.contains('game-live'));
        refreshMapTiles(false);
      },160);
    };
    window.addEventListener('resize',onResize,{passive:true});
    window.addEventListener('orientationchange',()=>{
      clearTimeout(resizeTimer);
      resizeTimer=setTimeout(()=>refreshMapTiles(true),260);
    },{passive:true});
  }

  function setMapExplore(v){
    S.mapExplore=!!v;
    if(!S.map)return;
    const desktop=innerWidth>720;
    const inGame=document.body.classList.contains('game-live');
    const active=inGame||desktop||S.mapExplore;
    ['dragging','touchZoom','doubleClickZoom','boxZoom','keyboard'].forEach(k=>S.map[k]?.[active?'enable':'disable']());
    desktop?S.map.scrollWheelZoom.enable():S.map.scrollWheelZoom.disable();
    const mapEl=$('map');
    if(mapEl){
      mapEl.classList.toggle('map-explore-active',!desktop&&active);
      mapEl.style.touchAction=active?'none':'pan-y pinch-zoom';
    }
    const b=$('mapModeBtn');
    if(b){
      b.hidden=desktop||inGame;
      b.setAttribute('aria-pressed',String(!desktop&&!inGame&&S.mapExplore));
      b.textContent=!desktop&&!inGame&&S.mapExplore?'Lås kartan':'Utforska kartan';
    }
  }

  function cityUI(){
    $('cityChipName')&&($('cityChipName').textContent=S.city.name);$('citySelect')&&($('citySelect').value=S.city.slug);document.title=`Gatduell ${S.city.name}`;$('map')?.setAttribute('aria-label',`Karta över ${S.city.name}`);
    if($('setupPremiumState'))$('setupPremiumState').textContent=premium()?'Ranking följer Spelare 1 · Premium aktivt':S.city.premium?'Premium krävs':'Umeå ingår gratis';
  }

  async function loadCity(c=S.city){
    S.city=c;cityUI();S.graph=null;$('modalPrimary').disabled=true;$('modalPrimary').textContent=`Laddar ${S.city.name}…`;$('loadStatus').textContent=`Hämtar gatunät för ${S.city.name}…`;
    try{
      const {features}=await C.load(S.city);$('loadStatus').textContent=`Bygger gatunät från ${features.length.toLocaleString('sv-SE')} vägsegment…`;await new Promise(r=>requestAnimationFrame(r));
      S.graph=E.buildGraph(features,{bbox:S.city.bbox,toleranceMeters:7,junctionRadiusMeters:32});if(!S.graph.size)throw new Error('Tomt gatunät');
      if(S.highlight){S.highlight.remove();S.highlight=null}S.map?.setView(S.city.center,S.city.zoom||13,{animate:false});refreshMapTiles(true);
      $('loadStatus').textContent=`Klart · ${S.graph.size.toLocaleString('sv-SE')} spelbara gatunamn i ${S.city.name}`;$('modalPrimary').disabled=false;$('modalPrimary').textContent='Starta match';return true;
    }catch(err){console.error(err);$('loadStatus').textContent=`Kunde inte hämta gatunätet för ${S.city.name}. Försök igen.`;$('modalPrimary').disabled=true;$('modalPrimary').textContent='Gatunät saknas';return false}
  }

  function restore(){
    $('name1').value=store.get('name1','Spelare 1');$('name2').value=store.get('name2','Spelare 2');const d=store.get('difficulty','hard');if(LEVELS[d])$('difficultySelect').value=d;const t=store.get('timer','20');if([...$('timerSelect').options].some(o=>o.value===t))$('timerSelect').value=t;
  }
  window.GatduellApp={E,C,B,$,S,LEVELS,TARGET:3,store,escapeHtml,premium,locked,level,open,close,live,initMap,setMapExplore,cityUI,loadCity,restore,refreshMapTiles};
})();
