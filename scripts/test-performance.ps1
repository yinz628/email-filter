# API-Worker Performance Test Script
# Tests the optimization effects from api-worker-performance spec

param(
    [string]$BaseUrl = "https://hkwa-d5v4.feimails.com",
    [string]$Token = "nature123",
    [int]$ConcurrentRequests = 10,
    [int]$TotalRequests = 50
)

$Headers = @{
    "Authorization" = "Bearer $Token"
    "Content-Type" = "application/json"
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "API-Worker Performance Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Base URL: $BaseUrl"
Write-Host "Total Requests: $TotalRequests"
Write-Host "Concurrent Requests: $ConcurrentRequests"
Write-Host ""

# Test 1: Health Check
Write-Host "1. Health Check" -ForegroundColor Yellow
$healthStart = Get-Date
$health = Invoke-RestMethod -Uri "$BaseUrl/health" -Headers $Headers
$healthTime = (Get-Date) - $healthStart
Write-Host "   Status: $($health.status)" -ForegroundColor Green
Write-Host "   Response Time: $($healthTime.TotalMilliseconds)ms"
Write-Host ""

# Test 2: Get Current Metrics
Write-Host "2. Current Performance Metrics" -ForegroundColor Yellow
$metrics = Invoke-RestMethod -Uri "$BaseUrl/api/admin/metrics" -Headers $Headers
Write-Host "   Phase 1 Average: $($metrics.phase1.averageMs)ms" -ForegroundColor Green
Write-Host "   Phase 1 P95: $($metrics.phase1.p95Ms)ms"
Write-Host "   Phase 1 P99: $($metrics.phase1.p99Ms)ms"
Write-Host "   Total Requests: $($metrics.performance.totalRequests)"
Write-Host "   Slow Requests: $($metrics.performance.slowRequestCount)"
Write-Host "   Target Met: $($metrics.performance.targetMetPercent)%"
Write-Host ""

# Test 3: Sequential Webhook Requests
Write-Host "3. Sequential Webhook Test ($TotalRequests requests)" -ForegroundColor Yellow
$sequentialTimes = @()
for ($i = 1; $i -le $TotalRequests; $i++) {
    $body = @{
        from = "test$i@example.com"
        to = "test@domain.com"
        subject = "Performance Test $i - $(Get-Date -Format 'HHmmss')"
        messageId = "test-$i-$(Get-Random)"
        timestamp = [long](Get-Date -UFormat %s) * 1000
        workerName = "test_worker"
    } | ConvertTo-Json
    
    $start = Get-Date
    try {
        $null = Invoke-RestMethod -Uri "$BaseUrl/api/webhook/email" -Method POST -Headers $Headers -Body $body
        $elapsed = ((Get-Date) - $start).TotalMilliseconds
        $sequentialTimes += $elapsed
        Write-Progress -Activity "Sequential Test" -Status "Request $i/$TotalRequests" -PercentComplete (($i / $TotalRequests) * 100)
    } catch {
        Write-Host "   Request $i failed: $_" -ForegroundColor Red
    }
}
Write-Progress -Activity "Sequential Test" -Completed

$seqAvg = ($sequentialTimes | Measure-Object -Average).Average
$seqMin = ($sequentialTimes | Measure-Object -Minimum).Minimum
$seqMax = ($sequentialTimes | Measure-Object -Maximum).Maximum
$seqSorted = $sequentialTimes | Sort-Object
$seqP95 = $seqSorted[[math]::Floor($seqSorted.Count * 0.95)]

Write-Host "   Average: $([math]::Round($seqAvg, 2))ms" -ForegroundColor Green
Write-Host "   Min: $([math]::Round($seqMin, 2))ms"
Write-Host "   Max: $([math]::Round($seqMax, 2))ms"
Write-Host "   P95: $([math]::Round($seqP95, 2))ms"
Write-Host ""

# Test 4: Concurrent Webhook Requests
Write-Host "4. Concurrent Webhook Test ($ConcurrentRequests concurrent x $([math]::Ceiling($TotalRequests / $ConcurrentRequests)) batches)" -ForegroundColor Yellow
$concurrentTimes = @()
$batches = [math]::Ceiling($TotalRequests / $ConcurrentRequests)

for ($batch = 0; $batch -lt $batches; $batch++) {
    $jobs = @()
    $batchStart = Get-Date
    
    for ($j = 0; $j -lt $ConcurrentRequests; $j++) {
        $requestNum = $batch * $ConcurrentRequests + $j + 1
        if ($requestNum -gt $TotalRequests) { break }
        
        $jobs += Start-Job -ScriptBlock {
            param($url, $headers, $num)
            $body = @{
                from = "concurrent$num@example.com"
                to = "test@domain.com"
                subject = "Concurrent Test $num"
                messageId = "concurrent-$num-$(Get-Random)"
                timestamp = [long](Get-Date -UFormat %s) * 1000
                workerName = "test_worker"
            } | ConvertTo-Json
            
            $start = Get-Date
            try {
                $null = Invoke-RestMethod -Uri "$url/api/webhook/email" -Method POST -Headers $headers -Body $body
                return ((Get-Date) - $start).TotalMilliseconds
            } catch {
                return -1
            }
        } -ArgumentList $BaseUrl, $Headers, $requestNum
    }
    
    $results = $jobs | Wait-Job | Receive-Job
    $jobs | Remove-Job
    
    foreach ($result in $results) {
        if ($result -gt 0) {
            $concurrentTimes += $result
        }
    }
    
    Write-Progress -Activity "Concurrent Test" -Status "Batch $($batch + 1)/$batches" -PercentComplete ((($batch + 1) / $batches) * 100)
}
Write-Progress -Activity "Concurrent Test" -Completed

if ($concurrentTimes.Count -gt 0) {
    $concAvg = ($concurrentTimes | Measure-Object -Average).Average
    $concMin = ($concurrentTimes | Measure-Object -Minimum).Minimum
    $concMax = ($concurrentTimes | Measure-Object -Maximum).Maximum
    $concSorted = $concurrentTimes | Sort-Object
    $concP95 = $concSorted[[math]::Floor($concSorted.Count * 0.95)]
    
    Write-Host "   Average: $([math]::Round($concAvg, 2))ms" -ForegroundColor Green
    Write-Host "   Min: $([math]::Round($concMin, 2))ms"
    Write-Host "   Max: $([math]::Round($concMax, 2))ms"
    Write-Host "   P95: $([math]::Round($concP95, 2))ms"
} else {
    Write-Host "   No successful concurrent requests" -ForegroundColor Red
}
Write-Host ""

# Test 5: Get Updated Metrics
Write-Host "5. Updated Performance Metrics (after tests)" -ForegroundColor Yellow
Start-Sleep -Seconds 1
$metricsAfter = Invoke-RestMethod -Uri "$BaseUrl/api/admin/metrics" -Headers $Headers
Write-Host "   Phase 1 Average: $($metricsAfter.phase1.averageMs)ms" -ForegroundColor Green
Write-Host "   Phase 1 P95: $($metricsAfter.phase1.p95Ms)ms"
Write-Host "   Phase 1 P99: $($metricsAfter.phase1.p99Ms)ms"
Write-Host "   Total Requests: $($metricsAfter.performance.totalRequests)"
Write-Host "   Slow Requests (>100ms): $($metricsAfter.performance.slowRequestCount)"
Write-Host "   Target Met: $($metricsAfter.performance.targetMetPercent)%"
Write-Host ""

# Summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Sequential Test Results:" -ForegroundColor Yellow
Write-Host "   Requests: $($sequentialTimes.Count)"
Write-Host "   Average Response: $([math]::Round($seqAvg, 2))ms"
Write-Host "   P95 Response: $([math]::Round($seqP95, 2))ms"
Write-Host ""

if ($concurrentTimes.Count -gt 0) {
    Write-Host "Concurrent Test Results:" -ForegroundColor Yellow
    Write-Host "   Requests: $($concurrentTimes.Count)"
    Write-Host "   Average Response: $([math]::Round($concAvg, 2))ms"
    Write-Host "   P95 Response: $([math]::Round($concP95, 2))ms"
    Write-Host ""
}

Write-Host "Server-Side Phase 1 Metrics:" -ForegroundColor Yellow
Write-Host "   Average: $($metricsAfter.phase1.averageMs)ms"
Write-Host "   P95: $($metricsAfter.phase1.p95Ms)ms"
Write-Host "   P99: $($metricsAfter.phase1.p99Ms)ms"
Write-Host "   Slow Requests: $($metricsAfter.performance.slowRequestCount)"
Write-Host ""

# Performance Assessment
$targetMet = $metricsAfter.phase1.p95Ms -lt 100
if ($targetMet) {
    Write-Host "PASS: Phase 1 P95 ($($metricsAfter.phase1.p95Ms)ms) < 100ms target" -ForegroundColor Green
} else {
    Write-Host "FAIL: Phase 1 P95 ($($metricsAfter.phase1.p95Ms)ms) >= 100ms target" -ForegroundColor Red
}

if ($metricsAfter.performance.slowRequestCount -eq 0) {
    Write-Host "PASS: No slow requests (>100ms)" -ForegroundColor Green
} else {
    Write-Host "WARN: $($metricsAfter.performance.slowRequestCount) slow requests detected" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Test completed at $(Get-Date)" -ForegroundColor Cyan
