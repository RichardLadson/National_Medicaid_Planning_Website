// Records one view of the page for the Views dashboard. The server adds the login.
(function () {
  if (!/(^|\.)nationalmedicaidplanning\.com$/.test(location.hostname)) return;
  function sid() {
    try {
      var v = sessionStorage.getItem('sherene_s');
      if (!v || !/^[a-z0-9]{4,16}$/.test(v)) { v = Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 6); sessionStorage.setItem('sherene_s', v); }
      return v;
    } catch (e) { return 'anon00'; }
  }
  var body = JSON.stringify({ p: 'page', s: sid() });
  try {
    if (!(navigator.sendBeacon && navigator.sendBeacon('/sherene/hit', body))) {
      fetch('/sherene/hit', { method: 'POST', body: body, keepalive: true, credentials: 'same-origin' }).catch(function () {});
    }
  } catch (e) {}
})();
