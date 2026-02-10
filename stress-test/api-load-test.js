import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metric to track errors
const errorRate = new Rate('errors');

// Test configuration
export const options = {
  // Stress test stages
  stages: [
    { duration: '30s', target: 10 },   // Ramp up to 10 users over 30s
    { duration: '1m', target: 10 },    // Stay at 10 users for 1 minute
    { duration: '30s', target: 50 },   // Ramp up to 50 users
    { duration: '1m', target: 50 },    // Stay at 50 users for 1 minute
    { duration: '30s', target: 100 },  // Ramp up to 100 users
    { duration: '1m', target: 100 },   // Stay at 100 users for 1 minute
    { duration: '30s', target: 0 },    // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests should be < 2s
    errors: ['rate<0.1'],               // Error rate should be < 10%
  },
};

// Change this to your API URL
const BASE_URL = __ENV.API_URL || 'https://woozysocials.com';

export default function () {
  // Test health endpoint
  const healthRes = http.get(`${BASE_URL}/api/health`);
  check(healthRes, {
    'health check status is 200': (r) => r.status === 200,
  });
  errorRate.add(healthRes.status !== 200);

  sleep(1);

  // Test post history endpoint (requires auth in real scenario)
  const historyRes = http.get(`${BASE_URL}/api/post-history`, {
    headers: {
      'Content-Type': 'application/json',
      // Add auth token here if needed
      // 'Authorization': `Bearer ${__ENV.AUTH_TOKEN}`,
    },
  });
  check(historyRes, {
    'post history status is 200 or 401': (r) => r.status === 200 || r.status === 401,
  });

  sleep(1);
}

export function handleSummary(data) {
  return {
    'stress-test/results.json': JSON.stringify(data, null, 2),
  };
}
