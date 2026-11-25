# Aurum Gold Outlook

[Open the gold dashboard](https://aurum-gold-outlook.vercel.app/)

Aurum shows reference gold prices per gram in Jordanian dinars for 24K, 21K and 18K gold. Select a karat and a forecast horizon to explore the estimated price and historical error range for one week, one month or three months. The Methodology tab includes the model’s performance against a flat-price benchmark.

## Data and forecasts

The server combines gold and exchange-rate observations published by Narodowy Bank Polski. It fits a ridge regression model separately for each horizon. The dashboard converts the results to the selected currency, weight and gold purity. Local retail quotes can differ because of making charges and dealer margins.

Vercel schedules a refresh daily at 14:00 UTC. The public forecast endpoint can also refresh a missed daily calculation. When the source is unavailable, the dashboard displays the last saved figures and their dates.

## Run the dashboard

With Node.js 24 installed, run these commands from the project root.

```sh
npm ci
npx vercel dev
```

Open the local address printed by Vercel. In a Vercel deployment, set the private environment variable `CRON_SECRET` to authenticate scheduled requests to `/api/daily`.

The interface and interactive glass effect live in `public/`. The daily data update and forecasting model live in `lib/`. Vercel serves the request handlers in `api/`.
