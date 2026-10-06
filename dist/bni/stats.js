(function () {
  var $ = function (id) { return document.getElementById(id); };
  var titles = {}, order = [], all = [], admins = [];

  function fmt(iso) {
    if (!iso) return '–';
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  function title(p) { return titles[p] || p; }

  function render() {
    var includeMe = $('includeme').checked;
    var events = all.filter(function (e) { return includeMe || admins.indexOf(e.u) < 0; });
    var pages = {}, sessions = {}, people = {};
    events.forEach(function (e) {
      var pg = pages[e.p] || (pages[e.p] = { views: 0, people: {}, last: '' });
      pg.views += 1; pg.people[e.u] = 1; if (e.t > pg.last) pg.last = e.t;
      var key = e.u + '/' + e.s;
      var s = sessions[key] || (sessions[key] = { start: e.t, u: e.u, path: [] });
      if (e.t < s.start) s.start = e.t;
      s.path.push(e.p);
      people[e.u] = 1;
    });
    var sessionList = Object.keys(sessions).map(function (k) { return sessions[k]; })
      .sort(function (a, b) { return a.start < b.start ? 1 : -1; });

    $('t-visits').textContent = String(sessionList.length);
    $('t-people').textContent = String(Object.keys(people).length);
    $('t-views').textContent = String(events.length);
    $('t-last').textContent = events.length ? fmt(events[events.length - 1].t) : '–';

    var max = 0; Object.keys(pages).forEach(function (p) { max = Math.max(max, pages[p].views); });
    var ids = order.slice();
    Object.keys(pages).forEach(function (p) { if (ids.indexOf(p) < 0) ids.push(p); });
    var tb = $('pagetable').querySelector('tbody'); tb.textContent = '';
    ids.forEach(function (p) {
      var pg = pages[p]; var tr = document.createElement('tr');
      var cells = [title(p), pg ? String(pg.views) : '–', pg ? String(Object.keys(pg.people).length) : '–', pg ? fmt(pg.last) : '–'];
      cells.forEach(function (c, i) {
        var td = document.createElement('td'); td.textContent = c;
        if (i === 1 || i === 2) td.className = 'num';
        if (!pg) td.className += ' zero';
        if (i === 1 && pg && max) { var bar = document.createElement('span'); bar.className = 'bar'; bar.style.width = Math.round(60 * pg.views / max) + 'px'; td.appendChild(bar); }
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });

    var ppl = {};
    events.forEach(function (e) {
      var r = ppl[e.u] || (ppl[e.u] = { views: 0, sessions: {}, first: e.t, last: e.t });
      r.views += 1; r.sessions[e.s] = 1; if (e.t < r.first) r.first = e.t; if (e.t > r.last) r.last = e.t;
    });
    var pb = $('peopletable').querySelector('tbody'); pb.textContent = '';
    Object.keys(ppl).sort(function (a, b) { return ppl[b].views - ppl[a].views; }).forEach(function (u) {
      var r = ppl[u], tr = document.createElement('tr');
      [u, String(r.views), String(Object.keys(r.sessions).length), fmt(r.first), fmt(r.last)].forEach(function (c, i) {
        var td = document.createElement('td'); td.textContent = c; if (i === 1 || i === 2) td.className = 'num'; tr.appendChild(td);
      });
      pb.appendChild(tr);
    });

    var vb = $('visittable').querySelector('tbody'); vb.textContent = '';
    sessionList.forEach(function (s) {
      var tr = document.createElement('tr');
      [fmt(s.start), s.u, String(s.path.length), s.path.map(title).join(' → ')].forEach(function (c, i) {
        var td = document.createElement('td'); td.textContent = c;
        if (i === 2) td.className = 'num'; if (i === 3) td.className = 'path';
        tr.appendChild(td);
      });
      vb.appendChild(tr);
    });

    ['totals', 'filter', 'pages', 'people', 'visits', 'tools'].forEach(function (id) { $(id).hidden = false; });
    $('status').textContent = events.length
      ? (includeMe ? 'Every recorded view, including yours.' : 'Views made while signed in as an admin are left out. Visitors are numbered by browser.')
      : (all.length ? 'Only admin views so far. Tick the box to see them.' : 'No views recorded yet.');
  }

  function load() {
    $('status').textContent = 'Loading…';
    return fetch('titles.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (t) { titles = t.titles || {}; order = t.order || []; })
      .then(function () { return fetch('/bni/stats-data', { cache: 'no-store', credentials: 'same-origin' }); })
      .then(function (r) {
        if (r.status === 401 || r.status === 403) { location.href = '/sherene/login'; return null; }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) { if (data) { all = data.events || []; admins = data.admins || []; render(); } })
      .catch(function (err) { $('status').textContent = 'Could not load the counts: ' + err.message; });
  }

  $('includeme').addEventListener('change', render);
  var armed = false;
  $('reset').addEventListener('click', function () {
    if (!armed) { armed = true; $('reset').textContent = 'Click again to delete every recorded view'; return; }
    fetch('/bni/stats-data', { method: 'DELETE', credentials: 'same-origin' })
      .then(function () { armed = false; $('reset').textContent = 'Reset all counts'; return load(); });
  });
  load();
})();
