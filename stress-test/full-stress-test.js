/**
 * Full Stress Test for Woozy Social API
 * Tests all critical endpoints
 * Run with: npm run stress-test:full
 */

import https from 'https';
import http from 'http';

// Configuration - AGGRESSIVE
const CONFIG = {
  baseUrl: process.env.API_URL || 'https://woozysocials.com',
  concurrentUsers: 200,
  requestsPerEndpoint: 500,
  delayBetweenBatches: 10,
};

// All critical endpoints to test
const ENDPOINTS = [
  // Health & Status
  { method: 'GET', path: '/api/health', name: 'Health Check', requiresAuth: false },

  // Post Operations (these hit the database)
  { method: 'GET', path: '/api/post-history', name: 'Post History', requiresAuth: true },
  { method: 'GET', path: '/api/post/pending-approvals', name: 'Pending Approvals', requiresAuth: true },

  // Workspace Operations
  { method: 'GET', path: '/api/workspace/list', name: 'Workspace List', requiresAuth: true },

  // User Operations
  { method: 'GET', path: '/api/user-accounts', name: 'User Accounts', requiresAuth: true },

  // Notifications
  { method: 'GET', path: '/api/notifications/list', name: 'Notifications', requiresAuth: true },

  // Invitations
  { method: 'GET', path: '/api/invitations/list', name: 'Invitations List', requiresAuth: true },
];

// Results tracking per endpoint
const results = {};
ENDPOINTS.forEach(ep => {
  results[ep.name] = {
    total: 0,
    success: 0,
    failed: 0,
    times: [],
    errors: [],
    statusCodes: {},
  };
});

let globalStartTime = null;
let globalEndTime = null;

// Make HTTP request
function makeRequest(endpoint) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const url = new URL(endpoint.path, CONFIG.baseUrl);
    const protocol = url.protocol === 'https:' ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + (url.search || ''),
      method: endpoint.method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'WoozyStressTest/2.0',
      },
      timeout: 30000,
    };

    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        const duration = Date.now() - startTime;
        // Consider 200, 401, 403 as "handled" responses (not server errors)
        const isSuccess = res.statusCode < 500;
        resolve({
          success: isSuccess,
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

// Run batch of requests for a specific endpoint
async function runBatchForEndpoint(endpoint, batchSize) {
  const promises = Array(batchSize).fill().map(() => makeRequest(endpoint));
  const batchResults = await Promise.all(promises);

  batchResults.forEach((result) => {
    const r = results[endpoint.name];
    r.total++;
    if (result.success) {
      r.success++;
    } else {
      r.failed++;
      if (result.error) {
        r.errors.push(result.error);
      }
    }
    r.times.push(result.duration);
    r.statusCodes[result.status] = (r.statusCodes[result.status] || 0) + 1;
  });

  return batchResults;
}

// Calculate statistics for an endpoint
function calculateStats(endpointName) {
  const r = results[endpointName];
  if (r.times.length === 0) return null;

  const times = [...r.times].sort((a, b) => a - b);
  const sum = times.reduce((a, b) => a + b, 0);

  return {
    totalRequests: r.total,
    successful: r.success,
    failed: r.failed,
    successRate: ((r.success / r.total) * 100).toFixed(1) + '%',
    avgTime: Math.round(sum / times.length) + 'ms',
    minTime: times[0] + 'ms',
    maxTime: times[times.length - 1] + 'ms',
    p50: times[Math.floor(times.length * 0.5)] + 'ms',
    p95: times[Math.floor(times.length * 0.95)] + 'ms',
    statusCodes: r.statusCodes,
    errors: [...new Set(r.errors)],
  };
}

// Print progress
function printProgress(endpoint, current, total) {
  const percentage = Math.floor((current / total) * 100);
  process.stdout.write(`\r  Testing ${endpoint.padEnd(20)} ${percentage}%`);
}

// Main stress test function
async function runFullStressTest() {
  console.log('\n🚀 FULL STRESS TEST - Woozy Social API\n');
  console.log('═'.repeat(60));
  console.log(`Base URL: ${CONFIG.baseUrl}`);
  console.log(`Concurrent Users: ${CONFIG.concurrentUsers}`);
  console.log(`Requests per Endpoint: ${CONFIG.requestsPerEndpoint}`);
  console.log(`Total Endpoints: ${ENDPOINTS.length}`);
  console.log(`Total Requests: ${ENDPOINTS.length * CONFIG.requestsPerEndpoint}`);
  console.log('═'.repeat(60));
  console.log('\n📡 Testing Endpoints:\n');

  globalStartTime = Date.now();

  // Test each endpoint
  for (const endpoint of ENDPOINTS) {
    const batches = Math.ceil(CONFIG.requestsPerEndpoint / CONFIG.concurrentUsers);

    for (let i = 0; i < batches; i++) {
      const remaining = CONFIG.requestsPerEndpoint - (i * CONFIG.concurrentUsers);
      const batchSize = Math.min(CONFIG.concurrentUsers, remaining);

      await runBatchForEndpoint(endpoint, batchSize);
      printProgress(endpoint.name, results[endpoint.name].total, CONFIG.requestsPerEndpoint);

      if (i < batches - 1) {
        await new Promise(r => setTimeout(r, CONFIG.delayBetweenBatches));
      }
    }

    const stats = calculateStats(endpoint.name);
    console.log(`\r  ✓ ${endpoint.name.padEnd(20)} ${stats.successRate.padStart(6)} | Avg: ${stats.avgTime.padStart(7)} | p95: ${stats.p95.padStart(7)}`);
  }

  globalEndTime = Date.now();

  // Print detailed results
  console.log('\n\n📊 DETAILED RESULTS BY ENDPOINT');
  console.log('═'.repeat(60));

  let totalRequests = 0;
  let totalSuccess = 0;
  let totalFailed = 0;
  let allTimes = [];

  for (const endpoint of ENDPOINTS) {
    const stats = calculateStats(endpoint.name);
    if (!stats) continue;

    totalRequests += stats.totalRequests;
    totalSuccess += stats.successful;
    totalFailed += stats.failed;
    allTimes = allTimes.concat(results[endpoint.name].times);

    console.log(`\n📌 ${endpoint.name}`);
    console.log(`   Requests: ${stats.totalRequests} | Success: ${stats.successful} | Failed: ${stats.failed}`);
    console.log(`   Success Rate: ${stats.successRate}`);
    console.log(`   Response Times: Avg ${stats.avgTime} | Min ${stats.minTime} | Max ${stats.maxTime}`);
    console.log(`   Percentiles: p50 ${stats.p50} | p95 ${stats.p95}`);
    console.log(`   Status Codes: ${JSON.stringify(stats.statusCodes)}`);

    if (stats.errors.length > 0) {
      console.log(`   ❌ Errors: ${stats.errors.join(', ')}`);
    }
  }

  // Overall summary
  const totalDuration = (globalEndTime - globalStartTime) / 1000;
  allTimes.sort((a, b) => a - b);
  const avgTime = Math.round(allTimes.reduce((a, b) => a + b, 0) / allTimes.length);

  console.log('\n\n📈 OVERALL SUMMARY');
  console.log('═'.repeat(60));
  console.log(`   Total Requests:     ${totalRequests}`);
  console.log(`   Successful:         ${totalSuccess}`);
  console.log(`   Failed:             ${totalFailed}`);
  console.log(`   Overall Success:    ${((totalSuccess / totalRequests) * 100).toFixed(2)}%`);
  console.log(`   Avg Response Time:  ${avgTime}ms`);
  console.log(`   Total Duration:     ${totalDuration.toFixed(2)}s`);
  console.log(`   Throughput:         ${(totalRequests / totalDuration).toFixed(2)} req/s`);
  console.log('═'.repeat(60));

  // Identify bottlenecks
  console.log('\n🔍 BOTTLENECK ANALYSIS');
  console.log('─'.repeat(60));

  const endpointStats = ENDPOINTS.map(ep => ({
    name: ep.name,
    ...calculateStats(ep.name)
  })).filter(s => s.totalRequests);

  // Sort by average response time (slowest first)
  const slowest = [...endpointStats].sort((a, b) =>
    parseInt(b.avgTime) - parseInt(a.avgTime)
  );

  console.log('\n⚠️  Slowest Endpoints:');
  slowest.slice(0, 3).forEach((ep, i) => {
    console.log(`   ${i + 1}. ${ep.name}: ${ep.avgTime} avg, ${ep.p95} p95`);
  });

  // Sort by failure rate (highest first)
  const mostFailures = [...endpointStats].sort((a, b) =>
    parseFloat(b.successRate) - parseFloat(a.successRate)
  ).reverse();

  const failingEndpoints = mostFailures.filter(ep => parseFloat(ep.successRate) < 100);
  if (failingEndpoints.length > 0) {
    console.log('\n❌ Endpoints with Failures:');
    failingEndpoints.forEach(ep => {
      console.log(`   - ${ep.name}: ${ep.successRate} success (${ep.failed} failures)`);
    });
  } else {
    console.log('\n✅ All endpoints handled requests without server errors!');
  }

  console.log('\n' + '═'.repeat(60));

  // Exit with appropriate code
  const overallSuccessRate = (totalSuccess / totalRequests) * 100;
  if (overallSuccessRate < 90) {
    console.log('\n⚠️  Overall success rate below 90% - needs attention!');
    process.exit(1);
  } else {
    console.log('\n✅ Full stress test completed successfully!');
    process.exit(0);
  }
}

// Run the test
runFullStressTest().catch(console.error);
