// The gap check: counts what the family knows, never how the person is doing.
(function () {
  var dataEl = document.getElementById('gapdata');
  if (!dataEl) return;
  var data = JSON.parse(dataEl.textContent);
  var form = document.getElementById('gap');
  var know = document.getElementById('know'), unclear = document.getElementById('unclear'), clarify = document.getElementById('clarify');
  var count = document.getElementById('count'), plain = document.getElementById('plain'), copyBtn = document.getElementById('copy'), copied = document.getElementById('copied');
  var ids = Object.keys(data.items);

  function li(text) { var el = document.createElement('li'); el.textContent = text; return el; }

  function render() {
    var k = [], u = [], c = [], answered = 0;
    ids.forEach(function (id) {
      var sel = form.querySelector('input[name="' + id + '"]:checked');
      if (!sel) return;
      answered += 1;
      var item = data.items[id];
      if (sel.value === 'yes') k.push(item.know);
      else if (sel.value === 'unsure') u.push(item.know);
      else c.push(item.clarify + ' (ask: ' + item.ask + ')');
    });
    know.textContent = ''; unclear.textContent = ''; clarify.textContent = '';
    k.forEach(function (t) { know.appendChild(li(t)); });
    u.forEach(function (t) { unclear.appendChild(li(t)); });
    c.forEach(function (t) { clarify.appendChild(li(t)); });
    if (answered === 0) { count.textContent = data.labels.empty; plain.value = ''; return; }
    count.textContent = 'You answered yes to ' + k.length + ' of ' + answered + (answered < ids.length ? ' answered so far (' + ids.length + ' in all).' : '.') + ' ' + data.labels.count_note;
    var lines = [data.title, '', data.labels.know.toUpperCase()].concat(k.length ? k.map(function (t) { return '- ' + t; }) : ['- (nothing yet)']);
    lines = lines.concat(['', data.labels.unclear.toUpperCase()], u.length ? u.map(function (t) { return '- ' + t; }) : ['- (nothing yet)']);
    lines = lines.concat(['', data.labels.clarify.toUpperCase()], c.length ? c.map(function (t) { return '- ' + t; }) : ['- (nothing yet)']);
    plain.value = lines.join('\n');
  }

  form.addEventListener('change', render);
  copyBtn.addEventListener('click', function () {
    render();
    var text = plain.value;
    function done() { copied.hidden = false; setTimeout(function () { copied.hidden = true; }, 2000); }
    function fallback() { plain.hidden = false; plain.focus(); plain.select(); try { document.execCommand('copy'); } catch (e) {} done(); }
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, fallback); } else { fallback(); }
  });
  render();
})();
