const { timingSafeEqual } = require('node:crypto');
const { getForecast } = require('../lib/forecast');
module.exports = async function daily(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') return response.setHeader('Allow', 'GET').status(405).end();
  const secret = process.env.CRON_SECRET;
  const received = Buffer.from(request.headers.authorization || '');
  const expected = Buffer.from('Bearer ' + (secret || ''));
  if (!secret || expected.length !== received.length || !timingSafeEqual(received, expected))
    return response.status(401).end();
  try {
    const snapshot = await getForecast({ scheduled: true });
    return response.status(200).json({ calculatedAt: snapshot.calculatedAt, quoteDate: snapshot.rows.at(-1)[0], horizons: snapshot.forecasts.length });
  } catch {
    return response.status(503).json({ error: 'Daily calculation unavailable' });
  }
};
