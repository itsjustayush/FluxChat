/**
 * Room Lifecycle State Machine
 * Manages room states, peer lifecycle, and connection coordination
 */

export type RoomState =
  | 'created'
  | 'waiting'
  | 'active'
  | 'reconnecting'
  | 'closing'
  | 'closed';

export type PeerState =
  | 'joining'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

export interface Peer {
  id: string;
  state: PeerState;
  joinedAt: number;
  lastActivity: number;
  connectionAttempts: number;
  error?: string;
}

export interface RoomStateTransition {
  from: RoomState;
  to: RoomState;
  reason: string;
  timestamp: number;
  peersInRoom: number;
}

export interface RoomConfig {
  maxPeers?: number;
  idleTimeout?: number;
  inactivityTimeout?: number;
  enableAutoCleanup?: boolean;
}

export type RoomStateListener = (
  newState: RoomState,
  oldState: RoomState,
  transition: RoomStateTransition
) => void;

export type PeerStateListener = (
  peerId: string,
  newState: PeerState,
  oldState: PeerState
) => void;

/**
 * State machine for managing room lifecycle
 */
export class RoomManager {
  private roomId: string;
  private currentState: RoomState = 'created';
  private peers: Map<string, Peer> = new Map();
  private transitions: RoomStateTransition[] = [];
  private stateListeners: Set<RoomStateListener> = new Set();
  private peerListeners: Set<PeerStateListener> = new Set();
  private config: Required<RoomConfig>;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private idleTimer: NodeJS.Timeout | null = null;

  constructor(roomId: string, config: RoomConfig = {}) {
    this.roomId = roomId;
    this.config = {
      maxPeers: config.maxPeers ?? 10,
      idleTimeout: config.idleTimeout ?? 5 * 60 * 1000, // 5 minutes
      inactivityTimeout: config.inactivityTimeout ?? 30 * 1000, // 30 seconds
      enableAutoCleanup: config.enableAutoCleanup ?? true,
    };

    if (this.config.enableAutoCleanup) {
      this.startAutoCleanup();
    }

    console.log(`[RoomManager] Created room ${roomId}`);
  }

  /**
   * Get current room state
   */
  public getState(): RoomState {
    return this.currentState;
  }

  /**
   * Transition room to new state
   */
  public transitionTo(newState: RoomState, reason: string): boolean {
    if (!this.isValidTransition(this.currentState, newState)) {
      console.warn(
        `[RoomManager] Invalid transition: ${this.currentState} -> ${newState}`
      );
      return false;
    }

    const oldState = this.currentState;
    this.currentState = newState;

    const transition: RoomStateTransition = {
      from: oldState,
      to: newState,
      reason,
      timestamp: Date.now(),
      peersInRoom: this.peers.size,
    };

    this.transitions.push(transition);

    console.log(
      `[RoomManager] Room ${this.roomId} transitioned: ${oldState} -> ${newState} (reason: ${reason})`
    );

    // Notify listeners
    this.stateListeners.forEach((listener) => {
      listener(newState, oldState, transition);
    });

    // Handle special state changes
    this.handleStateChange(oldState, newState);

    return true;
  }

  /**
   * Add a peer to the room
   */
  public addPeer(peerId: string): boolean {
    if (this.peers.has(peerId)) {
      console.warn(`[RoomManager] Peer ${peerId} already exists`);
      return false;
    }

    if (this.peers.size >= this.config.maxPeers) {
      console.warn(
        `[RoomManager] Room full, cannot add peer ${peerId}`
      );
      return false;
    }

    const peer: Peer = {
      id: peerId,
      state: 'joining',
      joinedAt: Date.now(),
      lastActivity: Date.now(),
      connectionAttempts: 0,
    };

    this.peers.set(peerId, peer);

    console.log(
      `[RoomManager] Added peer ${peerId} (total: ${this.peers.size})`
    );

    // Update room state
    if (
      this.currentState === 'created' &&
      this.peers.size > 0
    ) {
      this.transitionTo('waiting', 'First peer joined');
    } else if (this.currentState === 'waiting') {
      this.transitionTo('active', 'Multiple peers connected');
    }

    return true;
  }

  /**
   * Remove a peer from the room
   */
  public removePeer(peerId: string): boolean {
    if (!this.peers.has(peerId)) {
      return false;
    }

    this.peers.delete(peerId);

    console.log(
      `[RoomManager] Removed peer ${peerId} (remaining: ${this.peers.size})`
    );

    // Update room state
    if (this.peers.size === 0 && this.currentState !== 'closed') {
      this.transitionTo('closing', 'All peers disconnected');
      this.transitionTo('closed', 'Room empty');
    } else if (
      this.peers.size === 1 &&
      this.currentState === 'active'
    ) {
      this.transitionTo('waiting', 'Only one peer remaining');
    }

    return true;
  }

  /**
   * Update peer state
   */
  public setPeerState(peerId: string, newState: PeerState): boolean {
    const peer = this.peers.get(peerId);
    if (!peer) {
      return false;
    }

    const oldState = peer.state;
    if (oldState === newState) {
      return true; // No change
    }

    peer.state = newState;
    peer.lastActivity = Date.now();

    if (newState === 'connected') {
      peer.connectionAttempts = 0;
    } else if (newState === 'error') {
      peer.connectionAttempts++;
    }

    console.log(
      `[RoomManager] Peer ${peerId} state: ${oldState} -> ${newState}`
    );

    // Notify listeners
    this.peerListeners.forEach((listener) => {
      listener(peerId, newState, oldState);
    });

    return true;
  }

  /**
   * Set error on peer
   */
  public setPeerError(peerId: string, error: string): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    peer.error = error;
    this.setPeerState(peerId, 'error');
  }

  /**
   * Get peer by ID
   */
  public getPeer(peerId: string): Peer | undefined {
    return this.peers.get(peerId);
  }

  /**
   * Get all peers
   */
  public getPeers(): Peer[] {
    return Array.from(this.peers.values());
  }

  /**
   * Get peers in specific state
   */
  public getPeersByState(state: PeerState): Peer[] {
    return Array.from(this.peers.values()).filter((p) => p.state === state);
  }

  /**
   * Check if room has activity
   */
  public hasRecentActivity(): boolean {
    const now = Date.now();
    return Array.from(this.peers.values()).some(
      (p) => now - p.lastActivity < this.config.inactivityTimeout
    );
  }

  /**
   * Register listener for room state changes
   */
  public onStateChange(listener: RoomStateListener): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  /**
   * Register listener for peer state changes
   */
  public onPeerStateChange(listener: PeerStateListener): () => void {
    this.peerListeners.add(listener);
    return () => {
      this.peerListeners.delete(listener);
    };
  }

  /**
   * Get transition history
   */
  public getTransitionHistory(limit: number = 50): RoomStateTransition[] {
    return this.transitions.slice(-limit);
  }

  /**
   * Get statistics
   */
  public getStats() {
    const peerStats = Object.fromEntries(
      Array.from(RoomManager.prototype.constructor.name).map((state) => {
        const peers = this.getPeersByState(state as PeerState);
        return [state, peers.length];
      })
    );

    return {
      roomId: this.roomId,
      state: this.currentState,
      totalPeers: this.peers.size,
      peerStats,
      uptime: this.transitions[0] ? Date.now() - this.transitions[0].timestamp : 0,
      transitions: this.transitions.length,
    };
  }

  /**
   * Start automatic cleanup of inactive peers
   */
  private startAutoCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const toRemove: string[] = [];

      this.peers.forEach((peer, peerId) => {
        if (now - peer.lastActivity > this.config.idleTimeout) {
          toRemove.push(peerId);
        }
      });

      toRemove.forEach((peerId) => {
        this.removePeer(peerId);
        console.log(
          `[RoomManager] Removed idle peer ${peerId}`
        );
      });
    }, 60000); // Run cleanup every minute
  }

  /**
   * Handle special state transitions
   */
  private handleStateChange(oldState: RoomState, newState: RoomState): void {
    if (newState === 'active' && oldState !== 'active') {
      this.resetIdleTimer();
    }

    if (newState === 'closed') {
      this.cleanup();
    }
  }

  /**
   * Reset idle timer
   */
  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }

    this.idleTimer = setTimeout(() => {
      if (
        this.currentState === 'active' &&
        !this.hasRecentActivity()
      ) {
        this.transitionTo('closing', 'Idle timeout');
      }
    }, this.config.idleTimeout);
  }

  /**
   * Check if transition is valid
   */
  private isValidTransition(from: RoomState, to: RoomState): boolean {
    const validTransitions: Record<RoomState, RoomState[]> = {
      created: ['waiting', 'closed'],
      waiting: ['active', 'closed'],
      active: ['reconnecting', 'closing', 'closed'],
      reconnecting: ['active', 'closed'],
      closing: ['closed'],
      closed: [],
    };

    return validTransitions[from]?.includes(to) ?? false;
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    this.stateListeners.clear();
    this.peerListeners.clear();
    this.peers.clear();

    console.log(`[RoomManager] Cleaned up room ${this.roomId}`);
  }
}

// Room manager pool
const roomManagers: Map<string, RoomManager> = new Map();

export function getRoomManager(roomId: string, config?: RoomConfig): RoomManager {
  if (!roomManagers.has(roomId)) {
    roomManagers.set(roomId, new RoomManager(roomId, config));
  }
  return roomManagers.get(roomId)!;
}

export function deleteRoomManager(roomId: string): void {
  const manager = roomManagers.get(roomId);
  if (manager) {
    manager.cleanup();
    roomManagers.delete(roomId);
  }
}

export function getAllRoomManagers(): RoomManager[] {
  return Array.from(roomManagers.values());
}
