import { onCLS, onINP, onFCP, onLCP, onTTFB, type Metric } from "web-vitals";

const SAMPLE_RATE = 0.2;
const ENDPOINT = "/api/rum";

function shouldSample(): boolean {
  try {
    return Math.random() < SAMPLE_RATE;
  } catch {
    return false;
  }
}

function beacon(metric: Metric): void {
  const payload = JSON.stringify({
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    url: window.location.pathname,
  });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: "application/json" }));
      return;
    }
  } catch {
    // fall through to fetch
  }
  fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {});
}

export function initWebVitals(): void {
  if (!shouldSample()) return;
  const handler = (metric: Metric) => beacon(metric);
  onCLS(handler);
  onINP(handler);
  onFCP(handler);
  onLCP(handler);
  onTTFB(handler);
}
