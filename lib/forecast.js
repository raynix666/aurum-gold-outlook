const { getCache } = require('@vercel/functions');
const seed = require('../public/seed');
const model = require('./model');

const DAY = 86400000;
const iso = ms => new Date(ms).toISOString().slice(0, 10);
const CACHE_KEY = 'aurum-fine-gold-ridge-v1';
const inFlight = new Map();

async function readSource(path) {
  const response = await fetch('https://api.nbp.pl/api/' + path + '/?format=json', {
    signal: AbortSignal.timeout(8500), headers: { Accept: 'application/json' }
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('NBP returned ' + response.status);
  return response.json();
}

async function fetchWindow(range) {
  const [gold, fx] = await Promise.all([
    readSource('cenyzlota/' + range),
    readSource('exchangerates/rates/a/usd/' + range)
  ]);
  if (gold === null && fx === null) return [];
  if (!Array.isArray(gold) || !Array.isArray(fx?.rates)) throw new Error('Incomplete NBP response');
  const rates = new Map(fx.rates.map(r => [r.effectiveDate, r.mid]));
  const observations = [];
  for (const record of gold) {
    const rate = rates.get(record.data);
    if (rate === undefined) continue;
    if (!Number.isFinite(record.cena) || record.cena <= 0 || !Number.isFinite(rate) || rate <= 0)
      throw new Error('Invalid NBP price');
    observations.push([record.data, Number((record.cena * 31.1034768 / rate).toFixed(4))]);
  }
  if (gold.length && fx.rates.length && !observations.length) throw new Error('No matching quote dates');
  return observations;
}

async function calculate(previous, now = Date.now()) {
  const until = Date.parse(iso(now));
  const lookback = until - 6 * 366 * DAY;
  const start = Math.max(Date.parse(previous.rows.at(-1)[0]) - 7 * DAY, lookback);
  const ranges = [];
  for (let date = start; date <= until; date += 89 * DAY)
    ranges.push(iso(date) + '/' + iso(Math.min(date + 88 * DAY, until)));
  const combined = new Map(previous.rows.filter(([date]) => date >= iso(lookback)));
  for (let i = 0; i < ranges.length; i += 4) {
    const batches = await Promise.all(ranges.slice(i, i + 4).map(fetchWindow));
    for (const entries of batches) for (const [date, price] of entries) combined.set(date, price);
  }
  const rows = [...combined].sort(([a], [b]) => a.localeCompare(b)).slice(-1600);
  return { rows, forecasts: model.run(rows), calculatedAt: new Date(now).toISOString() };
}

// All requests use the same daily cutoff and function region. A missed invocation
// can therefore be recovered by the next reader, including after cache eviction.
async function getForecast({ scheduled = false } = {}) {
  const now = Date.now();
  const cycle = iso(now - 14 * 3600000);
  const cache = getCache();
  let prior = seed;
  try {
    const cached = await cache.get(CACHE_KEY);
    if (cached?.snapshot?.rows?.length >= 500) {
      prior = cached.snapshot;
      if (cached.cycle === cycle) return { ...prior, status: 'ready' };
    }
    if (!inFlight.has(cycle)) {
      const work = (async () => {
        const snapshot = await calculate(prior, now);
        await cache.set(CACHE_KEY, { cycle, snapshot }, { ttl: 30 * 86400 });
        return snapshot;
      })().finally(() => inFlight.delete(cycle));
      inFlight.set(cycle, work);
    }
    return { ...await inFlight.get(cycle), status: 'ready' };
  } catch (error) {
    console.error('Forecast update failed:', error.message);
    if (scheduled) throw error;
    return { ...prior, status: 'saved' };
  }
}
module.exports = { calculate, getForecast };
