/**
 * Performance Test Worker
 * Deployed to Cloudflare to test VPS API response times from edge locations
 */

interface Env {
  VPS_API_URL: string;
  VPS_API_TOKEN: string;
}

interface TestResult {
  requestId: number;
  startTime: number;
  endTime: number;
  duration: number;
  status: number;
  success: boolean;
  error?: string;
}

interface TestSummary {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  requestsPerSecond: number;
  totalDurationMs: number;
  results: TestResult[];
}

async function sendWebhookRequest(env: Env, requestId: number): Promise<TestResult> {
  const startTime = Date.now();
  const payload = {
    from: `perftest${requestId}@example.com`,
    to: 'test@domain.com',
    subject: `Performance Test ${requestId} - ${Date.now()}`,
    messageId: `perf-test-${requestId}-${crypto.randomUUID()}`,
    timestamp: Date.now(),
    workerName: 'perf_test_worker',
  };

  try {
    const response = await fetch(`${env.VPS_API_URL}/api/webhook/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.VPS_API_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });

    const endTime = Date.now();
    return {
      requestId,
      startTime,
      endTime,
      duration: endTime - startTime,
      status: response.status,
      success: response.ok,
    };
  } catch (error) {
    const endTime = Date.now();
    return {
      requestId,
      startTime,
      endTime,
      duration: endTime - startTime,
      status: 0,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}


function calculatePercentile(sortedValues: number[], percentile: number): number {
  const index = Math.floor(sortedValues.length * percentile);
  return sortedValues[Math.min(index, sortedValues.length - 1)];
}

function generateSummary(results: TestResult[], totalDuration: number): TestSummary {
  const successful = results.filter(r => r.success);
  const durations = successful.map(r => r.duration).sort((a, b) => a - b);

  const sum = durations.reduce((a, b) => a + b, 0);
  const avg = durations.length > 0 ? sum / durations.length : 0;

  return {
    totalRequests: results.length,
    successfulRequests: successful.length,
    failedRequests: results.length - successful.length,
    averageMs: Math.round(avg * 100) / 100,
    minMs: durations.length > 0 ? durations[0] : 0,
    maxMs: durations.length > 0 ? durations[durations.length - 1] : 0,
    p50Ms: durations.length > 0 ? calculatePercentile(durations, 0.5) : 0,
    p95Ms: durations.length > 0 ? calculatePercentile(durations, 0.95) : 0,
    p99Ms: durations.length > 0 ? calculatePercentile(durations, 0.99) : 0,
    requestsPerSecond: Math.round((successful.length / (totalDuration / 1000)) * 100) / 100,
    totalDurationMs: totalDuration,
    results,
  };
}

async function runSequentialTest(env: Env, count: number): Promise<TestSummary> {
  const results: TestResult[] = [];
  const startTime = Date.now();

  for (let i = 0; i < count; i++) {
    const result = await sendWebhookRequest(env, i + 1);
    results.push(result);
  }

  const totalDuration = Date.now() - startTime;
  return generateSummary(results, totalDuration);
}

async function runConcurrentTest(env: Env, count: number, concurrency: number): Promise<TestSummary> {
  const results: TestResult[] = [];
  const startTime = Date.now();
  const batches = Math.ceil(count / concurrency);

  for (let batch = 0; batch < batches; batch++) {
    const batchSize = Math.min(concurrency, count - batch * concurrency);
    const promises: Promise<TestResult>[] = [];

    for (let i = 0; i < batchSize; i++) {
      const requestId = batch * concurrency + i + 1;
      promises.push(sendWebhookRequest(env, requestId));
    }

    const batchResults = await Promise.all(promises);
    results.push(...batchResults);
  }

  const totalDuration = Date.now() - startTime;
  return generateSummary(results, totalDuration);
}

async function getServerMetrics(env: Env): Promise<unknown> {
  try {
    const response = await fetch(`${env.VPS_API_URL}/api/admin/metrics`, {
      headers: {
        'Authorization': `Bearer ${env.VPS_API_TOKEN}`,
      },
    });
    return await response.json();
  } catch {
    return { error: 'Failed to fetch metrics' };
  }
}

// Dynamic rule test interfaces
interface DynamicRuleTestResult {
  requestId: number;
  subject: string;
  duration: number;
  action: string;
  ruleCreated: boolean;
  success: boolean;
  error?: string;
}

interface DynamicRuleTestSummary {
  totalRequests: number;
  successfulRequests: number;
  ruleCreatedAt: number | null;
  emailsBeforeBlock: number;
  detectionLatencyMs: number | null;
  averageResponseMs: number;
  results: DynamicRuleTestResult[];
}

async function sendDynamicRuleTestRequest(
  env: Env,
  requestId: number,
  subject: string
): Promise<DynamicRuleTestResult> {
  const startTime = Date.now();
  const payload = {
    from: `dynamictest${requestId}@spammer.com`,
    to: 'test@domain.com',
    subject: subject,
    messageId: `dynamic-test-${requestId}-${crypto.randomUUID()}`,
    timestamp: Date.now(),
    workerName: 'dynamic_test_worker',
  };

  try {
    const response = await fetch(`${env.VPS_API_URL}/api/webhook/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.VPS_API_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });

    const endTime = Date.now();
    const data = await response.json() as { action?: string };

    return {
      requestId,
      subject,
      duration: endTime - startTime,
      action: data.action || 'unknown',
      ruleCreated: data.action === 'reject' || data.action === 'delete',
      success: response.ok,
    };
  } catch (error) {
    const endTime = Date.now();
    return {
      requestId,
      subject,
      duration: endTime - startTime,
      action: 'error',
      ruleCreated: false,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function runDynamicRuleTest(env: Env, threshold: number = 5): Promise<DynamicRuleTestSummary> {
  const results: DynamicRuleTestResult[] = [];
  const testSubject = `[SPAM TEST] Special Offer ${Date.now()} - Buy Now!`;
  let ruleCreatedAt: number | null = null;
  let emailsBeforeBlock = 0;

  // Send emails with the same subject to trigger dynamic rule
  for (let i = 0; i < threshold + 3; i++) {
    const result = await sendDynamicRuleTestRequest(env, i + 1, testSubject);
    results.push(result);

    if (result.ruleCreated && ruleCreatedAt === null) {
      ruleCreatedAt = i + 1;
      emailsBeforeBlock = i;
    }

    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  const successful = results.filter(r => r.success);
  const avgResponse = successful.length > 0
    ? successful.reduce((sum, r) => sum + r.duration, 0) / successful.length
    : 0;

  return {
    totalRequests: results.length,
    successfulRequests: successful.length,
    ruleCreatedAt,
    emailsBeforeBlock,
    detectionLatencyMs: ruleCreatedAt !== null ? results[ruleCreatedAt - 1].duration : null,
    averageResponseMs: Math.round(avgResponse * 100) / 100,
    results,
  };
}

async function getDynamicRules(env: Env): Promise<unknown> {
  try {
    const response = await fetch(`${env.VPS_API_URL}/api/dynamic/config`, {
      headers: {
        'Authorization': `Bearer ${env.VPS_API_TOKEN}`,
      },
    });
    return await response.json();
  } catch {
    return { error: 'Failed to fetch dynamic rules' };
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (path === '/test/sequential') {
      const count = parseInt(url.searchParams.get('count') || '10');
      const metricsBefore = await getServerMetrics(env);
      const summary = await runSequentialTest(env, Math.min(count, 1000));
      const metricsAfter = await getServerMetrics(env);

      return new Response(JSON.stringify({
        testType: 'sequential',
        summary: { ...summary, results: undefined },
        serverMetrics: { before: metricsBefore, after: metricsAfter },
      }, null, 2), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (path === '/test/concurrent') {
      const count = parseInt(url.searchParams.get('count') || '20');
      const concurrency = parseInt(url.searchParams.get('concurrency') || '5');
      const metricsBefore = await getServerMetrics(env);
      const summary = await runConcurrentTest(env, Math.min(count, 1000), Math.min(concurrency, 50));
      const metricsAfter = await getServerMetrics(env);

      return new Response(JSON.stringify({
        testType: 'concurrent',
        concurrency,
        summary: { ...summary, results: undefined },
        serverMetrics: { before: metricsBefore, after: metricsAfter },
      }, null, 2), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (path === '/test/full') {
      const metricsBefore = await getServerMetrics(env);
      const sequential = await runSequentialTest(env, 20);
      const concurrent = await runConcurrentTest(env, 30, 10);
      const metricsAfter = await getServerMetrics(env);

      return new Response(JSON.stringify({
        testType: 'full',
        sequential: { ...sequential, results: undefined },
        concurrent: { ...concurrent, results: undefined },
        serverMetrics: { before: metricsBefore, after: metricsAfter },
        analysis: {
          sequentialAvgMs: sequential.averageMs,
          concurrentAvgMs: concurrent.averageMs,
          serverPhase1AvgMs: (metricsAfter as { phase1?: { averageMs: number } })?.phase1?.averageMs,
          networkOverheadMs: Math.round((sequential.averageMs - ((metricsAfter as { phase1?: { averageMs: number } })?.phase1?.averageMs || 0)) * 100) / 100,
        },
      }, null, 2), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (path === '/metrics') {
      const metrics = await getServerMetrics(env);
      return new Response(JSON.stringify(metrics, null, 2), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (path === '/test/dynamic') {
      const threshold = parseInt(url.searchParams.get('threshold') || '5');
      const rulesBefore = await getDynamicRules(env);
      const summary = await runDynamicRuleTest(env, Math.min(threshold, 20));
      const rulesAfter = await getDynamicRules(env);

      return new Response(JSON.stringify({
        testType: 'dynamic-rule',
        threshold,
        summary: {
          totalRequests: summary.totalRequests,
          successfulRequests: summary.successfulRequests,
          ruleCreatedAt: summary.ruleCreatedAt,
          emailsBeforeBlock: summary.emailsBeforeBlock,
          detectionLatencyMs: summary.detectionLatencyMs,
          averageResponseMs: summary.averageResponseMs,
        },
        results: summary.results,
        dynamicRules: {
          before: rulesBefore,
          after: rulesAfter,
        },
        analysis: {
          ruleTriggered: summary.ruleCreatedAt !== null,
          triggeredAtEmail: summary.ruleCreatedAt,
          emailsForwardedBeforeBlock: summary.emailsBeforeBlock,
          expectedThreshold: threshold,
          meetsExpectation: summary.ruleCreatedAt === threshold,
        },
      }, null, 2), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (path === '/dynamic/list') {
      const rules = await getDynamicRules(env);
      return new Response(JSON.stringify(rules, null, 2), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({
      name: 'Performance Test Worker',
      endpoints: {
        '/test/sequential?count=10': 'Run sequential requests',
        '/test/concurrent?count=20&concurrency=5': 'Run concurrent requests',
        '/test/full': 'Run full test suite (20 sequential + 30 concurrent)',
        '/test/dynamic?threshold=5': 'Test dynamic rule generation',
        '/metrics': 'Get server metrics',
        '/dynamic/list': 'List dynamic rules',
      },
    }, null, 2), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  },
};
