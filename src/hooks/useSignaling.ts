/**
 * React Hook for WebRTC Signaling via WebSocket
 * Handles WebSocket connection, message relay, and peer discovery
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import type { SignalMessage } from '../server/signalServer';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  addDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface UseSignalingOptions {
  signalingUrl: string;
  roomId: string;
  peerId: string;
  isHost?: boolean;
  onRoomState?: (data: any) => void;
  onSignal?: (message: SignalMessage) => void;
  onError?: (error: string) => void;
  autoConnect?: boolean;
}

export interface UseSignalingReturn {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  sendSignal: (message: SignalMessage) => void;
  sendOffer: (targetPeerId: string, offer: RTCSessionDescriptionInit) => void;
  sendAnswer: (targetPeerId: string, answer: RTCSessionDescriptionInit) => void;
  sendCandidate: (targetPeerId: string, candidate: RTCIceCandidateInit) => void;
  disconnect: () => void;
}

const MESSAGE_QUEUE_MAX = 100;
const RECONNECT_DELAY_MS = 1000;
const RECONNECT_MAX_ATTEMPTS = 10;
const HEARTBEAT_TIMEOUT_MS = 10000;

export function useSignaling(options: UseSignalingOptions): UseSignalingReturn {
  const {
    signalingUrl,
    roomId,
    peerId,
    isHost,
    onRoomState,
    onSignal,
    onError,
    autoConnect = true,
  } = options;

  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Store volatile callbacks/options in a ref to avoid recreating connect & triggering effect loops
  const callbacksRef = useRef({ onRoomState, onSignal, onError, isHost });
  useEffect(() => {
    callbacksRef.current = { onRoomState, onSignal, onError, isHost };
  });

  const wsRef = useRef<WebSocket | null>(null);
  const messageQueueRef = useRef<SignalMessage[]>([]);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastHeartbeatRef = useRef<number>(Date.now());
  const connectRef = useRef<(() => void) | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const modeRef = useRef<'ws' | 'http'>('ws');

  /**
   * Stop HTTP polling loop
   */
  const stopHttpPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  /**
   * Send a message through WebSocket or HTTP
   */
  const sendMessage = useCallback((message: SignalMessage) => {
    if (modeRef.current === 'http') {
      fetch('/api/signal/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      }).catch(() => {});
      return;
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      if (messageQueueRef.current.length < MESSAGE_QUEUE_MAX) {
        messageQueueRef.current.push(message);
      } else {
        console.warn('[useSignaling] Message queue overflow, dropping message');
      }
    }
  }, []);

  /**
   * Send signal via Firestore real-time collection
   */
  const sendFirestoreSignal = useCallback(
    (targetPeerId: string, type: 'offer' | 'answer' | 'candidate', payload: any) => {
      if (!roomId || !peerId || !targetPeerId) return;
      const cleanRoom = roomId.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      
      let plainPayload = payload;
      if (payload && typeof payload === 'object') {
        if (typeof payload.toJSON === 'function') {
          plainPayload = payload.toJSON();
        } else {
          plainPayload = JSON.parse(JSON.stringify(payload));
        }
      }

      addDoc(collection(db, 'rooms', cleanRoom, 'signals'), {
        senderId: peerId,
        targetPeerId,
        type,
        payload: plainPayload,
        timestamp: Date.now(),
      }).catch((err) => console.error('[FirestoreSignal] Write error:', err));
    },
    [roomId, peerId]
  );

  /**
   * Send WebRTC offer
   */
  const sendOffer = useCallback(
    (targetPeerId: string, offer: RTCSessionDescriptionInit) => {
      sendFirestoreSignal(targetPeerId, 'offer', offer);
      sendMessage({
        type: 'offer',
        roomId,
        peerId,
        targetPeerId,
        data: offer,
        timestamp: Date.now(),
      });
    },
    [sendMessage, sendFirestoreSignal, roomId, peerId]
  );

  /**
   * Send WebRTC answer
   */
  const sendAnswer = useCallback(
    (targetPeerId: string, answer: RTCSessionDescriptionInit) => {
      sendFirestoreSignal(targetPeerId, 'answer', answer);
      sendMessage({
        type: 'answer',
        roomId,
        peerId,
        targetPeerId,
        data: answer,
        timestamp: Date.now(),
      });
    },
    [sendMessage, sendFirestoreSignal, roomId, peerId]
  );

  /**
   * Send ICE candidate
   */
  const sendCandidate = useCallback(
    (targetPeerId: string, candidate: RTCIceCandidateInit) => {
      sendFirestoreSignal(targetPeerId, 'candidate', candidate);
      sendMessage({
        type: 'candidate',
        roomId,
        peerId,
        targetPeerId,
        data: candidate,
        timestamp: Date.now(),
      });
    },
    [sendMessage, sendFirestoreSignal, roomId, peerId]
  );

  /**
   * Flush queued messages
   */
  const flushMessageQueue = useCallback(() => {
    while (messageQueueRef.current.length > 0) {
      const message = messageQueueRef.current.shift();
      if (message && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(message));
      }
    }
  }, []);

  /**
   * Handle incoming WebSocket messages
   */
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message: SignalMessage = JSON.parse(event.data);

      switch (message.type) {
        case 'room_state':
          callbacksRef.current.onRoomState?.(message.data);
          break;

        case 'offer':
        case 'answer':
        case 'candidate':
        case 'chat':
          callbacksRef.current.onSignal?.(message);
          break;

        case 'pong':
          lastHeartbeatRef.current = Date.now();
          break;

        case 'error':
          const errorMsg = message.data?.message || 'Unknown signaling error';
          setError(errorMsg);
          callbacksRef.current.onError?.(errorMsg);
          break;

        default:
          console.warn(`[useSignaling] Unknown message type: ${message.type}`);
      }
    } catch (err) {
      console.error('[useSignaling] Error handling message:', err);
    }
  }, []);

  /**
   * Stop heartbeat monitor
   */
  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  /**
   * Start heartbeat monitor
   */
  const startHeartbeat = useCallback(() => {
    stopHeartbeat();
    heartbeatTimerRef.current = setInterval(() => {
      const timeSinceLastHeartbeat = Date.now() - lastHeartbeatRef.current;

      if (timeSinceLastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
        console.warn('[useSignaling] Heartbeat timeout, closing connection...');
        if (wsRef.current) {
          wsRef.current.close();
        }
      } else {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'ping', roomId, peerId, timestamp: Date.now() }));
        }
      }
    }, HEARTBEAT_TIMEOUT_MS / 2);
  }, [stopHeartbeat, roomId, peerId]);

  /**
   * Attempt to reconnect with exponential backoff
   */
  const attemptReconnect = useCallback(() => {
    if (reconnectAttemptsRef.current >= RECONNECT_MAX_ATTEMPTS) {
      const err = `Signaling server unavailable after ${RECONNECT_MAX_ATTEMPTS} attempts`;
      setError(err);
      callbacksRef.current.onError?.(err);
      return;
    }

    const delay = Math.min(10000, RECONNECT_DELAY_MS * Math.pow(2, reconnectAttemptsRef.current));
    reconnectAttemptsRef.current++;

    console.log(
      `[useSignaling] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`
    );

    reconnectTimeoutRef.current = setTimeout(() => {
      connectRef.current?.();
    }, delay);
  }, []);

  /**
   * Start HTTP polling loop as a fallback when WebSocket is unavailable
   */
  const startHttpPolling = useCallback(() => {
    stopHttpPolling();
    modeRef.current = 'http';
    setConnected(true);
    setConnecting(false);
    setError(null);

    // Send join message via HTTP
    fetch('/api/signal/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'join',
        roomId,
        peerId,
        isHost: callbacksRef.current.isHost,
        timestamp: Date.now(),
      }),
    }).catch(() => {});

    // Start poll loop every 800ms
    pollTimerRef.current = setInterval(() => {
      fetch(`/api/signal/poll?roomId=${encodeURIComponent(roomId)}&peerId=${encodeURIComponent(peerId)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data && Array.isArray(data.messages)) {
            data.messages.forEach((msg: SignalMessage) => {
              handleMessage({ data: JSON.stringify(msg) } as MessageEvent);
            });
          }
        })
        .catch(() => {});
    }, 800);
  }, [roomId, peerId, handleMessage, stopHttpPolling]);

  /**
   * Connect to signaling server
   */
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return; // Already connecting or connected
    }

    setConnecting(true);
    setError(null);

    try {
      let fullUrl = signalingUrl;
      if (signalingUrl.startsWith('/')) {
        const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = typeof window !== 'undefined' ? window.location.host : 'localhost:3000';
        fullUrl = `${protocol}//${host}${signalingUrl}`;
      }

      console.log(`[useSignaling] Connecting via WebSocket to ${fullUrl}`);

      const ws = new WebSocket(fullUrl);

      // Connection timeout fallback to HTTP polling after 1.5 seconds if WebSocket is blocked
      const connectionTimeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          console.log('[useSignaling] WebSocket connection timeout, falling back to HTTP Polling');
          try { ws.close(); } catch {}
          if (wsRef.current === ws) {
            wsRef.current = null;
            startHttpPolling();
          }
        }
      }, 1500);

      ws.onopen = () => {
        clearTimeout(connectionTimeout);
        console.log('[useSignaling] Connected to signaling server via WebSocket');
        modeRef.current = 'ws';
        setConnected(true);
        setConnecting(false);
        setError(null);
        reconnectAttemptsRef.current = 0;

        // Join room
        ws.send(
          JSON.stringify({
            type: 'join',
            roomId,
            peerId,
            isHost: callbacksRef.current.isHost,
            timestamp: Date.now(),
          })
        );

        flushMessageQueue();
        startHeartbeat();
      };

      ws.onmessage = handleMessage;

      ws.onerror = (event) => {
        clearTimeout(connectionTimeout);
        console.log('[useSignaling] WebSocket error, failing over to HTTP polling');
        if (wsRef.current === ws) {
          wsRef.current = null;
          startHttpPolling();
        }
      };

      ws.onclose = (evt) => {
        clearTimeout(connectionTimeout);
        stopHeartbeat();

        if (modeRef.current === 'ws' && wsRef.current === ws) {
          wsRef.current = null;
          console.log('[useSignaling] WebSocket closed, attempting HTTP fallback');
          startHttpPolling();
        }
      };

      wsRef.current = ws;
    } catch (err) {
      console.log('[useSignaling] WebSocket constructor failed, using HTTP polling:', err);
      startHttpPolling();
    }
  }, [
    signalingUrl,
    roomId,
    peerId,
    handleMessage,
    flushMessageQueue,
    startHeartbeat,
    stopHeartbeat,
    startHttpPolling,
  ]);

  connectRef.current = connect;

  /**
   * Disconnect from signaling server
   */
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    stopHeartbeat();
    stopHttpPolling();

    if (wsRef.current) {
      const ws = wsRef.current;
      wsRef.current = null;
      ws.close();
    }

    setConnected(false);
    setConnecting(false);
    messageQueueRef.current = [];
    reconnectAttemptsRef.current = 0;
  }, [stopHeartbeat, stopHttpPolling]);

  /**
   * Setup and teardown effects - only reconnect if roomId, peerId, or signalingUrl actually changes
   */
  useEffect(() => {
    if (autoConnect && roomId && peerId) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [roomId, peerId, signalingUrl, autoConnect]);

  /**
   * Firestore Real-time Signaling Sync (Universal fallback for cross-server/cross-domain deployments like Vercel)
   */
  useEffect(() => {
    if (!roomId || !peerId) return;

    const cleanRoom = roomId.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const peerDocRef = doc(db, 'rooms', cleanRoom, 'peers', peerId);

    // Register peer in room
    setDoc(
      peerDocRef,
      {
        peerId,
        isHost: !!callbacksRef.current.isHost,
        lastSeen: Date.now(),
      },
      { merge: true }
    ).catch((err) => console.error('[Firestore] Error registering peer:', err));

    const knownPeers = new Set<string>();

    // Listen to peers collection for room state updates
    const peersCollRef = collection(db, 'rooms', cleanRoom, 'peers');
    const unsubPeers = onSnapshot(peersCollRef, (snapshot) => {
      const currentRemotePeers: string[] = [];
      snapshot.forEach((docSnap) => {
        const id = docSnap.id;
        if (id !== peerId) {
          currentRemotePeers.push(id);
          if (!knownPeers.has(id)) {
            knownPeers.add(id);
            callbacksRef.current.onRoomState?.({
              event: 'peer_joined',
              peerId: id,
            });
          }
        }
      });

      knownPeers.forEach((oldId) => {
        if (!currentRemotePeers.includes(oldId)) {
          knownPeers.delete(oldId);
          callbacksRef.current.onRoomState?.({
            event: 'peer_left',
            peerId: oldId,
          });
        }
      });

      callbacksRef.current.onRoomState?.({ peers: currentRemotePeers });
    });

    // Listen for incoming signals targeted at this peer
    const signalsCollRef = collection(db, 'rooms', cleanRoom, 'signals');
    const qSignals = query(signalsCollRef, where('targetPeerId', '==', peerId));

    const unsubSignals = onSnapshot(qSignals, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          callbacksRef.current.onSignal?.({
            type: data.type,
            roomId: cleanRoom,
            peerId: data.senderId,
            targetPeerId: peerId,
            data: data.payload,
            timestamp: data.timestamp || Date.now(),
          });
          deleteDoc(change.doc.ref).catch(() => {});
        }
      });
    });

    return () => {
      unsubPeers();
      unsubSignals();
      deleteDoc(peerDocRef).catch(() => {});
    };
  }, [roomId, peerId]);

  return {
    connected,
    connecting,
    error,
    sendSignal: sendMessage,
    sendOffer,
    sendAnswer,
    sendCandidate,
    disconnect,
  };
}
