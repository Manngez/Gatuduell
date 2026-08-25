'use strict';
(() => {
  const L = globalThis.L;
  const E = globalThis.UmeaStreetEngine;
  if (!L || !E) return;

  const CENTRAL = { minLat:63.78, maxLat:63.87, minLon:20.13, maxLon:20.37 };
  const TILE_URL = 'https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png';
  const originalMap = L.map.bind(L);
  const originalTileLayer = L.tileLayer.bind(L);
  const originalFitBounds = L.Map.prototype.fitBounds;
  const originalChooseStart = E.chooseStart.bind(E);
  let manualFocusUntil = 0;

  L.map = function stableMap(id, options = {}) {
    const map = originalMap(id, {
      ...options,
      inertia:false,
      touchZoom:'center',
      zoomSnap:1,
      zoomDelta:1,
      zoomAnimation:false,
      fadeAnimation:false,
      markerZoomAnimation:false,
      bounceAtZoomLimits:false,
      preferCanvas:true
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

  L.tileLayer = function stableTileLayer(_url, options = {}) {
    return originalTileLayer(TILE_URL, {
      ...options,
      subdomains:undefined,
      detectRetina:false,
      tileSize:256,
      updateWhenZooming:true,
      updateWhenIdle:false,
      keepBuffer:2
    });
  };

  L.Map.prototype.flyToBounds = function manualOnlyFlyToBounds(bounds, options = {}) {
    if (Date.now() > manualFocusUntil) return this;
    return originalFitBounds.call(this, bounds, { ...options, animate:false });
  };

  E.chooseStart = function chooseCentralUmeaStart(graph, random = Math.random) {
    const names = Array.isArray(graph?.names) ? graph.names : [];
    const candidates = names.filter(name => {
      const street = graph.get?.(name);
      const lines = Array.isArray(street?.lines) ? street.lines : [];
      const central = lines.some(line => (line || []).some(point => {
        const [lon, lat] = point || [];
        return Number.isFinite(lon) && Number.isFinite(lat) &&
          lat >= CENTRAL.minLat && lat <= CENTRAL.maxLat &&
          lon >= CENTRAL.minLon && lon <= CENTRAL.maxLon;
      }));
      const degree = graph.neighbors?.(name)?.length || 0;
      return central && degree >= 2;
    });
    if (!candidates.length) return originalChooseStart(graph, random);
    const value = Math.max(0, Math.min(.999999, Number(random()) || 0));
    return candidates[Math.floor(value * candidates.length)];
  };

  const allowManualFocus = event => {
    if (event.target?.closest?.('#recenterBtn')) manualFocusUntil = Date.now() + 1500;
  };
  document.addEventListener('pointerdown', allowManualFocus, true);
  document.addEventListener('click', allowManualFocus, true);

  const style = document.createElement('style');
  style.textContent = `
    #map.leaflet-container{touch-action:none!important;overscroll-behavior:none!important;user-select:none!important;-webkit-user-select:none!important}
    #map .leaflet-zoom-animated{transition:none!important}
    #map .leaflet-tile{width:256px!important;height:256px!important;max-width:none!important;max-height:none!important;image-rendering:auto!important}
    .map-hint{display:none!important}
  `;
  document.head.appendChild(style);
})();
