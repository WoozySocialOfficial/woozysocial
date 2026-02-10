/**
 * Simple Stress Test for Woozy Social API
 * Run with: npm run stress-test
 *
 * No external dependencies required!
 */

import https from 'https';
import http from 'http';

// Configuration - adjust these values to stress test
const CONFIG = {
  baseUrl: process.env.API_URL || 'https://woozysocials.com',
  concurrentUsers: 100,     // Safe default
  totalRequests: 500,       // Quick test
  delayBetweenBatches: 50,  // Small delay between batches
};

// Endpoints to test
const ENDPOINTS = [
  { method: 'GET', path: '/api/health', name: 'Health Check' },
];

// Results tracking
const results = {
  total: 0,
  success: 0,
  failed: 0,
  times: [],
  errors: [],
  startTime: null,
  endTime: null,
};

// Make HTTP request
function makeRequest(endpoint) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const url = new URL(endpoint.path, CONFIG.baseUrl);
    const protocol = url.protocol === 'https:' ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: endpoint.method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'WoozyStressTest/1.0',
      },
      timeout: 30000,
    };

    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        const duration = Date.now() - startTime;
        resolve({
          success: res.statusCode >= 200 && res.statusCode < 400,
          status: res.statusCode,
          duration,
          endpoint: endpoint.name,
        });
      });
    });

    req.on('error', (error) => {
      const duration = Date.now() - startTime;
      resolve({
        success: false,
        status: 0,
        duration,
        endpoint: endpoint.name,
        error: error.message,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        success: false,
        status: 0,
        duration: 30000,
        endpoint: endpoint.name,
        error: 'Request timeout',
      });
    });

    req.end();
  });
}

// Run batch of requests
async function runBatch(batchSize) {
  const endpoint = ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)];
  const promises = Array(batchSize).fill().map(() => makeRequest(endpoint));
  const batchResults = await Promise.all(promises);

  batchResults.forEach((result) => {
    results.total++;
    if (result.success) {
      results.success++;
    } else {
      results.failed++;
      if (result.error) {
        results.errors.push(result.error);
      }
    }
    results.times.push(result.duration);
  });

  return batchResults;
}

// Calculate statistics
function calculateStats() {
  const times = results.times.sort((a, b) => a - b);
  const sum = times.reduce((a, b) => a + b, 0);

  return {
    totalRequests: results.total,
    successfulRequests: results.success,
    failedRequests: results.failed,
    successRate: ((results.success / results.total) * 100).toFixed(2) + '%',
    avgResponseTime: (sum / times.length).toFixed(2) + 'ms',
    minResponseTime: times[0] + 'ms',
    maxResponseTime: times[times.length - 1] + 'ms',
    p50: times[Math.floor(times.length * 0.5)] + 'ms',
    p90: times[Math.floor(times.length * 0.9)] + 'ms',
    p95: times[Math.floor(times.length * 0.95)] + 'ms',
    p99: times[Math.floor(times.length * 0.99)] + 'ms',
    totalDuration: ((results.endTime - results.startTime) / 1000).toFixed(2) + 's',
    requestsPerSecond: (results.total / ((results.endTime - results.startTime) / 1000)).toFixed(2),
    uniqueErrors: [...new Set(results.errors)],
  };
}

// Print progress bar
function printProgress(current, total) {
  const percentage = Math.floor((current / total) * 100);
  const filled = Math.floor(percentage / 2);
  const empty = 50 - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  process.stdout.write(`\r[${bar}] ${percentage}% (${current}/${total})`);
}

// Main stress test function
async function runStressTest() {
  console.log('\n🚀 Starting Stress Test for Woozy Social API\n');
  console.log('Configuration:');
  console.log(`  Base URL: ${CONFIG.baseUrl}`);
  console.log(`  Concurrent Users: ${CONFIG.concurrentUsers}`);
  console.log(`  Total Requests: ${CONFIG.totalRequests}`);
  console.log(`  Endpoints: ${ENDPOINTS.map(e => e.name).join(', ')}`);
  console.log('\n');

  results.startTime = Date.now();

  const batches = Math.ceil(CONFIG.totalRequests / CONFIG.concurrentUsers);

  for (let i = 0; i < batches; i++) {
    const remaining = CONFIG.totalRequests - (i * CONFIG.concurrentUsers);
    const batchSize = Math.min(CONFIG.concurrentUsers, remaining);

    await runBatch(batchSize);
    printProgress(results.total, CONFIG.totalRequests);

    if (i < batches - 1) {
      await new Promise(r => setTimeout(r, CONFIG.delayBetweenBatches));
    }
  }

  results.endTime = Date.now();

  console.log('\n\n');
  console.log('📊 STRESS TEST RESULTS');
  console.log('═'.repeat(50));

  const stats = calculateStats();

  console.log(`\n📈 Request Statistics:`);
  console.log(`   Total Requests:     ${stats.totalRequests}`);
  console.log(`   Successful:         ${stats.successfulRequests}`);
  console.log(`   Failed:             ${stats.failedRequests}`);
  console.log(`   Success Rate:       ${stats.successRate}`);

  console.log(`\n⏱️  Response Times:`);
  console.log(`   Average:            ${stats.avgResponseTime}`);
  console.log(`   Min:                ${stats.minResponseTime}`);
  console.log(`   Max:                ${stats.maxResponseTime}`);
  console.log(`   p50 (median):       ${stats.p50}`);
  console.log(`   p90:                ${stats.p90}`);
  console.log(`   p95:                ${stats.p95}`);
  console.log(`   p99:                ${stats.p99}`);

  console.log(`\n🏎️  Throughput:`);
  console.log(`   Total Duration:     ${stats.totalDuration}`);
  console.log(`   Requests/Second:    ${stats.requestsPerSecond}`);

  if (stats.uniqueErrors.length > 0) {
    console.log(`\n❌ Errors Encountered:`);
    stats.uniqueErrors.forEach(e => console.log(`   - ${e}`));
  }

  console.log('\n' + '═'.repeat(50));

  // Return exit code based on success rate
  const successRate = parseFloat(stats.successRate);
  if (successRate < 90) {
    console.log('\n⚠️  Warning: Success rate below 90%!');
    process.exit(1);
  } else {
    console.log('\n✅ Stress test passed!');
    process.exit(0);
  }
}

// Run the test
runStressTest().catch(console.error);
