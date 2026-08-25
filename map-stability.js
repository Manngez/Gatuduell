'use strict';
(() => {
  const L = globalThis.L;
  const E = globalThis.UmeaStreetEngine;
  if (!L || !E) return;

  const CENTRAL = { minLat:63.78, maxLat:63.87, minLon:20.13, maxLon:20.37 };
  const originalMap = L.map.bind(L);
  const originalTileLayer = L.tileLayer.bind(L);
  const originalFitBounds = L.Map.prototype.fitBounds;
  let manualFocusUntil = 0;

  L.map = function stableMap(id, options = {}) {
    const map = originalMap(id, {
      ...options,
      inertia:false,
      touchZoom:'center',
      zoomAnimation:false,
      fadeAnimation:false,
      markerZoomAnimation:false,
      bounceAtZoomLimits:false
    });

    globalThis.__GATUDUELL_MAP__ = map;
    map.whenReady(() => {
      map.dragging.enable();
      map.touchZoom.enable();
      map.doubleClickZoom.enable();
      const container = map.getContainer();
      container.style.touchAction = 'none';
      container.style.overscrollBehavior = 'none';
      container.style.webkitUserSelect = 'none';
    });
    return map;
  };

  L.tileLayer = function stableTileLayer(url, options = {}) {
    return originalTileLayer(url, {
      ...options,
      updateWhenZooming:false,
      updateWhenIdle:true,
      keepBuffer:4
    });
  };

  L.Map.prototype.flyToBounds = function manualOnlyFlyToBounds(bounds, options = {}) {
    if (Date.now() > manualFocusUntil) return this;
    return originalFitBounds.call(this, bounds, { ...options, animate:false });
  };

  const originalChooseStart = E.chooseStart.bind(E);
  E.chooseStart = function chooseCentralUmeaStart(graph) {
    const candidates = [];
    for (const [name, street] of graph.entries()) {
      const lines = Array.isArray(street?.lines) ? street.lines : [];
      let central = false;
      for (const line of lines) {
        for (const point of line || []) {
          const [lon, lat] = point || [];
          if (lat >= CENTRAL.minLat && lat <= CENTRAL.maxLat && lon >= CENTRAL.minLon && lon <= CENTRAL.maxLon) {
            central = true;
            break;
          }
        }
        if (central) break;
      }
      if (central) candidates.push(name);
    }
    if (!candidates.length) return originalChooseStart(graph);
    return candidates[Math.floor(Math.random() * candidates.length)];
  };

  const allowManualFocus = event => {
    if (event.target?.closest?.('#recenterBtn')) manualFocusUntil = Date.now() + 1200;
  };
  document.addEventListener('pointerdown', allowManualFocus, true);
  document.addEventListener('click', allowManualFocus, true);

  const style = document.createElement('style');
  style.textContent = `
    #map.leaflet-container{touch-action:none!important;overscroll-behavior:none!important;user-select:none!important;-webkit-user-select:none!important}
    #map .leaflet-zoom-animated{transition:none!important}
    #map .leaflet-tile{will-change:auto!important}
    .map-hint{display:none!important}
  `;
  document.head.appendChild(style);
})();
