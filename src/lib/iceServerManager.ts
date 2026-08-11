/**
 * ICE Server Failover Manager
 * Manages STUN/TURN server pools with health checking, failover logic, and adaptive selection
 */

export interface IceServerConfig {
  urls: string[];
  username?: string;
  credential?: string;
  credentialType?: 'password' | 'oauth';
}

export interface HealthCheckResult {
  serverId: string;
  healthy: boolean;
  latency: number;
  error?: string;
  timestamp: number;
}

export interface IceServerMetrics {
  serverId: string;
  successRate: number;
  avgLatency: number;
  lastHealthCheck: number;
  failureCount: number;
  consecutiveFailures: number;
}

const DEFAULT_STUN_SERVERS = [
  'stun:stun1.l.google.com:19302',
  'stun:stun2.l.google.com:19302',
  'stun:stun3.l.google.com:19302',
  'stun:stun4.l.google.com:19302',
  'stun:stun.l.google.com:19302',
  'stun:stun1.stunprotocol.org:3478',
  'stun:stun2.stunprotocol.org:3478',
];

const FALLBACK_STUN_SERVERS = [
  'stun:stunserver.stunprotocol.org:3478',
  'stun:stun.services.mozilla.com:3478',
  'stun:stun.ekiga.net:3478',
];

export class IceServerManager {
  private primaryPool: IceServerConfig[] = [];
  private fallbackPool: IceServerConfig[] = [];
  private metrics: Map<string, IceServerMetrics> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private healthCheckTimeout = 5000;
  private healthCheckIntervalMs = 30000;
  private maxConsecutiveFailures = 3;
  private currentPoolIndex = 0;

  constructor(customServers?: string[]) {
    this.initializePools(customServers);
    this.initializeMetrics();
  }

  private initializePools(customServers?: string[]) {
    if (customServers && customServers.length > 0) {
      this.primaryPool = customServers.map((url) => ({ urls: [url] }));
    } else {
      this.primaryPool = DEFAULT_STUN_SERVERS.map((url) => ({ urls: [url] }));
    }

    this.fallbackPool = FALLBACK_STUN_SERVERS.map((url) => ({ urls: [url] }));
  }

  private initializeMetrics() {
    const allServers = [...this.primaryPool, ...this.fallbackPool];
    allServers.forEach((server, idx) => {
      const serverId = `server-${idx}`;
      this.metrics.set(serverId, {
        serverId,
        successRate: 100,
        avgLatency: 0,
        lastHealthCheck: 0,
        failureCount: 0,
        consecutiveFailures: 0,
      });
    });
  }

  /**
   * Get current RTCConfiguration with adaptive server selection
   */
  public getConfiguration(): RTCConfiguration {
    const servers = this.selectServersAdaptively();
    return {
      iceServers: servers,
    };
  }

  /**
   * Adaptively select servers based on health metrics
   */
  private selectServersAdaptively(): IceServerConfig[] {
    const allServers = [...this.primaryPool, ...this.fallbackPool];
    const healthyServers = allServers.filter((_, idx) => {
      const metrics = this.metrics.get(`server-${idx}`);
      if (!metrics) return true;
      return metrics.consecutiveFailures < this.maxConsecutiveFailures;
    });

    // If no healthy servers, reset failure counters and retry all
    if (healthyServers.length === 0) {
      console.warn('[IceServerManager] All servers unhealthy, resetting metrics');
      this.metrics.forEach((m) => {
        m.consecutiveFailures = 0;
      });
      return allServers;
    }

    // Sort by success rate and latency
    const scored = healthyServers
      .map((server, idx) => {
        const metrics = this.metrics.get(`server-${idx}`);
        const score =
          (metrics?.successRate || 100) * 0.7 -
          (metrics?.avgLatency || 0) * 0.3;
        return { server, score };
      })
      .sort((a, b) => b.score - a.score);

    // Return top 4 servers for redundancy
    return scored.slice(0, 4).map(({ server }) => server);
  }

  /**
   * Record health check result and update metrics
   */
  public recordHealthCheck(serverId: string, result: HealthCheckResult): void {
    const metrics = this.metrics.get(serverId);
    if (!metrics) return;

    if (result.healthy) {
      metrics.consecutiveFailures = 0;
      metrics.successRate = Math.min(
        100,
        metrics.successRate * 0.9 + 10
      );
      metrics.avgLatency = metrics.avgLatency * 0.7 + result.latency * 0.3;
    } else {
      metrics.consecutiveFailures++;
      metrics.failureCount++;
      metrics.successRate = Math.max(0, metrics.successRate - 20);
    }

    metrics.lastHealthCheck = result.timestamp;
  }

  /**
   * Perform health checks on all servers
   */
  public async performHealthChecks(): Promise<HealthCheckResult[]> {
    const allServers = [...this.primaryPool, ...this.fallbackPool];
    const results: HealthCheckResult[] = [];

    for (let idx = 0; idx < allServers.length; idx++) {
      const serverId = `server-${idx}`;
      const server = allServers[idx];
      const result = await this.checkServerHealth(serverId, server);
      results.push(result);
      this.recordHealthCheck(serverId, result);
    }

    return results;
  }

  /**
   * Check health of a single server
   */
  private async checkServerHealth(
    serverId: string,
    server: IceServerConfig
  ): Promise<HealthCheckResult> {
    const startTime = performance.now();

    try {
      // Create a temporary peer connection to test the server
      const pc = new RTCPeerConnection({
        iceServers: [server],
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('Health check timeout')),
          this.healthCheckTimeout
        )
      );

      const healthCheckPromise = new Promise<number>((resolve, reject) => {
        let resolved = false;

        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            reject(new Error('No ICE candidates gathered'));
          }
        }, this.healthCheckTimeout);

        pc.onicecandidate = (event) => {
          if (event.candidate && !resolved) {
            resolved = true;
            clearTimeout(timeout);
            resolve(performance.now() - startTime);
          }
        };

        pc.createOffer().catch(reject);
      });

      await Promise.race([healthCheckPromise, timeoutPromise]);
      pc.close();

      const latency = performance.now() - startTime;
      return {
        serverId,
        healthy: true,
        latency,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        serverId,
        healthy: false,
        latency: -1,
        error: String(error),
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Start periodic health checks
   */
  public startHealthChecks(): void {
    if (this.healthCheckInterval) {
      return;
    }

    this.performHealthChecks().catch(() => {
      // Silently handle initial health check failure
    });

    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks().catch(() => {
        // Silently handle periodic health check failure
      });
    }, this.healthCheckIntervalMs);
  }

  /**
   * Stop periodic health checks
   */
  public stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Get current metrics for all servers
   */
  public getMetrics(): IceServerMetrics[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Get metrics for a specific server
   */
  public getServerMetrics(serverId: string): IceServerMetrics | undefined {
    return this.metrics.get(serverId);
  }

  /**
   * Reset all metrics (useful for testing or after long disconnections)
   */
  public resetMetrics(): void {
    this.metrics.forEach((m) => {
      m.successRate = 100;
      m.avgLatency = 0;
      m.failureCount = 0;
      m.consecutiveFailures = 0;
      m.lastHealthCheck = 0;
    });
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.stopHealthChecks();
    this.metrics.clear();
    this.primaryPool = [];
    this.fallbackPool = [];
  }
}

// Singleton instance
let instance: IceServerManager | null = null;

export function getIceServerManager(
  customServers?: string[]
): IceServerManager {
  if (!instance) {
    instance = new IceServerManager(customServers);
    instance.startHealthChecks();
  }
  return instance;
}

export function destroyIceServerManager(): void {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}
