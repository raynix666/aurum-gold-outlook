(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const DAY = 86400000;
  const GRAMS_PER_OUNCE = 31.1034768;
  const JOD_PER_USD = 0.709;
  const karats = [24, 21, 18];
  let karat = 24;
  const units = {
    oz: { factor: 1, short: 'oz t', long: 'troy oz' },
    g: { factor: 1 / GRAMS_PER_OUNCE, short: 'g', long: 'g' },
    kg: { factor: 1000 / GRAMS_PER_OUNCE, short: 'kg', long: 'kg' }
  };
  try {
    const saved = localStorage.getItem('aurum.display');
    if ([...$('units').options].some(o => o.value === saved)) $('units').value = saved;
    const savedKarat = Number(localStorage.getItem('aurum.karat'));
    if (karats.includes(savedKarat)) karat = savedKarat;
  } catch {}
  $('purity').querySelector('input[value="' + karat + '"]').checked = true;
  let [currency, unit] = $('units').value.split('-');
  const priceFactor = (k, c, u) => units[u].factor * (c === 'JOD' ? JOD_PER_USD : 1) * (k / 24);
  const displayFactor = () => priceFactor(karat, currency, unit);
  const jodNumber = new Intl.NumberFormat('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const decimals = () => currency === 'JOD' ? 3 : 2;
  let { rows, forecasts, calculatedAt } = AurumSeed;
  const ammanTime = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Amman' });
  let horizonIndex = 1;
  let chartData = [];
  let chartPosition = null;
  let activePoint = -1;
  let toastTimer = 0;
  let feedState = '';
  const longDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const asDate = date => Date.parse(date + 'T00:00:00Z');
  const price = v => new Intl.NumberFormat('en-US', {
    style: 'currency', currency, minimumFractionDigits: decimals(), maximumFractionDigits: decimals()
  }).format(v * displayFactor());
  const icon = name => '<svg class="icon" aria-hidden="true"><use href="#' + name + '"/></svg>';
  const signed = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2) + '%';
  const tone = v => v > 0 ? 'pos' : v < 0 ? 'neg' : '';
  const months = ['One-week', 'One-month', 'Three-month'];
  const svgNS = 'http://www.w3.org/2000/svg';
  function node(name, attrs, content) {
    const el = document.createElementNS(svgNS, name);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
    if (content !== undefined) el.textContent = content;
    return el;
  }
  function notify(message) {
    clearTimeout(toastTimer);
    $('notice').textContent = message;
    toastTimer = setTimeout(() => { $('notice').textContent = ''; }, 6500);
  }

  function renderDate() {
    const last = asDate(rows.at(-1)[0]);
    const stale = Date.now() - last > 5 * DAY;
    const prefix = feedState === 'offline' ? 'Saved quote' : stale ? 'Last available quote' : 'Data as of';
    $('as-of').innerHTML = icon('calendar') + prefix + ' ' + longDate.format(last);
    $('calc-time').textContent = 'Calculated ' + ammanTime.format(new Date(calculatedAt)) + ' Amman';
  }
  function render() {
    const [date, latest] = rows.at(-1);
    const previous = rows.at(-2)[1];
    const delta = latest - previous;
    const time = asDate(date);
    const startMonth = new Date(time);
    const monthStart = new Date(Date.UTC(startMonth.getUTCFullYear(), startMonth.getUTCMonth() - 1, 1));
    const monthEnd = new Date(Date.UTC(startMonth.getUTCFullYear(), startMonth.getUTCMonth(), 0));
    monthStart.setUTCDate(Math.min(startMonth.getUTCDate(), monthEnd.getUTCDate()));
    const trailing = rows.filter(row => asDate(row[0]) > +monthStart).map(row => row[1]);
    $('quote').textContent = price(latest);
    $('quote-title').textContent = karat + 'K gold reference price';
    $('gold-content').textContent = karat + ' of 24 parts gold';
    $('per-unit').textContent = '/ ' + units[unit].long;
    $('daily-move').className = 'delta ' + tone(delta);
    $('daily-move').textContent = (delta > 0 ? '+' : delta < 0 ? '−' : '') + price(Math.abs(delta)) + ' (' + signed(delta / previous * 100) + ')';
    $('month-low').textContent = price(Math.min(...trailing));
    $('month-high').textContent = price(Math.max(...trailing));
    renderDate();
    const selected = forecasts[horizonIndex];
    $('segments').innerHTML = forecasts.map((h, i) =>
      '<button type="button" data-index="' + i + '" aria-label="' + h.title + ' chart" aria-pressed="' + (i === horizonIndex) + '">' + h.short + '</button>'
    ).join('');
    // Keep each card's identity while prices update, including during a touch.
    const list = $('horizon-list');
    forecasts.forEach((h, i) => {
      let card = list.children[i];
      if (!card) {
        card = document.createElement('button');
        card.type = 'button';
        card.className = 'horizon';
        card.dataset.index = i;
        card.innerHTML = '<span><strong></strong><small></small></span><span class="quote-end"><span class="target"></span><span class="delta"></span></span>';
        list.append(card);
      }
      card.setAttribute('aria-pressed', String(i === horizonIndex));
      card.querySelector('strong').textContent = h.title;
      card.querySelector('small').textContent = longDate.format(h.target);
      card.querySelector('.target').textContent = price(h.price);
      const change = card.querySelector('.delta');
      change.className = 'delta ' + tone(h.change);
      change.textContent = signed(h.change);
    });
    $('chart-subtitle').textContent = karat + 'K historical and projected price · ' + currency + ' / ' + units[unit].short;
    $('forecast-unit').textContent = karat + 'K · ' + currency + ' per ' + (unit === 'g' ? 'gram' : units[unit].long);
    const endpoints = [latest, ...forecasts.map(h => h.price)];
    $('karat-prices').innerHTML = karats.map(k => {
      const factor = priceFactor(k, 'JOD', 'g');
      const cells = endpoints.map(v => '<td>' + jodNumber.format(v * factor) + '</td>').join('');
      return '<tr><th scope="row">' + k + 'K</th>' + cells + '</tr>';
    }).join('');
    $('detail-title').textContent = months[horizonIndex] + ' range';
    $('range-copy').textContent = price(selected.lower) + ' – ' + price(selected.upper) + ' per ' + units[unit].long + ', based on historical forecast errors.';
    $('performance').innerHTML = forecasts.map(h => '<tr><td>' + h.title + '</td><td>' + h.modelError.toFixed(2) + '%</td><td>' +
      h.baselineError.toFixed(2) + '%</td><td>' + h.count + '</td></tr>').join('');
    $('history-meta').textContent = rows.length.toLocaleString('en-US') + ' matched daily observations from ' + longDate.format(asDate(rows[0][0])) + ' through ' + longDate.format(time) + '. Vercel schedules a full model refit each day around 17:00 Amman time. On holidays and weekends, the forecast uses the latest published quote.';
    renderChart();
  }

  function series() {
    const h = forecasts[horizonIndex];
    const last = asDate(rows.at(-1)[0]);
    const windowDays = [23, 64, 176][horizonIndex];
    const data = rows.filter(r => asDate(r[0]) >= last - windowDays * DAY)
      .map(([d, value]) => ({ time: asDate(d), value, kind: 'historical' }));
    let prev = { target: last, price: rows.at(-1)[1], radius: 0 };
    for (const anchor of forecasts.slice(0, horizonIndex + 1)) {
      const days = Math.round((anchor.target - prev.target) / DAY);
      for (let i = 1; i <= days; i++) {
        const w = i / days;
        const value = prev.price * Math.exp(Math.log(anchor.price / prev.price) * w);
        const radius = Math.sqrt((1 - w) * prev.radius ** 2 + w * anchor.radius ** 2);
        data.push({ time: prev.target + i * DAY, kind: 'forecast', value, lower: value * Math.exp(-radius), upper: value * Math.exp(radius) });
      }
      prev = anchor;
    }
    return data.filter(p => p.time <= h.target);
  }

  function renderChart() {
    if ($('overview').hidden) return;
    const svg = $('chart');
    const frame = $('chart-frame');
    const width = Math.round(frame.clientWidth), height = Math.round(frame.clientHeight);
    if (width < 100 || height < 80) return;
    chartData = series();
    prepareDownload();
    activePoint = -1;
    $('tooltip').hidden = true;
    svg.replaceChildren();
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    const short = width < 425;
    const left = unit === 'kg' ? 70 : short ? 46 : 55, right = width - (short ? 6 : 11);
    const top = 27, bottom = height - 27;
    const start = chartData[0].time, end = chartData.at(-1).time;
    const last = asDate(rows.at(-1)[0]);
    const base = rows.at(-1)[1], h = forecasts[horizonIndex];
    const factor = displayFactor();
    const values = chartData.flatMap(p => [p.lower ?? p.value, p.upper ?? p.value]).map(v => v * factor);
    const min = Math.min(...values), max = Math.max(...values);
    const roughStep = Math.max(max - min, max * .004) / 4;
    const magnitude = 10 ** Math.floor(Math.log10(roughStep));
    const step = [1, 2, 2.5, 5, 10].map(v => v * magnitude).find(v => v >= roughStep);
    const floor = Math.floor(min / step) * step, ceiling = Math.ceil(max / step) * step;
    const x = t => left + (right - left) * (t - start) / (end - start);
    const y = v => bottom - (bottom - top) * (v * factor - floor) / (ceiling - floor || 1);
    chartPosition = { x, y, left, right, top, bottom, width, height };
    const append = (name, attrs, content) => svg.append(node(name, attrs, content));
    const textStyle = { fill: '#c3bfb6', 'font-size': 11, 'font-family': 'DM Sans, Arial, sans-serif' };
    const title = months[horizonIndex] + ' forecast for ' + karat + 'K gold of ' + price(h.price) + ' per ' + units[unit].long + ' on ' + longDate.format(h.target) + '. Use left and right arrows to inspect daily values.';
    svg.setAttribute('aria-label', title);
    append('title', {}, title);
    append('rect', { x: x(last), y: top, width: right - x(last), height: bottom - top, fill: '#e5c58b', 'fill-opacity': .045 });
    for (let v = floor; v <= ceiling + step * .001; v += step) {
      const py = y(v / factor);
      append('line', { x1: left, x2: right, y1: py, y2: py, stroke: '#e7e0d1', 'stroke-opacity': .19, 'stroke-dasharray': '3 4', 'stroke-width': .8 });
      append('text', { ...textStyle, x: left - 8, y: py + 4, 'text-anchor': 'end' },
        v.toLocaleString('en-US', { maximumFractionDigits: step < 1 ? 2 : step % 1 ? 1 : 0 }));
    }
    const tickCount = short ? 4 : 6;
    for (let i = 0; i < tickCount; i++) {
      const t = start + Math.round((end - start) / DAY * i / (tickCount - 1)) * DAY;
      append('text', { ...textStyle, x: x(t), y: height - 6, 'text-anchor': i === 0 ? 'start' : i === tickCount - 1 ? 'end' : 'middle' }, shortDate.format(t));
    }
    const historic = chartData.filter(p => p.kind === 'historical');
    const future = [{ time: last, value: base, lower: base, upper: base }, ...chartData.filter(p => p.kind === 'forecast')];
    const path = (points, field) => points.map((p, i) => (i ? 'L' : 'M') + x(p.time).toFixed(1) + ',' + y(p[field]).toFixed(1)).join(' ');
    const band = path(future, 'upper') + ' ' + path([...future].reverse(), 'lower').replace(/^M/, 'L') + ' Z';
    append('path', { d: band, fill: '#c19b4f', 'fill-opacity': .17 });
    append('path', { d: path(future, 'upper'), fill: 'none', stroke: '#776542', 'stroke-width': .8 });
    append('path', { d: path(future, 'lower'), fill: 'none', stroke: '#776542', 'stroke-width': .8 });
    append('path', { d: path(historic, 'value'), fill: 'none', stroke: '#e5e3de', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
    append('line', { x1: x(last), x2: x(last), y1: top - 6, y2: bottom, stroke: '#8e8065', 'stroke-dasharray': '3 4', 'stroke-width': .8 });
    append('text', { ...textStyle, x: x(last), y: 14, 'text-anchor': 'middle', fill: '#d8c193' }, 'Forecast starts');
    append('path', { d: path(future, 'value'), fill: 'none', stroke: '#ebc374', 'stroke-width': 2.1, 'stroke-dasharray': '4 4', 'stroke-linecap': 'round' });
    append('circle', { cx: x(last), cy: y(base), r: 3.3, fill: '#e3dec9', stroke: '#191a18', 'stroke-width': 1.5 });
    append('circle', { cx: x(end), cy: y(h.price), r: 3.8, fill: '#eac274', stroke: '#24211b', 'stroke-width': 1.5 });
  }

  function inspect(index) {
    if (!chartPosition || !chartData.length) return;
    activePoint = Math.max(0, Math.min(chartData.length - 1, index));
    const p = chartData[activePoint], loc = chartPosition, px = loc.x(p.time), py = loc.y(p.value);
    $('chart-cursor')?.remove();
    const group = node('g', { id: 'chart-cursor', 'pointer-events': 'none' });
    group.append(node('line', { x1: px, x2: px, y1: loc.top, y2: loc.bottom, stroke: '#b4b4a7', 'stroke-dasharray': '2 3' }),
      node('circle', { cx: px, cy: py, r: 4, fill: '#f2d291', stroke: '#191a18', 'stroke-width': 1.5 }));
    $('chart').append(group);
    const tip = $('tooltip');
    tip.innerHTML = shortDate.format(p.time) + ' · ' + (p.kind === 'forecast' ? 'Forecast' : 'Historical') + '<strong>' + price(p.value) + '</strong>';
    tip.hidden = false;
    const tipWidth = tip.offsetWidth;
    tip.style.left = Math.min(loc.width - tipWidth - 2, Math.max(2, px < loc.width / 2 ? px + 10 : px - tipWidth - 10)) + 'px';
    tip.style.top = Math.max(2, Math.min(loc.height - tip.offsetHeight - 3, py - 30)) + 'px';
    $('chart').setAttribute('aria-label', longDate.format(p.time) + ', ' + p.kind + ', ' + price(p.value));
  }
  function resetCursor() {
    $('tooltip').hidden = true;
    $('chart-cursor')?.remove();
    activePoint = -1;
    $('chart').setAttribute('aria-label', $('chart').querySelector('title')?.textContent || 'Gold price chart');
  }
  $('chart').addEventListener('pointermove', event => {
    if (!chartPosition || !chartData.length) return;
    const pos = event.clientX - $('chart').getBoundingClientRect().left;
    if (pos < chartPosition.left || pos > chartPosition.right + 5) return resetCursor();
    let best = 0;
    for (let i = 1; i < chartData.length; i++)
      if (Math.abs(chartPosition.x(chartData[i].time) - pos) < Math.abs(chartPosition.x(chartData[best].time) - pos)) best = i;
    inspect(best);
  });
  $('chart').addEventListener('pointerleave', resetCursor);
  $('chart').addEventListener('blur', resetCursor);
  $('chart').addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(e.key)) return;
    e.preventDefault();
    if (e.key === 'Escape') return resetCursor();
    const origin = activePoint < 0 ? chartData.findLastIndex(p => p.kind === 'historical') : activePoint;
    inspect(e.key === 'Home' ? 0 : e.key === 'End' ? chartData.length - 1 : origin + (e.key === 'ArrowLeft' ? -1 : 1));
  });

  function navigate() {
    const method = location.hash === '#methodology';
    $('methodology').hidden = !method;
    $('overview').hidden = method;
    document.querySelectorAll('[data-nav]').forEach(a => {
      if (a.dataset.nav === (method ? 'methodology' : 'overview')) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    document.title = method ? 'Methodology | Aurum' : 'Gold Forecast | Aurum';
    requestAnimationFrame(renderChart);
  }
  window.addEventListener('hashchange', () => { navigate(); if (location.hash !== '#main') window.scrollTo(0, 0); });
  document.querySelectorAll('#segments,#horizon-list').forEach(el => el.addEventListener('click', e => {
    const button = e.target.closest('button[data-index]');
    if (!button) return;
    horizonIndex = Number(button.dataset.index);
    const keyboard = e.detail === 0;
    render();
    if (keyboard) el.querySelector('[aria-pressed=true]').focus();
  }));
  $('units').addEventListener('change', () => {
    [currency, unit] = $('units').value.split('-');
    try { localStorage.setItem('aurum.display', $('units').value); } catch {}
    render();
  });
  $('purity').addEventListener('change', event => {
    karat = Number(event.target.value);
    try { localStorage.setItem('aurum.karat', String(karat)); } catch {}
    render();
  });
  function prepareDownload() {
    const f = displayFactor(), precision = decimals();
    const rows = [['Date', 'Series', karat + 'K ' + currency + ' per ' + units[unit].long, 'Lower 80%', 'Upper 80%'],
      ...chartData.map(p => [new Date(p.time).toISOString().slice(0, 10), p.kind, (p.value * f).toFixed(precision),
        p.lower === undefined ? '' : (p.lower * f).toFixed(precision), p.upper === undefined ? '' : (p.upper * f).toFixed(precision)])];
    const link = $('export');
    link.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(rows.map(r => r.join(',')).join('\r\n'));
    link.download = 'aurum-' + karat + 'k-' + forecasts[horizonIndex].key + '-' + currency + '-' + unit + '-' + new Date(forecasts[horizonIndex].target).toISOString().slice(0, 10) + '.csv';
  }

  async function update(manual = false) {
    const btn = $('refresh-button');
    if (btn.disabled) return;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    try {
      const url = location.protocol === 'file:' ? window.AURUM_PUBLIC_API : '/api/forecast';
      if (!url) throw new Error('Saved copy');
      const reply = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(45000) });
      if (!reply.ok) throw new Error('Forecast unavailable');
      const next = await reply.json();
      if (!Array.isArray(next.rows) || next.rows.length < 500 || next.forecasts?.length !== 3 || !Number.isFinite(Date.parse(next.calculatedAt))) throw new Error('Incomplete forecast');
      if (next.rows.at(-1)[0] >= rows.at(-1)[0] && Date.parse(next.calculatedAt) >= Date.parse(calculatedAt)) {
        ({ rows, forecasts, calculatedAt } = next);
      }
      feedState = next.status === 'saved' ? 'offline' : 'ready';
      render();
      if (manual) notify((feedState === 'ready' ? 'Latest shared forecast. Quote from ' : 'Price feed unavailable. Saved quote from ') + longDate.format(asDate(rows.at(-1)[0])) + '.');
    } catch {
      feedState = 'offline';
      renderDate();
      if (manual) notify('The price feed is unavailable. Showing the saved quote from ' + longDate.format(asDate(rows.at(-1)[0])) + '.');
    } finally { btn.disabled = false; btn.removeAttribute('aria-busy'); }
  }
  $('refresh-button').addEventListener('click', () => update(true));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });
  setInterval(() => { if (!document.hidden) update(); }, 30 * 60 * 1000);
  new ResizeObserver(renderChart).observe($('chart-frame'));
  navigate();
  render();
  update();
})();
