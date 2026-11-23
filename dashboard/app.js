// Velocity Radar dashboard: board, detail and live views. Static, no network.
// Reads window.RADAR from data.js. State lives in the URL query string so any
// view can be screenshotted or linked: view=board|detail|live, slug, q,
// category, chain, scope=all|watchlist|early, sort, minTvl.
(function () {
  'use strict';
  var R = window.RADAR;
  var app = document.getElementById('app');
  app.setAttribute('aria-busy', 'false');

  function $(sel, el) { return (el || document).querySelector(sel); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    if (n == null) return '—';
    var neg = n < 0, a = Math.abs(n);
    var s;
    if (a >= 1e9) s = '$' + (a / 1e9).toFixed(2) + 'B';
    else if (a >= 1e6) s = '$' + (a / 1e6).toFixed(1) + 'M';
    else if (a >= 1e3) s = '$' + (a / 1e3).toFixed(1) + 'K';
    else s = '$' + Math.round(a);
    return (neg ? '-' : '') + s;
  }
  function moneyFull(n) {
    if (n == null) return '—';
    return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
  }
  function pct(n) {
    if (n == null) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function ageLabel(d) {
    if (d == null) return 'unknown age';
    if (d < 30) return d + 'd';
    if (d < 365) return Math.round(d / 30) + 'mo';
    return (d / 365).toFixed(1) + 'y';
  }
  function params() { return new URLSearchParams(window.location.search); }
  function go(p) {
    var q = p.toString();
    window.location.search = q ? '?' + q : '';
  }

  var SORTS = {
    rank: function (a, b) { return a.rank - b.rank; },
    implied: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
    tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
    velocity: function (a, b) { return (b.change_7d || 0) - (a.change_7d || 0); },
    flow: function (a, b) { return b.weekly_flow_usd - a.weekly_flow_usd; },
    age: function (a, b) { return (b.age_days || 0) - (a.age_days || 0); },
  };

  function categories() {
    var seen = {}, out = [];
    R.rows.forEach(function (r) {
      var c = r.category || 'Uncategorized';
      if (!seen[c]) { seen[c] = 1; out.push(c); }
    });
    return out.sort();
  }
  function chains() {
    var seen = {}, out = [];
    R.rows.forEach(function (r) {
      r.chains.forEach(function (c) { if (!seen[c]) { seen[c] = 1; out.push(c); } });
    });
    return out.sort();
  }

  function filteredRows(p) {
    var q = (p.get('q') || '').toLowerCase();
    var cat = p.get('category') || '';
    var chain = p.get('chain') || '';
    var scope = p.get('scope') || 'all';
    var minTvl = parseFloat(p.get('minTvl') || '0') || 0;
    var sort = SORTS[p.get('sort')] ? p.get('sort') : 'rank';
    var rows = R.rows.filter(function (r) {
      if (scope === 'watchlist' && !r.watchlist) return false;
      if (scope === 'early' && r.watchlist) return false;
      if (cat && (r.category || 'Uncategorized') !== cat) return false;
      if (chain && r.chains.indexOf(chain) < 0) return false;
      if (r.tvl_usd < minTvl) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    rows.sort(SORTS[sort]);
    return { rows: rows, sort: sort };
  }

  function velocityBar(r) {
    var g = r.change_7d || 0;
    var w = Math.min(Math.abs(g), 150) / 150 * 50; // half-bar width in %
    var cls = g < 0 ? 'neg' : '';
    var style = g < 0
      ? 'right:50%;width:' + w + '%;'
      : 'left:50%;width:' + w + '%;';
    return '<div class="vbar" title="7-day TVL change ' + pct(g) + '"><i class="' + cls + '" style="' + style + '"></i></div>';
  }

  function rowHtml(r) {
    var g = r.change_7d;
    return '<tr data-slug="' + esc(r.slug) + '">' +
      '<td class="rank num">#' + r.rank + '</td>' +
      '<td><span class="name">' + esc(r.name) + '</span>' +
      '<span class="tag' + (r.watchlist ? '' : ' early') + '">' + (r.watchlist ? 'WATCHLIST' : 'EARLY') + '</span>' +
      '<div class="sub">' + esc(r.category || 'Uncategorized') + ' · ' + esc(r.slug) + '</div></td>' +
      '<td class="num">' + money(r.tvl_usd) + '</td>' +
      '<td><span class="num ' + (g == null ? '' : g < 0 ? 'down' : 'up') + '">' + pct(g) + '</span>' + velocityBar(r) + '</td>' +
      '<td class="num ' + (r.weekly_flow_usd < 0 ? 'down' : 'up') + '">' + money(r.weekly_flow_usd) + '/wk</td>' +
      '<td class="num">' + r.chain_count + (r.chain_count > 3 ? ' (+' + (r.chain_count - 3) + ')' : '') + '<div class="sub">' + esc(r.chains.join(', ')) + '</div></td>' +
      '<td class="num">' + ageLabel(r.age_days) + '</td>' +
      '<td class="num"><b>' + money(r.implied_value_usd) + '</b></td>' +
      '</tr>';
  }

  function boardView(p) {
    var f = filteredRows(p);
    var rows = f.rows;
    var cats = categories(), chs = chains();
    var opt = function (v, cur, label) {
      return '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + esc(label) + '</option>';
    };
    var catOpts = '<option value="">All categories</option>' + cats.map(function (c) { return opt(c, p.get('category') || '', c); }).join('');
    var chainOpts = '<option value="">All chains</option>' + chs.map(function (c) { return opt(c, p.get('chain') || '', c); }).join('');
    var scope = p.get('scope') || 'all';
    var sortOpts = [['rank', 'Rank'], ['implied', 'Implied value'], ['tvl', 'TVL'], ['velocity', '7-day velocity'], ['flow', 'Weekly flow'], ['age', 'Age']].map(function (s) { return opt(s[0], f.sort, s[1]); }).join('');
    var tvlOpts = [[0, 'Any TVL'], [50000000, '$50M+'], [100000000, '$100M+'], [1000000000, '$1B+']].map(function (t) { return opt(t[0], p.get('minTvl') || '0', t[1]); }).join('');
    var topFlow = R.rows.slice().sort(function (a, b) { return b.weekly_flow_usd - a.weekly_flow_usd; })[0];
    var med = R.rows.map(function (r) { return r.change_7d || 0; }).sort(function (a, b) { return a - b; });
    var medV = med[Math.floor(med.length / 2)];

    var html = '<div class="wrap">' +
      '<header class="hero"><div class="eyebrow">Token launch radar · model velocity-3</div>' +
      '<h1>Velocity Radar</h1>' +
      '<p class="lede">A token launch is a <b>velocity event</b>, not a size contest. This board ranks ' +
      'protocols that record no token by how fast capital is moving into them this week, how widely ' +
      'that capital spreads across chains, and how long they have run without a token — then shows ' +
      'exactly how to farm each one.</p>' +
      '<p class="model-line">Implied value = <code>2.5 × TVL^0.7 × (1 + 0.9 × 7d change) × chain spread × ripeness</code> · ' +
      'snapshot ' + esc(R.as_of) + ' · ' + esc(R.source) + '</p></header>' +
      '<div class="stats">' +
      '<div class="stat"><div class="n">' + R.board_size + '</div><div class="l">ranked rows · ' + R.watchlist_size + ' watchlist + ' + R.early_size + ' early finds</div></div>' +
      '<div class="stat"><div class="n">' + money(topFlow.weekly_flow_usd) + '/wk</div><div class="l">fastest weekly flow · ' + esc(topFlow.name) + '</div></div>' +
      '<div class="stat"><div class="n">' + pct(medV) + '</div><div class="l">median 7-day velocity across the board</div></div>' +
      '<div class="stat"><div class="n">' + money(R.rows[0].implied_value_usd) + '</div><div class="l">top implied value · #' + R.rows[0].rank + ' ' + esc(R.rows[0].name) + '</div></div>' +
      '</div>' +
      '<form class="controls" id="controls">' +
      '<input type="search" name="q" placeholder="Search name or slug…" value="' + esc(p.get('q') || '') + '" aria-label="Search">' +
      '<select name="category" aria-label="Category">' + catOpts + '</select>' +
      '<select name="chain" aria-label="Chain">' + chainOpts + '</select>' +
      '<select name="scope" aria-label="Scope">' +
      opt('all', scope, 'All rows') + opt('watchlist', scope, 'Watchlist only') + opt('early', scope, 'Early finds only') +
      '</select>' +
      '<select name="minTvl" aria-label="Minimum TVL">' + tvlOpts + '</select>' +
      '<label>Sort <select name="sort" aria-label="Sort">' + sortOpts + '</select></label>' +
      '<button class="btn" type="submit">Filter</button>' +
      '<button class="btn ghost" type="button" id="liveBtn">Live tokens</button>' +
      '</form>' +
      '<p class="count">Showing <b>' + rows.length + '</b> of ' + R.board_size + ' ranked protocols. Click a row for its velocity breakdown and farm plan.</p>' +
      '<table class="board"><thead><tr>' +
      '<th data-sort="rank">Rank</th><th>Protocol</th><th data-sort="tvl">TVL</th>' +
      '<th data-sort="velocity">7d velocity</th><th data-sort="flow">Weekly flow</th>' +
      '<th>Chains</th><th data-sort="age">Age</th><th data-sort="implied">Implied value</th>' +
      '</tr></thead><tbody>' +
      rows.slice(0, 60).map(rowHtml).join('') +
      '</tbody></table>' +
      (rows.length > 60 ? '<p class="count">First 60 of ' + rows.length + ' matching rows shown — narrow the filters to see the rest.</p>' : '') +
      '<footer><b>How to read it:</b> implied value is this board\u2019s own claim, built only from the ' +
      'snapshot\u2019s figures — TVL, 7-day change, chain count and listing age. A protocol \u201crecords no ' +
      'token\u201d when its DefiLlama record carries none; that is not proof it has none. Protocols whose ' +
      'token already trades are kept apart in the Live view at their market values, never mixed into the ranking.</footer>' +
      '</div>';
    app.innerHTML = html;
    $('#controls').addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(e.target), np = new URLSearchParams();
      ['q', 'category', 'chain', 'scope', 'minTvl', 'sort'].forEach(function (k) {
        var v = fd.get(k);
        if (v !== null && v !== '' && !(k === 'scope' && v === 'all') && !(k === 'sort' && v === 'rank') && !(k === 'minTvl' && v === '0')) np.set(k, v);
      });
      go(np);
    });
    $('#liveBtn').addEventListener('click', function () { var np = new URLSearchParams(); np.set('view', 'live'); go(np); });
    app.querySelectorAll('tbody tr').forEach(function (tr) {
      tr.addEventListener('click', function () {
        var np = new URLSearchParams(); np.set('view', 'detail'); np.set('slug', tr.getAttribute('data-slug')); go(np);
      });
    });
    app.querySelectorAll('th[data-sort]').forEach(function (th) {
      th.addEventListener('click', function () {
        var np = params(); np.set('sort', th.getAttribute('data-sort')); go(np);
      });
    });
  }

  function detailView(p) {
    var slug = p.get('slug') || '';
    var r = null;
    R.rows.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) r = R.rows[0];
    var steps = r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    var base = 2.5 * Math.pow(Math.max(r.tvl_usd, 1), 0.7);
    var factor = function (label, value, detail, pctOf) {
      return '<div class="factor"><div class="f-n">' + label + '</div><div class="f-v">' + value + '</div>' +
        '<div class="f-d">' + detail + '</div><div class="meter"><i style="width:' + Math.round(pctOf * 100) + '%"></i></div></div>';
    };
    var html = '<div class="wrap">' +
      '<p><button class="btn ghost" id="backBtn">&larr; Back to the board</button></p>' +
      '<section class="detail"><h2>#' + r.rank + ' ' + esc(r.name) + '</h2>' +
      '<div class="meta">' + esc(r.category || 'Uncategorized') + ' · ' + esc(r.slug) + ' · TVL ' + moneyFull(r.tvl_usd) +
      ' · ' + (r.watchlist ? 'on the watchlist' : 'early find below the $50M floor') +
      ' · listed ' + esc(r.listed_at || 'date unknown') + ' (' + ageLabel(r.age_days) + ' ago) · records no token</div>' +
      '<div class="breakdown">' +
      factor('Implied value', money(r.implied_value_usd), 'the board\u2019s claim for this protocol', 1) +
      factor('Weekly flow', money(r.weekly_flow_usd) + '/wk', 'TVL × 7-day change — dollars moving per week', Math.min(Math.abs(r.weekly_flow_usd) / 5e7, 1)) +
      factor('7-day velocity', pct(r.change_7d), 'velocity multiplier ×' + r.velocity_multiplier.toFixed(2), Math.min(Math.abs(r.change_7d || 0) / 100, 1)) +
      factor('Chain spread', '×' + r.spread_multiplier.toFixed(2), r.chain_count + ' chains · ' + esc(r.chains.join(', ')) + (r.chain_count > 3 ? '…' : ''), Math.min(r.chain_count / 10, 1)) +
      factor('Ripeness', '×' + r.ripeness_multiplier.toFixed(2), ageLabel(r.age_days) + ' running with no token', Math.min((r.age_days || 365) / 1095, 1)) +
      factor('Size base', money(Math.round(base)), '2.5 × TVL^0.7 — sub-linear, so speed can beat bulk', Math.min(Math.log10(Math.max(r.tvl_usd, 1)) / 10, 1)) +
      '</div>' +
      '<h3>Farm plan — show up every week</h3>' +
      '<ol class="steps">' + steps + '</ol>' +
      '<p class="note">Velocity is earned by returning weekly, not by one big deposit: the plan\u2019s ' +
      'weekly action keeps the wallet reading as active across snapshot windows. Costs are the plan\u2019s ' +
      'own estimates for a small position; never pay to claim, and claim only from the link the ' +
      'protocol itself publishes.</p>' +
      '</section></div>';
    app.innerHTML = html;
    $('#backBtn').addEventListener('click', function () { go(new URLSearchParams()); });
  }

  function liveView() {
    var rows = R.live.map(function (x) {
      return '<tr><td><span class="name">' + esc(x.name) + '</span><div class="sub">' + esc(x.category || 'Uncategorized') + ' · ' + esc(x.slug) + '</div></td>' +
        '<td class="num">' + money(x.tvl_usd) + '</td>' +
        '<td class="num">' + money(x.mcap_usd) + '</td>' +
        '<td class="num ' + ((x.change_7d || 0) < 0 ? 'down' : 'up') + '">' + pct(x.change_7d) + '</td></tr>';
    }).join('');
    app.innerHTML = '<div class="wrap">' +
      '<p><button class="btn ghost" id="backBtn">&larr; Back to the board</button></p>' +
      '<h1>Live tokens — the market\u2019s own values</h1>' +
      '<p class="lede">These protocols already record a token, so they are <b>not ranked</b> on this board. ' +
      'Their values below are the market\u2019s, not the model\u2019s — shown apart so the pre-token ranking stays clean.</p>' +
      '<div class="live-note">Nothing here is a farm target for a future token: the token already trades.</div>' +
      '<table class="board"><thead><tr><th>Protocol</th><th>TVL</th><th>Market cap</th><th>7d change</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
    $('#backBtn').addEventListener('click', function () { go(new URLSearchParams()); });
  }

  var p = params();
  var view = p.get('view') || 'board';
  if (view === 'detail') detailView(p);
  else if (view === 'live') liveView();
  else boardView(p);
})();
