// content.js
(function () {
  const debug = false;
  function log(...a){ if(debug) console.log('[YTI]',...a); }

  let lastUrl = location.href;
  let currentVideoId = null;
  let currentPlayStart = null;

  function getVideoIdFromUrl(url = location.href) {
    try { return (new URL(url)).searchParams.get('v'); } catch(e){ return null; }
  }

  function getVideoTitle() {
    const h = document.querySelector('h1.title, h1.ytd-video-primary-info-renderer, h1');
    if (h && h.innerText && h.innerText.trim()) return h.innerText.trim();
    // fallback: page title minus " - YouTube"
    return document.title.replace(' - YouTube', '').trim();
  }

  function getVideoDescription() {
    // Selectors for various YouTube UI versions
    const el = document.querySelector('#description .content, #description-text, ytd-text-inline-expander, #description > yt-formatted-string');
    if (el) return el.innerText.trim();
    // Fallback for newer UIs that use a dedicated expander component
    const expander = document.querySelector('ytd-expandable-video-description-body-renderer');
    if (expander) return expander.innerText.trim();
    return '';
  }

  function collectRecommendations(limit = 40) {
    // Try to capture the common recommended nodes; fallback to anchors linking to /watch?v=
    const anchors = Array.from(document.querySelectorAll('ytd-compact-video-renderer a#thumbnail, ytd-compact-video-renderer a#video-title, a[href^="/watch?v="]'));
    const filtered = anchors.filter(a => a.href && a.href.includes('/watch?v=')).slice(0, limit);
    const recs = filtered.map(a => {
      try {
        const url = new URL(a.href, location.origin);
        const vid = url.searchParams.get('v');
        const title = (a.title || (a.querySelector('#video-title') ? a.querySelector('#video-title').innerText : a.getAttribute('aria-label') || '')).trim();
        return { videoId: vid, title };
      } catch(e){ return null; }
    }).filter(Boolean);
    return recs;
  }

  function sendEvent(type, data) {
    const payload = { type, data, url: location.href, ts: Date.now() };
    chrome.runtime.sendMessage({ type: 'EVENT', payload }, (resp) => { /* optional callback */ });
  }

  function attachVideoListeners(videoId) {
    const tryAttach = () => {
      const v = document.querySelector('video');
      if (!v) { setTimeout(tryAttach, 400); return; }
      sendEvent('video_found', { videoId });
      v.addEventListener('play', () => {
        currentPlayStart = Date.now();
        sendEvent('play', { videoId, currentTime: v.currentTime });
      });
      v.addEventListener('pause', () => {
        if (currentPlayStart) {
          const ms = Date.now() - currentPlayStart;
          sendEvent('watch_chunk', { videoId, ms, currentTime: v.currentTime });
          currentPlayStart = null;
        }
      });
      v.addEventListener('ended', () => {
        if (currentPlayStart) {
          const ms = Date.now() - currentPlayStart;
          sendEvent('watch_chunk', { videoId, ms, ended: true });
          currentPlayStart = null;
        }
        sendEvent('ended', { videoId });
      });
    };
    tryAttach();
  }

  function handleWatchPage(videoId) {
    currentVideoId = videoId;
    const title = getVideoTitle();
    sendEvent('open_watch', { videoId, title });
    attachVideoListeners(videoId);

    setTimeout(() => {
      const description = getVideoDescription();
      if (description) {
        sendEvent('video_description', { videoId, description });
      }

      const recs = collectRecommendations();
      if (recs.length) sendEvent('recs_snapshot', { videoId, recs });

      // bind clicks on recommendation anchors (best-effort)
      document.querySelectorAll('a[href^="/watch?v="]').forEach(a => {
        if (a.dataset.ytiBound) return;
        a.dataset.ytiBound = '1';
        a.addEventListener('click', () => {
          try {
            const url = new URL(a.href, location.origin);
            sendEvent('rec_click', { from: videoId, clicked: url.searchParams.get('v') });
          } catch(e){}
        }, { capture: true });
      });
    }, 1200);
  }

  function handleSearchPage() {
    const sp = new URL(location.href).searchParams;
    const q = sp.get('search_query') || sp.get('search') || sp.get('q') || document.querySelector('input#search')?.value || '';
    if (q) sendEvent('search', { query: q });
  }

  function handleNavigation() {
    const newUrl = location.href;
    if (newUrl === lastUrl) return;
    lastUrl = newUrl;
    log('nav', newUrl);
    const vid = getVideoIdFromUrl(newUrl);
    if (vid) handleWatchPage(vid);
    else if (location.pathname.startsWith('/results')) handleSearchPage();
    else sendEvent('nav', { path: location.pathname });
  }

  // YouTube emits internal events sometimes: try to listen; fallback to poll
  window.addEventListener('yt-navigate-finish', handleNavigation, true);
  // fallback polling for SPA changes
  setInterval(handleNavigation, 1000);

  // quick search box enter capture
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.keyCode === 13) && document.activeElement?.tagName === 'INPUT') {
      const q = document.activeElement.value;
      if (q) sendEvent('search', { query: q });
    }
  }, true);

  // initial trigger:
  setTimeout(handleNavigation, 800);
})();
