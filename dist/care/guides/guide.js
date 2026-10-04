// Every lead-magnet page: the Print button, the Copy buttons, the tags on the button to the
// care interview, and the anonymous counts (viewed, downloaded, used, clicked through).
// What is sent: the page, the event, two random ids this browser made up, and where the visit
// came from (paid, content or other, and the source). No name, email or address. Browsers that
// ask not to be tracked (Global Privacy Control or Do Not Track) are not counted.
(function () {
  var main = document.querySelector('main[data-asset]');
  if (!main) return;
  var asset = main.getAttribute('data-asset'), isFile = location.protocol === 'file:';

  function rid() { return (Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 8) + 'xxxx').slice(0, 14); }
  function keep(store, key, make) { try { var v = store.getItem(key); if (!v) { v = make(); store.setItem(key, v); } return v; } catch (e) { return make(); } }
  function clean(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 40); }

  // Where this visit came from, decided once per session from the link's tags or the referring site.
  var att = (function () {
    var q = new URLSearchParams(location.search), medium = clean(q.get('utm_medium')), source = clean(q.get('utm_source'));
    var ref = ''; try { ref = document.referrer && new URL(document.referrer).hostname !== location.hostname ? clean(new URL(document.referrer).hostname.replace(/^www\./, '')) : ''; } catch (e) {}
    var fresh = { ch: /^(paid|cpc|ppc|ad|ads|paid[-_]?social)$/.test(medium) ? 'paid' : (medium ? 'content' : 'other'), src: source || ref || 'direct', medium: medium, campaign: clean(q.get('utm_campaign')) };
    var saved = null; try { saved = JSON.parse(sessionStorage.getItem('care_att') || 'null'); } catch (e) {}
    if (medium || source || !saved) { try { sessionStorage.setItem('care_att', JSON.stringify(fresh)); } catch (e) {} return fresh; }
    return saved;
  })();

  var off = isFile || navigator.globalPrivacyControl === true || navigator.doNotTrack === '1', sent = {};
  function hit(e) {
    if (off || sent[e]) return; sent[e] = 1;
    var body = JSON.stringify({ a: asset, e: e, v: keep(localStorage, 'care_v', rid), s: keep(sessionStorage, 'care_s', rid), ch: att.ch, src: att.src });
    try { if (!(navigator.sendBeacon && navigator.sendBeacon('/care/hit', body))) { fetch('/care/hit', { method: 'POST', body: body, keepalive: true, credentials: 'same-origin' }).catch(function () {}); } } catch (err) {}
  }

  hit('view');

  // The button to the care interview carries where the family came from and which lead magnet sent them.
  var cta = document.querySelector('.cta a');
  if (cta) {
    try {
      if (/^https?:/.test(cta.getAttribute('href') || '')) {
        var u = new URL(cta.href);
        u.searchParams.set('utm_source', att.src); u.searchParams.set('utm_medium', att.medium || att.ch);
        u.searchParams.set('utm_campaign', att.campaign || asset.split('/')[0]); u.searchParams.set('utm_content', asset.replace('/', '.'));
        u.searchParams.set('utm_term', isFile ? 'pdf' : 'web');
        cta.href = u.toString();
      }
    } catch (e) {}
    cta.addEventListener('click', function () { hit('cta'); });
  }

  // Downloaded, printed.
  document.querySelectorAll('a[data-download]').forEach(function (a) { a.addEventListener('click', function () { hit('download'); }); });
  document.querySelectorAll('button[data-print]').forEach(function (b) { b.addEventListener('click', function () { window.print(); }); });
  window.addEventListener('beforeprint', function () { hit('print'); });

  // Used: three or more boxes ticked on a checklist.
  var boxes = document.querySelectorAll('.ck input[type=checkbox]');
  boxes.forEach(function (b) { b.addEventListener('change', function () { if (document.querySelectorAll('.ck input:checked').length >= 3) hit('tick'); }); });

  // Used: a prompt copied, by the button or by selecting it.
  function copyText(text, done) {
    function fallback() { var t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.className = 'offscreen'; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e) {} document.body.removeChild(t); done(); }
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, fallback); } else { fallback(); }
  }
  document.querySelectorAll('button[data-copy-prompt]').forEach(function (b) {
    b.addEventListener('click', function () {
      var src = b.closest('.prompt').querySelector('.copy');
      copyText(src.textContent, function () { var o = b.textContent; b.textContent = 'Copied'; b.classList.add('done'); setTimeout(function () { b.textContent = o; b.classList.remove('done'); }, 1500); });
      hit('copy');
    });
  });
  document.addEventListener('copy', function () { var s = window.getSelection(), n = s && s.anchorNode; if (n && (n.nodeType === 1 ? n : n.parentElement).closest('.copy, .plain')) hit('copy'); });

  // Used: the gap check finished, or its result copied.
  var gap = document.getElementById('gap');
  if (gap) {
    var total = gap.querySelectorAll('.q').length;
    gap.addEventListener('change', function () { if (gap.querySelectorAll('input:checked').length >= total) hit('done'); });
    var gc = document.getElementById('copy'); if (gc) gc.addEventListener('click', function () { hit('copy'); });
  }

  // Read to the end: the closing section came into view and at least 30 seconds were spent on the page.
  var end = document.querySelector('.cta'), sawEnd = false, stayed = false;
  function maybeRead() { if (sawEnd && stayed) hit('read'); }
  setTimeout(function () { stayed = true; maybeRead(); }, 30000);
  if (end && 'IntersectionObserver' in window) { new IntersectionObserver(function (en) { if (en.some(function (x) { return x.isIntersecting; })) { sawEnd = true; maybeRead(); } }).observe(end); }
})();
