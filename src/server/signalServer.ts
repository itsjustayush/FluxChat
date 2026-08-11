/**
 * WebSocket Signaling Server for WebRTC
 * Handles peer signaling, room management, and connection coordination
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

export interface SignalMessage {
  type:
    | 'join'
    | 'offer'
    | 'answer'
    | 'candidate'
    | 'chat'
    | 'chat_ack'
    | 'typing'
    | 'reaction'
    | 'room_state'
    | 'error'
    | 'ping'
    | 'pong';
  roomId?: string;
  peerId?: string;
  isHost?: boolean;
  targetPeerId?: string;
  data?: any;
  timestamp?: number;
}

export interface RoomState {
  roomId: string;
  peers: Map<string, WebSocket | null>;
  createdAt: number;
  lastActivity: number;
}

export class SignalingServer {
  private app: express.Application;
  private httpServer: ReturnType<typeof createServer>;
  private wss: WebSocketServer;
  private rooms: Map<string, RoomState> = new Map();
  private peerToRoom: Map<WebSocket, { roomId: string; peerId: string }> =
    new Map();
  private httpPeerQueues: Map<string, SignalMessage[]> = new Map();
  private inactivityTimeout = 5 * 60 * 1000; // 5 minutes
  private heartbeatInterval = 30 * 1000; // 30 seconds
  private heartbeatTimers: Map<WebSocket, NodeJS.Timeout> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(serverOrPort: ReturnType<typeof createServer> | number = 3001) {
    this.app = express();
    this.app.use(express.json());
    this.wss = new WebSocketServer({ noServer: true });

    if (typeof serverOrPort === 'number') {
      this.httpServer = createServer(this.app);
      this.setupRoutes();
      this.setupWebSocket();
      this.startCleanupInterval();

      this.httpServer.listen(serverOrPort, '0.0.0.0', () => {
        console.log(`[SignalingServer] Listening on port ${serverOrPort}`);
      });
    } else {
      this.httpServer = serverOrPort;
      this.setupRoutes();
      this.setupWebSocket();
      this.startCleanupInterval();
    }

    this.httpServer.on('upgrade', (request, socket, head) => {
      try {
        const urlStr = request.url || '';
        const pathname = urlStr.split('?')[0];
        if (pathname === '/ws' || pathname === '/ws/' || pathname.endsWith('/ws')) {
          this.wss.handleUpgrade(request, socket, head, (ws) => {
            this.wss.emit('connection', ws, request);
          });
        }
      } catch (err) {
        console.error('[SignalingServer] Upgrade error:', err);
      }
    });
  }

  public getApp() {
    return this.app;
  }

  private setupRoutes() {
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        rooms: this.rooms.size,
        timestamp: Date.now(),
      });
    });

    this.app.get('/stats', (req, res) => {
      const stats = {
        totalRooms: this.rooms.size,
        totalPeers: this.peerToRoom.size,
        rooms: Array.from(this.rooms.entries()).map(([roomId, room]) => ({
          roomId,
          peerCount: room.peers.size,
          createdAt: room.createdAt,
          lastActivity: room.lastActivity,
          uptime: Date.now() - room.createdAt,
        })),
      };
      res.json(stats);
    });

    // HTTP Signaling Fallback Endpoints (for environments where WebSockets are blocked/restricted)
    this.app.post('/post', (req, res) => {
      try {
        const message: SignalMessage = req.body;
        if (!message || !message.type) {
          res.status(400).json({ error: 'Invalid message' });
          return;
        }
        this.handleHttpSignalMessage(message);
        res.json({ ok: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    this.app.get('/poll', (req, res) => {
      const roomId = req.query.roomId as string;
      const peerId = req.query.peerId as string;
      if (!roomId || !peerId) {
        res.status(400).json({ error: 'Missing roomId or peerId' });
        return;
      }
      const channelId = roomId.startsWith('room-') ? roomId.toUpperCase() : `room-${roomId.toUpperCase()}`;
      const key = `${channelId}:${peerId}`;
      const queue = this.httpPeerQueues.get(key) || [];
      this.httpPeerQueues.set(key, []);
      res.json({ messages: queue });
    });
  }

  private handleHttpSignalMessage(message: SignalMessage) {
    if (message.type === 'join') {
      this.handleJoin(null, message);
    } else if (['offer', 'answer', 'candidate', 'chat', 'chat_ack', 'typing', 'reaction'].includes(message.type)) {
      if (message.targetPeerId) {
        this.relayMessage(null, message);
      } else if (message.roomId) {
        const channelId = message.roomId.startsWith('room-') ? message.roomId.toUpperCase() : `room-${message.roomId.toUpperCase()}`;
        this.broadcastToRoom(channelId, message, message.peerId);
      }
    }
  }

  private setupWebSocket() {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('[SignalingServer] New WebSocket connection');

      ws.on('message', (data: Buffer) => {
        try {
          const message: SignalMessage = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (error) {
          console.error('[SignalingServer] Error parsing message:', error);
          this.sendError(ws, 'Invalid message format');
        }
      });

      ws.on('close', () => {
        this.handleDisconnect(ws);
      });

      ws.on('error', (error) => {
        console.error('[SignalingServer] WebSocket error:', error);
      });

      this.startHeartbeat(ws);
    });
  }

  private handleMessage(ws: WebSocket, message: SignalMessage) {
    switch (message.type) {
      case 'join':
        this.handleJoin(ws, message);
        break;
      case 'offer':
        this.relayMessage(ws, message);
        break;
      case 'answer':
        this.relayMessage(ws, message);
        break;
      case 'candidate':
        this.relayMessage(ws, message);
        break;
      case 'chat':
      case 'chat_ack':
      case 'typing':
      case 'reaction':
        if (message.targetPeerId) {
          this.relayMessage(ws, message);
        } else if (message.roomId) {
          const channelId = message.roomId.startsWith('room-') ? message.roomId.toUpperCase() : `room-${message.roomId.toUpperCase()}`;
          this.broadcastToRoom(channelId, message, message.peerId);
        }
        break;
      case 'ping':
        this.sendMessage(ws, { type: 'pong', timestamp: Date.now() });
        break;
      default:
        console.warn(
          `[SignalingServer] Unknown message type: ${message.type}`
        );
    }
  }

  private handleJoin(ws: WebSocket | null, message: SignalMessage) {
    const { roomId, peerId, isHost } = message;

    if (!roomId || !peerId) {
      if (ws) this.sendError(ws, 'Missing roomId or peerId');
      return;
    }

    // Standardized room channel string e.g. room-XR92KB
    const channelId = roomId.startsWith('room-') ? roomId.toUpperCase() : `room-${roomId.toUpperCase()}`;

    // Get or create room
    let room = this.rooms.get(channelId);
    if (!room) {
      if (isHost) {
        room = {
          roomId: channelId,
          peers: new Map(),
          createdAt: Date.now(),
          lastActivity: Date.now(),
        };
        this.rooms.set(channelId, room);
      } else {
        // Non-host user attempting to join non-existent room -> 404 error
        console.warn(`[SignalingServer] Rejecting join for non-existent room ${channelId}`);
        this.sendToPeer(ws, peerId, channelId, {
          type: 'error',
          data: { message: `Room ${roomId} not found or expired.`, code: 404 },
          timestamp: Date.now(),
        });
        return;
      }
    }

    // Add or update peer
    room.peers.set(peerId, ws);
    if (ws) {
      this.peerToRoom.set(ws, { roomId: channelId, peerId });
    }
    room.lastActivity = Date.now();

    // Get list of existing peers
    const existingPeers = Array.from(room.peers.keys()).filter(
      (id) => id !== peerId
    );

    // Send room state to new peer
    this.sendToPeer(ws, peerId, channelId, {
      type: 'room_state',
      data: {
        peerId,
        peers: existingPeers,
        roomSize: room.peers.size,
      },
      timestamp: Date.now(),
    });

    // Notify other peers of new peer (triggers SDP offer from Host)
    this.broadcastToRoom(channelId, {
      type: 'room_state',
      data: {
        event: 'peer_joined',
        peerId,
        roomSize: room.peers.size,
      },
      timestamp: Date.now(),
    }, peerId);

    console.log(
      `[SignalingServer] Peer ${peerId} joined channel ${channelId} (total: ${room.peers.size})`
    );
  }

  private relayMessage(ws: WebSocket | null, message: SignalMessage) {
    let roomId = message.roomId;
    let peerId = message.peerId;

    if (ws) {
      const peerInfo = this.peerToRoom.get(ws);
      if (peerInfo) {
        roomId = peerInfo.roomId;
        peerId = peerInfo.peerId;
      }
    }

    if (!roomId || !peerId) {
      if (ws) this.sendError(ws, 'Not in a room');
      return;
    }

    const channelId = roomId.startsWith('room-') ? roomId.toUpperCase() : `room-${roomId.toUpperCase()}`;
    const { targetPeerId } = message;

    if (!targetPeerId) {
      if (ws) this.sendError(ws, 'Missing targetPeerId');
      return;
    }

    const room = this.rooms.get(channelId);
    if (!room) {
      if (ws) this.sendError(ws, 'Room not found');
      return;
    }

    const targetWs = room.peers.get(targetPeerId);

    this.sendToPeer(targetWs || null, targetPeerId, channelId, {
      type: message.type,
      peerId,
      data: message.data,
      timestamp: Date.now(),
    });

    room.lastActivity = Date.now();
  }

  private broadcastToRoom(
    channelId: string,
    message: SignalMessage,
    excludePeerId?: string
  ) {
    const room = this.rooms.get(channelId);
    if (!room) return;

    room.peers.forEach((ws, peerId) => {
      if (excludePeerId && peerId === excludePeerId) return;
      this.sendToPeer(ws, peerId, channelId, message);
    });
  }

  private sendToPeer(
    ws: WebSocket | null,
    peerId: string,
    channelId: string,
    message: SignalMessage
  ) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    } else {
      const key = `${channelId}:${peerId}`;
      let queue = this.httpPeerQueues.get(key);
      if (!queue) {
        queue = [];
        this.httpPeerQueues.set(key, queue);
      }
      queue.push(message);
    }
  }

  private sendMessage(ws: WebSocket, message: SignalMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendError(ws: WebSocket, error: string) {
    this.sendMessage(ws, {
      type: 'error',
      data: { message: error },
      timestamp: Date.now(),
    });
  }

  private handleDisconnect(ws: WebSocket) {
    const peerInfo = this.peerToRoom.get(ws);
    if (!peerInfo) return;

    const { roomId, peerId } = peerInfo;
    const room = this.rooms.get(roomId);

    if (room) {
      room.peers.delete(peerId);
      room.lastActivity = Date.now();

      // Notify other peers of disconnection
      this.broadcastToRoom(roomId, {
        type: 'room_state',
        data: {
          event: 'peer_left',
          peerId,
          roomSize: room.peers.size,
        },
        timestamp: Date.now(),
      });

      // Remove empty rooms
      if (room.peers.size === 0) {
        this.rooms.delete(roomId);
        console.log(`[SignalingServer] Deleted empty room ${roomId}`);
      }

      console.log(
        `[SignalingServer] Peer ${peerId} left room ${roomId} (remaining: ${room.peers.size})`
      );
    }

    this.peerToRoom.delete(ws);
    this.stopHeartbeat(ws);
  }

  private startHeartbeat(ws: WebSocket) {
    const timer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        this.sendMessage(ws, { type: 'ping', timestamp: Date.now() });
      }
    }, this.heartbeatInterval);

    this.heartbeatTimers.set(ws, timer);
  }

  private stopHeartbeat(ws: WebSocket) {
    const timer = this.heartbeatTimers.get(ws);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(ws);
    }
  }

  private startCleanupInterval() {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const toDelete: string[] = [];

      this.rooms.forEach((room, roomId) => {
        if (now - room.lastActivity > this.inactivityTimeout) {
          // Close all connections in inactive room
          room.peers.forEach((ws) => {
            ws.close(4000, 'Room inactivity timeout');
          });
          toDelete.push(roomId);
          console.log(
            `[SignalingServer] Deleted inactive room ${roomId}`
          );
        }
      });

      toDelete.forEach((roomId) => this.rooms.delete(roomId));
    }, 60000); // Run cleanup every minute
  }

  public close() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.heartbeatTimers.forEach((timer) => clearInterval(timer));
    this.heartbeatTimers.clear();
    this.wss.close();
    this.httpServer.close();
  }
}

// Export singleton
let instance: SignalingServer | null = null;

export function getSignalingServer(serverOrPort?: ReturnType<typeof createServer> | number): SignalingServer {
  if (!instance) {
    instance = new SignalingServer(serverOrPort);
  }
  return instance;
}
