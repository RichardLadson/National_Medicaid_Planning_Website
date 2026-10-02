// Records one view of the page for the Views dashboard at /sherene/stats.html.
// Sends { p: page id, s: session id, v: browser id }; the ids are random strings
// this browser keeps in its own storage. Nothing else is sent.
(function () {
  if (!/(^|\.)nationalmedicaidplanning\.com$/.test(location.hostname)) return;
  function id(store, key) {
    try {
      var v = store.getItem(key);
      if (!v || !/^[a-z0-9]{4,16}$/.test(v)) { v = Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 6); store.setItem(key, v); }
      return v;
    } catch (e) { return 'anon00'; }
  }
  var body = JSON.stringify({ p: 'page', s: id(sessionStorage, 'sherene_s'), v: id(localStorage, 'sherene_v') });
  try {
    if (!(navigator.sendBeacon && navigator.sendBeacon('/sherene/hit', body))) {
      fetch('/sherene/hit', { method: 'POST', body: body, keepalive: true, credentials: 'same-origin' }).catch(function () {});
    }
  } catch (e) {}
})();
