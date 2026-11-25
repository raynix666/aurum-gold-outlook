const { getForecast } = require('../lib/forecast');
module.exports = async function forecast(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  if (request.method !== 'GET') return response.setHeader('Allow', 'GET').status(405).end();
  const snapshot = await getForecast();
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Vercel-CDN-Cache-Control', 'public, s-maxage=' + (snapshot.status === 'ready' ? 120 : 15));
  return response.status(200).json(snapshot);
};
