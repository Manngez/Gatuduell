'use strict';

(() => {
  const VERSION='20260825-map3';
  for(const href of ['commercial.css','fullscreen-game.css','map-interaction.css']){
    const css=document.createElement('link');
    css.rel='stylesheet';
    css.href=`${href}?v=${VERSION}`;
    document.head.appendChild(css);
  }

  const files=['app-state.js','app-online.js','app-game.js'];
  const load=index=>{
    if(index>=files.length) return;
    const script=document.createElement('script');
    script.src=`${files[index]}?v=${VERSION}`;
    script.onload=()=>load(index+1);
    script.onerror=()=>console.error(`Kunde inte ladda ${files[index]}`);
    document.body.appendChild(script);
  };
  load(0);
})();
