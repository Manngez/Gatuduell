'use strict';

(() => {
  const VERSION='20260825-maplibre1';

  const addCss=href=>{
    const css=document.createElement('link');
    css.rel='stylesheet';
    css.href=href;
    document.head.appendChild(css);
  };

  addCss('https://unpkg.com/maplibre-gl@6.0.0/dist/maplibre-gl.css');
  for(const href of ['commercial.css','fullscreen-game.css','map-interaction.css']) addCss(`${href}?v=${VERSION}`);

  const loadScript=(src,onload)=>{
    const script=document.createElement('script');
    script.src=src;
    script.onload=onload;
    script.onerror=()=>console.error(`Kunde inte ladda ${src}`);
    document.body.appendChild(script);
  };

  const appFiles=['app-state.js','app-online.js','app-game.js'];
  const loadApp=index=>{
    if(index>=appFiles.length) return;
    loadScript(`${appFiles[index]}?v=${VERSION}`,()=>loadApp(index+1));
  };

  loadScript('https://unpkg.com/maplibre-gl@6.0.0/dist/maplibre-gl.js',()=>{
    loadScript(`maplibre-leaflet-compat.js?v=${VERSION}`,()=>loadApp(0));
  });
})();
