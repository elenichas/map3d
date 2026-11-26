import { useEffect, useState } from 'react';
import { fetchWeather, type Weather } from '../data/weather';

/** Current weather at a point, refreshed every 10 minutes while enabled. */
export function useWeather(point: { lat: number; lng: number } | null, enabled: boolean) {
  const [state, setState] = useState<{ key: string; weather?: Weather; error?: string }>();
  const key = point ? `${point.lat.toFixed(2)},${point.lng.toFixed(2)}` : '';
  useEffect(() => {
    if (!enabled || !point) return;
    let active = true, controller = new AbortController();
    const load = () => {
      controller.abort(); controller = new AbortController();
      fetchWeather(point.lat, point.lng, controller.signal)
        .then(weather => { if (active) setState({ key, weather }); })
        .catch(error => { if (active && error?.name !== 'AbortError') setState(previous => ({ key, weather: previous?.key === key ? previous.weather : undefined, error: 'Live weather is unavailable right now.' })); });
    };
    load();
    const timer = setInterval(load, 10 * 60 * 1000);
    return () => { active = false; controller.abort(); clearInterval(timer); };
    // The rounded key identifies the place; the point object can change identity without moving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  const current = enabled && state?.key === key ? state : undefined;
  return { weather: current?.weather, error: current?.error, loading: enabled && !!point && !current };
}
