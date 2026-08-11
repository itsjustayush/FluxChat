/**
 * Monitoring & Analytics Layer
 * Collects and aggregates metrics for performance monitoring and observability
 */

export interface Metric {
  name: string;
  value: number;
  unit: string;
  timestamp: number;
  tags?: Record<string, string>;
}

export interface MetricAggregate {
  name: string;
  count: number;
  min: number;
  max: number;
  avg: number;
  p95: number;
  p99: number;
  unit: string;
  period: { start: number; end: number };
}

export interface ConnectionMetrics {
  connectionTime: number; // ms
  timeToFirstByte: number; // ms
  iceGatheringTime: number; // ms
  candidateCount: number;
  connectedCandidatePair?: {
    local: string;
    remote: string;
    protocol: string;
  };
}

export interface TransferMetrics {
  fileSize: number;
  transferDuration: number; // ms
  throughput: number; // bytes/sec
  chunkCount: number;
  retransmissions: number;
  checksumMismatches: number;
  success: boolean;
}

export interface ErrorMetric {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  count: number;
  lastOccurrence: number;
}

/**
 * Metrics Collector for performance monitoring
 */
export class MetricsCollector {
  private metrics: Metric[] = [];
  private errorMetrics: Map<string, ErrorMetric> = new Map();
  private maxMetrics = 10000; // Keep last 10k metrics
  private aggregationWindow = 60 * 1000; // 60 seconds
  private flushInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startAutoFlush();
  }

  /**
   * Record a single metric
   */
  public recordMetric(
    name: string,
    value: number,
    unit: string = 'ms',
    tags?: Record<string, string>
  ): void {
    const metric: Metric = {
      name,
      value,
      unit,
      timestamp: Date.now(),
      tags,
    };

    this.metrics.push(metric);

    // Trim old metrics if exceeding limit
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
  }

  /**
   * Record connection metrics
   */
  public recordConnectionMetrics(metrics: Partial<ConnectionMetrics>): void {
    if (metrics.connectionTime !== undefined) {
      this.recordMetric('connection_time', metrics.connectionTime, 'ms');
    }
    if (metrics.timeToFirstByte !== undefined) {
      this.recordMetric('time_to_first_byte', metrics.timeToFirstByte, 'ms');
    }
    if (metrics.iceGatheringTime !== undefined) {
      this.recordMetric('ice_gathering_time', metrics.iceGatheringTime, 'ms');
    }
    if (metrics.candidateCount !== undefined) {
      this.recordMetric('candidate_count', metrics.candidateCount, 'count');
    }
  }

  /**
   * Record transfer metrics
   */
  public recordTransferMetrics(metrics: TransferMetrics): void {
    this.recordMetric('file_size', metrics.fileSize, 'bytes');
    this.recordMetric('transfer_duration', metrics.transferDuration, 'ms');
    this.recordMetric('throughput', metrics.throughput, 'bytes/sec');
    this.recordMetric('chunk_count', metrics.chunkCount, 'count');
    this.recordMetric('retransmissions', metrics.retransmissions, 'count');
    this.recordMetric('checksum_mismatches', metrics.checksumMismatches, 'count');

    if (metrics.success) {
      this.recordMetric('transfer_success', 1, 'count');
    } else {
      this.recordMetric('transfer_failed', 1, 'count');
    }
  }

  /**
   * Record error
   */
  public recordError(
    code: string,
    message: string,
    severity: 'info' | 'warning' | 'error' | 'critical' = 'error'
  ): void {
    const key = `${code}:${message}`;
    const existing = this.errorMetrics.get(key);

    if (existing) {
      existing.count++;
      existing.lastOccurrence = Date.now();
    } else {
      this.errorMetrics.set(key, {
        code,
        message,
        severity,
        count: 1,
        lastOccurrence: Date.now(),
      });
    }
  }

  /**
   * Get aggregated metrics for a time period
   */
  public getAggregates(
    metricName: string,
    timeWindowMs: number = this.aggregationWindow
  ): MetricAggregate | null {
    const now = Date.now();
    const relevant = this.metrics.filter(
      (m) =>
        m.name === metricName &&
        m.timestamp > now - timeWindowMs
    );

    if (relevant.length === 0) {
      return null;
    }

    const values = relevant.map((m) => m.value).sort((a, b) => a - b);

    return {
      name: metricName,
      count: relevant.length,
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      p95: values[Math.floor(values.length * 0.95)],
      p99: values[Math.floor(values.length * 0.99)],
      unit: relevant[0].unit,
      period: { start: now - timeWindowMs, end: now },
    };
  }

  /**
   * Get all metrics for a time period
   */
  public getMetrics(
    timeWindowMs: number = this.aggregationWindow
  ): Metric[] {
    const now = Date.now();
    return this.metrics.filter(
      (m) => m.timestamp > now - timeWindowMs
    );
  }

  /**
   * Get error summary
   */
  public getErrorSummary(): ErrorMetric[] {
    return Array.from(this.errorMetrics.values()).sort(
      (a, b) => b.count - a.count
    );
  }

  /**
   * Get health status
   */
  public getHealthStatus(): {
    healthy: boolean;
    errorCount: number;
    criticalErrors: number;
    avgLatency: number;
  } {
    const errors = this.getErrorSummary();
    const criticalCount = errors.filter((e) => e.severity === 'critical').length;
    const latencyMetric = this.getAggregates('connection_time');

    return {
      healthy: criticalCount === 0 && errors.length < 5,
      errorCount: errors.length,
      criticalErrors: criticalCount,
      avgLatency: latencyMetric?.avg || 0,
    };
  }

  /**
   * Export metrics as JSON
   */
  public export(): {
    metrics: Metric[];
    errors: ErrorMetric[];
    summary: {
      totalMetrics: number;
      totalErrors: number;
      timeRange: { start: number; end: number };
    };
  } {
    const now = Date.now();
    const earliestMetric =
      this.metrics.length > 0 ? this.metrics[0].timestamp : now;

    return {
      metrics: this.metrics,
      errors: this.getErrorSummary(),
      summary: {
        totalMetrics: this.metrics.length,
        totalErrors: this.errorMetrics.size,
        timeRange: { start: earliestMetric, end: now },
      },
    };
  }

  /**
   * Clear metrics older than specified time
   */
  public clearOldMetrics(ageMs: number = 24 * 60 * 60 * 1000): void {
    const cutoff = Date.now() - ageMs;
    const before = this.metrics.length;
    this.metrics = this.metrics.filter((m) => m.timestamp > cutoff);
    const removed = before - this.metrics.length;

    if (removed > 0) {
      console.log(`[MetricsCollector] Cleared ${removed} old metrics`);
    }
  }

  /**
   * Reset all metrics
   */
  public reset(): void {
    this.metrics = [];
    this.errorMetrics.clear();
  }

  /**
   * Start periodic export (for remote collection)
   */
  public startAutoFlush(intervalMs: number = 60000): void {
    this.flushInterval = setInterval(() => {
      // In production, this would send metrics to a remote collector
      const health = this.getHealthStatus();
      if (!health.healthy) {
        console.warn('[MetricsCollector] Unhealthy status detected:', health);
      }
    }, intervalMs);
  }

  /**
   * Stop periodic export
   */
  public stopAutoFlush(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  /**
   * Cleanup
   */
  public destroy(): void {
    this.stopAutoFlush();
    this.reset();
  }
}

// Global singleton
let instance: MetricsCollector | null = null;

export function getMetricsCollector(): MetricsCollector {
  if (!instance) {
    instance = new MetricsCollector();
  }
  return instance;
}

/**
 * Performance monitor helper
 */
export class PerformanceMonitor {
  private startTime: number = 0;
  private marks: Map<string, number> = new Map();

  public start(): void {
    this.startTime = performance.now();
  }

  public mark(name: string): void {
    this.marks.set(name, performance.now());
  }

  public measure(label: string, from?: string, to?: string): number {
    const fromTime = from ? this.marks.get(from) : this.startTime;
    const toTime = to ? this.marks.get(to) : performance.now();

    if (fromTime === undefined || toTime === undefined) {
      return -1;
    }

    const duration = toTime - fromTime;
    const collector = getMetricsCollector();
    collector.recordMetric(label, duration, 'ms');

    return duration;
  }

  public end(label: string): number {
    return this.measure(label);
  }

  public reset(): void {
    this.startTime = 0;
    this.marks.clear();
  }
}
