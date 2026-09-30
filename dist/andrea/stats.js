(function () {
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'andrea_stats_key';
  var titles = {};
  var order = [];

  // The key is remembered in this browser until "Forget the key" is used,
  // so the dashboard opens straight to the numbers after the first visit.
  function remember(k) { try { localStorage.setItem(KEY, k); } catch (e) { try { sessionStorage.setItem(KEY, k); } catch (e2) {} } }
  function forget() { try { localStorage.removeItem(KEY); } catch (e) {} try { sessionStorage.removeItem(KEY); } catch (e) {} }
  function getKey() {
    var fromHash = (location.hash || '').replace(/^#/, '');
    if (fromHash) {
      remember(fromHash);
      history.replaceState(null, '', location.pathname);
      return fromHash;
    }
    try { return localStorage.getItem(KEY) || sessionStorage.getItem(KEY) || ''; } catch (e) { return ''; }
  }

  function fmt(iso) {
    if (!iso) return '–';
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function title(p) { return titles[p] || p; }

  function render(events) {
    var pages = {}, sessions = {}, browsers = {};
    events.forEach(function (e) {
      var pg = pages[e.p] || (pages[e.p] = { views: 0, browsers: {}, last: '' });
      pg.views += 1; pg.browsers[e.v] = 1; if (e.t > pg.last) pg.last = e.t;
      var s = sessions[e.s] || (sessions[e.s] = { start: e.t, v: e.v, path: [] });
      if (e.t < s.start) s.start = e.t;
      s.path.push(e.p);
      browsers[e.v] = 1;
    });
    var sessionList = Object.keys(sessions).map(function (k) { return sessions[k]; })
      .sort(function (a, b) { return a.start < b.start ? 1 : -1; });
    var browserIds = Object.keys(browsers).sort();
    var label = function (v) { return 'Browser ' + (browserIds.indexOf(v) + 1); };

    $('t-visits').textContent = String(sessionList.length);
    $('t-visitors').textContent = String(browserIds.length);
    $('t-views').textContent = String(events.length);
    $('t-last').textContent = events.length ? fmt(events[events.length - 1].t) : '–';

    var max = 0; Object.keys(pages).forEach(function (p) { max = Math.max(max, pages[p].views); });
    var ids = order.slice();
    Object.keys(pages).forEach(function (p) { if (ids.indexOf(p) < 0) ids.push(p); });
    var tb = $('pagetable').querySelector('tbody'); tb.textContent = '';
    ids.forEach(function (p) {
      var pg = pages[p]; var tr = document.createElement('tr');
      var cells = [title(p), pg ? String(pg.views) : '–', pg ? String(Object.keys(pg.browsers).length) : '–', pg ? fmt(pg.last) : '–'];
      cells.forEach(function (c, i) {
        var td = document.createElement('td'); td.textContent = c;
        if (i === 1 || i === 2) td.className = 'num';
        if (!pg) td.className += ' zero';
        if (i === 1 && pg && max) { var bar = document.createElement('span'); bar.className = 'bar'; bar.style.width = Math.round(60 * pg.views / max) + 'px'; td.appendChild(bar); }
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });

    var vb = $('visittable').querySelector('tbody'); vb.textContent = '';
    sessionList.forEach(function (s) {
      var tr = document.createElement('tr');
      [fmt(s.start), label(s.v), String(s.path.length), s.path.map(title).join(' → ')].forEach(function (c, i) {
        var td = document.createElement('td'); td.textContent = c;
        if (i === 2) td.className = 'num'; if (i === 3) td.className = 'path';
        tr.appendChild(td);
      });
      vb.appendChild(tr);
    });

    ['totals', 'pages', 'visits', 'tools'].forEach(function (id) { $(id).hidden = false; });
    $('status').textContent = events.length ? 'Counts exclude any browser that opted out below.' : 'No views recorded yet.';
  }

  function load(key) {
    $('status').textContent = 'Loading…';
    return fetch('titles.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (t) { titles = t.titles || {}; order = t.order || []; })
      .then(function () { return fetch('/andrea/stats-data', { headers: { 'x-stats-key': key }, cache: 'no-store' }); })
      .then(function (r) {
        if (r.status === 401) { $('keybox').hidden = false; $('status').textContent = 'That key was not accepted.'; return null; }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) { if (data) { $('keybox').hidden = true; render(data.events || []); } })
      .catch(function (err) { $('status').textContent = 'Could not load the counts: ' + err.message; });
  }

  function notrackState() {
    var on = false; try { on = !!localStorage.getItem('andrea_notrack'); } catch (e) {}
    $('notrack').textContent = on ? 'Count this browser again' : "Don't count this browser";
    $('notrack-state').textContent = on ? 'This browser is currently not counted.' : 'This browser is currently counted.';
  }

  $('keyform').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var k = $('keyinput').value.trim(); if (!k) return;
    remember(k);
    load(k);
  });
  $('notrack').addEventListener('click', function () {
    try { if (localStorage.getItem('andrea_notrack')) localStorage.removeItem('andrea_notrack'); else localStorage.setItem('andrea_notrack', '1'); } catch (e) {}
    notrackState();
  });
  var armed = false;
  $('reset').addEventListener('click', function () {
    if (!armed) { armed = true; $('reset').textContent = 'Click again to delete every recorded view'; return; }
    var k = getKey();
    fetch('/andrea/stats-data', { method: 'DELETE', headers: { 'x-stats-key': k } })
      .then(function () { armed = false; $('reset').textContent = 'Reset all counts'; return load(k); });
  });

  $('forget').addEventListener('click', function () { forget(); location.reload(); });
  notrackState();
  var key = getKey();
  if (key) load(key); else { $('keybox').hidden = false; $('status').textContent = 'Locked.'; }
})();
