// Open-Meteo: free, no API key required - fits the "billiger" goal directly.
const MUNICH_LAT = 48.1351;
const MUNICH_LNG = 11.582;

export interface WeatherToday {
  willRain: boolean;
  maxTempC: number;
}

/**
 * "Wettercheck in der Orte-Datenbank" (project notes): skip places that
 * need good weather (Freibad, Biergarten) when today looks rainy, so an
 * indoor alternative gets picked instead.
 */
export async function getTodayWeather(): Promise<WeatherToday> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${MUNICH_LAT}&longitude=${MUNICH_LNG}` +
    `&daily=precipitation_probability_max,temperature_2m_max&timezone=Europe%2FBerlin&forecast_days=1`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo request failed: HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    daily: { precipitation_probability_max: number[]; temperature_2m_max: number[] };
  };

  const rainProbability = data.daily.precipitation_probability_max[0] ?? 0;
  return {
    willRain: rainProbability >= 50,
    maxTempC: data.daily.temperature_2m_max[0] ?? 15,
  };
}
