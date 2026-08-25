'use strict';
(() => {
  const modal=document.getElementById('resultModal');
  const title=document.getElementById('resultTitle');
  const text=document.getElementById('resultText');
  const score=document.getElementById('resultScore');
  const eyebrow=document.getElementById('resultEyebrow');
  if(!modal||!title||!text||!score||!eyebrow)return;

  function decorate(){
    const p1Name=document.getElementById('p1Name')?.textContent?.trim()||'Spelare 1';
    const p2Name=document.getElementById('p2Name')?.textContent?.trim()||'Spelare 2';
    const p1Score=document.getElementById('p1Score')?.textContent?.trim()||'0';
    const p2Score=document.getElementById('p2Score')?.textContent?.trim()||'0';
    score.innerHTML=`<span>${p1Name}</span><strong>${p1Score}–${p2Score}</strong><span>${p2Name}</span>`;

    if(/vinner matchen/i.test(title.textContent)){
      eyebrow.textContent='MATCH AVGJORD';
      return;
    }

    eyebrow.textContent='RUNDA AVGJORD';
    const raw=text.textContent.trim();
    const match=raw.match(/(?:^|\.\s)([^.]+?) vinner rundan\.?$/i);
    if(!match)return;
    const winner=match[1].trim();
    title.textContent=`${winner} vinner rundan`;
    const winnerSentence=new RegExp(`(?:^|\\.\\s)${winner.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')} vinner rundan\\.?$`,'i');
    const reason=raw.replace(winnerSentence,'').trim().replace(/\.$/,'');
    text.textContent=reason?`${reason}.`:'';
  }

  const observer=new MutationObserver(()=>{if(!modal.hidden)decorate();});
  observer.observe(modal,{attributes:true,attributeFilter:['hidden']});
})();
