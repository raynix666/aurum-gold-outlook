/* Gold forecasts from past observations, fitted separately for each calendar horizon. */
const GoldModel = (() => {
  const DAY = 86400000;
  const horizons = [
    { key: 'week', title: 'One week', short: '1W', days: 7 },
    { key: 'month', title: 'One month', short: '1M', months: 1 },
    { key: 'quarter', title: 'Three months', short: '3M', months: 3 }
  ];

  function targetTime(time, horizon) {
    if (horizon.days) return time + horizon.days * DAY;
    const date = new Date(time);
    const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + horizon.months, 1));
    const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(date.getUTCDate(), lastDay));
    return +next;
  }

  function features(logs, i) {
    const momentum = n => logs[i] - logs[i - n];
    let sum = 0;
    for (let j = i - 19; j <= i; j++) sum += (logs[j] - logs[j - 1]) ** 2;
    return [momentum(5), momentum(20), momentum(60), Math.sqrt(sum / 20)];
  }

  // Gaussian elimination on the small positive-definite ridge system.
  function solve(matrix, response) {
    const a = matrix.map((row, i) => [...row, response[i]]);
    for (let i = 0; i < a.length; i++) {
      const pivot = a[i][i];
      for (let k = i; k <= a.length; k++) a[i][k] /= pivot;
      for (let j = 0; j < a.length; j++) {
        if (i === j) continue;
        const weight = a[j][i];
        for (let k = i; k <= a.length; k++) a[j][k] -= weight * a[i][k];
      }
    }
    return a.map(row => row.at(-1));
  }

  function predict(samples, x, cutoff) {
    const train = samples.filter(s => s.available <= cutoff && s.i >= cutoff - 1008);
    const n = train.length;
    if (n < 100) throw new Error('More price history is needed.');
    const size = x.length;
    const mean = Array(size).fill(0);
    const scale = Array(size).fill(0);
    let avgReturn = 0;
    for (const s of train) {
      avgReturn += s.y / n;
      for (let j = 0; j < size; j++) mean[j] += s.x[j] / n;
    }
    for (const s of train) {
      for (let j = 0; j < size; j++) scale[j] += (s.x[j] - mean[j]) ** 2 / n;
    }
    const sd = scale.map(v => Math.sqrt(v) || 1);
    const gram = Array.from({ length: size }, (_, i) => Array.from({ length: size }, (_, j) => i === j ? n * .5 : 0));
    const rhs = Array(size).fill(0);
    for (const s of train) {
      const z = s.x.map((v, j) => (v - mean[j]) / sd[j]);
      for (let j = 0; j < size; j++) {
        rhs[j] += z[j] * (s.y - avgReturn);
        for (let k = 0; k < size; k++) gram[j][k] += z[j] * z[k];
      }
    }
    const weights = solve(gram, rhs);
    const estimate = weights.reduce((v, w, j) => v + w * (x[j] - mean[j]) / sd[j], avgReturn);
    return estimate * .5; // Equal-weight blend with the flat-price baseline.
  }

  function run(rows) {
    if (rows.length < 500) throw new Error('At least 500 daily observations are required.');
    const times = rows.map(r => Date.parse(r[0] + 'T00:00:00Z'));
    const logs = rows.map(r => Math.log(r[1]));
    const xs = logs.map((_, i) => i >= 60 ? features(logs, i) : null);
    const last = rows.length - 1;
    const base = rows[last][1];
    return horizons.map(h => {
      const samples = [];
      let end = 60;
      for (let i = 60; i < last; i++) {
        const due = targetTime(times[i], h);
        if (due > times[last]) break;
        while (end < last && times[end + 1] <= due) end++;
        if (end > i && due - times[end] <= 7 * DAY) {
          const available = times[end] < due ? end + 1 : end;
          samples.push({ i, end, available, x: xs[i], y: logs[end] - logs[i] });
        }
      }
      const errors = [];
      let absolutePct = 0, baselinePct = 0;
      // Origins every five observations over the most recent two years with outcomes.
      const lastOrigin = samples.at(-1).i;
      for (const s of samples) {
        if (s.i < Math.max(240, lastOrigin - 500) || (lastOrigin - s.i) % 5 !== 0) continue;
        const estimated = predict(samples, s.x, s.i);
        errors.push(Math.abs(s.y - estimated));
        absolutePct += Math.abs(Math.expm1(estimated - s.y)) * 100;
        baselinePct += Math.abs(Math.expm1(-s.y)) * 100;
      }
      errors.sort((a, b) => a - b);
      const radius = errors[Math.min(errors.length - 1, Math.ceil(errors.length * .8) - 1)];
      const move = predict(samples, xs[last], last);
      const price = base * Math.exp(move);
      return { ...h, target: targetTime(times[last], h), price, radius,
        lower: price * Math.exp(-radius), upper: price * Math.exp(radius), change: Math.expm1(move) * 100,
        count: errors.length, modelError: absolutePct / errors.length, baselineError: baselinePct / errors.length };
    });
  }
  return { run, horizons, targetTime, DAY };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = GoldModel;
