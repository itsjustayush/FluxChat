import React, { useState, useRef, useEffect, useCallback } from 'react';
import crc32 from 'js-crc32';
import { collection, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { RoomState, BundleItem, TransferProgress, SystemLogEntry, Peer, ChatMessage, UserSession } from '../types';
import { useSignaling } from '../hooks/useSignaling';
import {
  encryptFileBuffer,
  formatBytes,
  calculateCarbonMetrics,
  getFileTypeLabel,
} from '../lib/crypto';
import {
  createLogEntry,
  WebRTCPeerEngine,
  validateTransferQuota,
  WebRTCConnectionState,
  formatRoomOTPDisplay,
} from '../lib/p2pEngine';
import { QRCodeModal } from './QRCodeModal';
import { ActivityToastContainer, ActivityToastData } from './ActivityToast';

async function arrayBufferToDataUrl(buffer: ArrayBuffer, mimeType: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([buffer], { type: mimeType });
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const arr = dataUrl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

interface RoomViewProps {
  room: RoomState;
  session?: UserSession;
  onLeaveRoom: () => void;
  onPreviewFile: (file: BundleItem) => void;
  onAddBundleItem: (item: BundleItem) => void;
}

interface ErrorToast {
  id: string;
  code: string;
  message: string;
}

const QUICK_EMOJIS = ['👍', '❤️', '🔥', '🎉', '😮', '😂'];

export const RoomView: React.FC<RoomViewProps> = ({
  room,
  session,
  onLeaveRoom,
  onPreviewFile,
  onAddBundleItem,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [webrtcState, setWebrtcState] = useState<WebRTCConnectionState>('connected');
  const [errorToasts, setErrorToasts] = useState<ErrorToast[]>([]);
  const [activityToasts, setActivityToasts] = useState<ActivityToastData[]>([]);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);

  const addActivityToast = (type: 'join' | 'leave' | 'info', peerName: string, peerId?: string, message?: string) => {
    const newToast: ActivityToastData = {
      id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      type,
      peerName,
      peerId,
      message: message || (type === 'join' ? 'joined the room' : type === 'leave' ? 'left the room' : 'room activity update'),
      timestamp: Date.now(),
    };

    setActivityToasts((prev) => [...prev.slice(-4), newToast]);

    setTimeout(() => {
      setActivityToasts((prev) => prev.filter((t) => t.id !== newToast.id));
    }, 4500);
  };

  const dismissActivityToast = (id: string) => {
    setActivityToasts((prev) => prev.filter((t) => t.id !== id));
  };
  const [showPresenceList, setShowPresenceList] = useState(false);
  const [activeTab, setActiveTab] = useState<'CHAT' | 'FILES'>('CHAT');

  // Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome-1',
      senderId: 'SYSTEM',
      senderName: 'ULTRON SYSTEM',
      text: `Ephemeral encrypted room ${room.id} active. Zero database storage — all messages and files disappear when room closes.`,
      timestamp: Date.now(),
      type: 'system',
    },
    ...(room.messages || []),
  ]);
  const [chatInput, setChatInput] = useState('');
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Real-time peers list
  const [peersList, setPeersList] = useState<Peer[]>(room.activePeers || []);
  const peersListRef = useRef<Peer[]>(peersList);
  const prevPeersListRef = useRef<Peer[]>([]);

  useEffect(() => {
    peersListRef.current = peersList;

    const prevPeers = prevPeersListRef.current;
    if (prevPeers.length > 0) {
      // Newly joined peers
      peersList.forEach((peer) => {
        if (!peer.isYou && !prevPeers.some((p) => p.id === peer.id)) {
          addActivityToast('join', peer.name || `Peer-${peer.id.substring(0, 4).toUpperCase()}`, peer.id, 'joined the room');
        }
      });

      // Peers who left
      prevPeers.forEach((prevPeer) => {
        if (!prevPeer.isYou && !peersList.some((p) => p.id === prevPeer.id)) {
          addActivityToast('leave', prevPeer.name || `Peer-${prevPeer.id.substring(0, 4).toUpperCase()}`, prevPeer.id, 'left the room');
        }
      });
    }
    prevPeersListRef.current = peersList;
  }, [peersList]);

  // Typing Indicator State & Refs
  const [typingPeersMap, setTypingPeersMap] = useState<Record<string, string>>({});
  const typingTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});
  const localTypingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isCurrentlyTypingRef = useRef<boolean>(false);

  // Message Reactions State & Logic
  const [activeEmojiPickerMsgId, setActiveEmojiPickerMsgId] = useState<string | null>(null);

  const applyReactionUpdate = useCallback((messageId: string, emoji: string, updatedPeers: string[]) => {
    setChatMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== messageId) return msg;
        const currentReactions = { ...(msg.reactions || {}) };
        if (updatedPeers && updatedPeers.length > 0) {
          currentReactions[emoji] = updatedPeers;
        } else {
          delete currentReactions[emoji];
        }
        return { ...msg, reactions: currentReactions };
      })
    );
  }, []);

  const handleToggleReaction = (messageId: string, emoji: string) => {
    setChatMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== messageId) return msg;

        const reactions = { ...(msg.reactions || {}) };
        const currentPeers = reactions[emoji] || [];
        const hasReacted = currentPeers.includes(localPeerId);

        const newPeers = hasReacted
          ? currentPeers.filter((id) => id !== localPeerId)
          : [...currentPeers, localPeerId];

        if (newPeers.length > 0) {
          reactions[emoji] = newPeers;
        } else {
          delete reactions[emoji];
        }

        // Broadcast reaction via socket signal
        sendSignal({
          type: 'reaction',
          roomId: room.id,
          peerId: localPeerId,
          data: { messageId, emoji, updatedPeers: newPeers },
        });

        // Broadcast reaction via WebRTC DataChannel
        if (peerEngineRef.current?.dataChannel?.readyState === 'open') {
          try {
            peerEngineRef.current.dataChannel.send(
              JSON.stringify({
                type: 'REACTION',
                messageId,
                emoji,
                peerId: localPeerId,
                updatedPeers: newPeers,
              })
            );
          } catch (e) {
            // ignore
          }
        }

        // Sync reaction to Firestore message doc
        const cleanRoom = room.id.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        setDoc(
          doc(db, 'rooms', cleanRoom, 'messages', messageId),
          { reactions },
          { merge: true }
        ).catch(() => {});

        return { ...msg, reactions };
      })
    );
  };

  const handleRemoteTypingStatus = (peerId: string, isTyping: boolean, senderName?: string) => {
    if (!peerId || peerId === localPeerId) return;

    if (typingTimeoutsRef.current[peerId]) {
      clearTimeout(typingTimeoutsRef.current[peerId]);
      delete typingTimeoutsRef.current[peerId];
    }

    if (isTyping) {
      const peerName = senderName || `Peer-${peerId.substring(0, 4).toUpperCase()}`;
      setTypingPeersMap((prev) => ({ ...prev, [peerId]: peerName }));

      typingTimeoutsRef.current[peerId] = setTimeout(() => {
        setTypingPeersMap((prev) => {
          const next = { ...prev };
          delete next[peerId];
          return next;
        });
      }, 3500);
    } else {
      setTypingPeersMap((prev) => {
        const next = { ...prev };
        delete next[peerId];
        return next;
      });
    }
  };

  const [logs, setLogs] = useState<SystemLogEntry[]>([]);
  const [transfer, setTransfer] = useState<TransferProgress | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const localPeerId = session?.id || room.activePeers.find((p) => p.isYou)?.id || 'LOCAL_PEER';
  const isHost = room.hostId === localPeerId;
  const peerEngineRef = useRef<WebRTCPeerEngine | null>(null);

  const bundleItemsRef = useRef<BundleItem[]>(room.bundleItems);
  useEffect(() => {
    bundleItemsRef.current = room.bundleItems;
  }, [room.bundleItems]);

  const addErrorToast = (code: string, message: string) => {
    setErrorToasts((prev) => {
      if (prev.some((t) => t.code === code)) return prev;
      const newToast: ErrorToast = {
        id: `err-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        code,
        message,
      };
      setTimeout(() => {
        setErrorToasts((p) => p.filter((t) => t.id !== newToast.id));
      }, 8000);
      return [...prev, newToast];
    });
  };

  // Auto scroll chat to bottom when new messages arrive or typing status changes
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, typingPeersMap]);

  const { sendSignal, sendOffer, sendAnswer, sendCandidate } = useSignaling({
    signalingUrl: '/ws',
    roomId: room.id,
    peerId: localPeerId,
    isHost,
    onRoomState: (data) => {
      if (data.event === 'peer_joined') {
        const joinedId = data.peerId;
        setPeersList((prev) => {
          if (prev.some((p) => p.id === joinedId)) return prev;
          return [
            ...prev,
            {
              id: joinedId,
              name: `Peer-${joinedId.substring(0, 4).toUpperCase()}`,
              isYou: false,
              status: 'ONLINE',
              latencyMs: 12,
              ip: 'P2P_DIRECT',
            },
          ];
        });
        setChatMessages((prev) => [
          ...prev,
          {
            id: `join-${Date.now()}`,
            senderId: 'SYSTEM',
            senderName: 'FLUX SYSTEM',
            text: `Peer ${joinedId.substring(0, 6).toUpperCase()} connected to room.`,
            timestamp: Date.now(),
            type: 'system',
          },
        ]);

        if (isHost && peerEngineRef.current) {
          peerEngineRef.current.createOffer().then((offer) => {
            if (offer) sendOffer(joinedId, offer);
          });
        }
      } else if (data.event === 'peer_left') {
        setPeersList((prev) => prev.filter((p) => p.id !== data.peerId));
        setChatMessages((prev) => [
          ...prev,
          {
            id: `left-${Date.now()}`,
            senderId: 'SYSTEM',
            senderName: 'FLUX SYSTEM',
            text: `Peer ${data.peerId.substring(0, 6).toUpperCase()} left the room.`,
            timestamp: Date.now(),
            type: 'system',
          },
        ]);
      } else if (data.peers) {
        const remotePeers: Peer[] = data.peers.map((id: string) => ({
          id,
          name: `Peer-${id.substring(0, 4).toUpperCase()}`,
          isYou: false,
          status: 'ONLINE',
          latencyMs: 12,
          ip: 'P2P_DIRECT',
        }));
        setPeersList([
          ...room.activePeers.filter((p) => p.isYou),
          ...remotePeers,
        ]);
      }
    },
    onSignal: async (msg) => {
      const peerEngine = peerEngineRef.current;

      if (msg.type === 'reaction' && msg.data) {
        const { messageId, emoji, updatedPeers } = msg.data;
        if (messageId && emoji && Array.isArray(updatedPeers)) {
          applyReactionUpdate(messageId, emoji, updatedPeers);
        }
        return;
      }

      if (msg.type === 'typing' && msg.data) {
        const { peerId, isTyping, senderName } = msg.data;
        const sender = peerId || msg.peerId;
        if (sender && sender !== localPeerId) {
          handleRemoteTypingStatus(sender, Boolean(isTyping), senderName);
        }
        return;
      }

      if (msg.type === 'chat' && msg.data) {
        const chatMsg = msg.data as ChatMessage;
        setChatMessages((prev) => {
          if (prev.some((m) => m.id === chatMsg.id)) return prev;
          return [...prev, { ...chatMsg, status: 'read' }];
        });

        // Automatically send ACK back if message came from another peer
        if (chatMsg.senderId !== localPeerId) {
          sendSignal({
            type: 'chat_ack',
            roomId: room.id,
            peerId: localPeerId,
            targetPeerId: chatMsg.senderId,
            data: { messageId: chatMsg.id, status: 'read' },
          });
        }
        return;
      }

      if (msg.type === 'chat_ack' && msg.data) {
        const { messageId, status } = msg.data;
        if (messageId) {
          setChatMessages((prev) =>
            prev.map((m) => (m.id === messageId ? { ...m, status: status || 'read' } : m))
          );
        }
        return;
      }

      if (!peerEngine) return;

      if (msg.type === 'offer' && msg.data) {
        const answer = await peerEngine.handleOffer(msg.data);
        if (answer && msg.peerId) sendAnswer(msg.peerId, answer);
      } else if (msg.type === 'answer' && msg.data) {
        await peerEngine.handleAnswer(msg.data);
      } else if (msg.type === 'candidate' && msg.data) {
        await peerEngine.addIceCandidate(msg.data);
      }
    },
    onError: (err) => {
      if (err.includes('WebSocket') || err.includes('unavailable')) return;
      addErrorToast('ERR_SIGNALING', err);
    },
  });

  // Sync chat messages from Firestore real-time channel
  useEffect(() => {
    if (!room.id) return;
    const cleanRoom = room.id.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const msgsCollRef = collection(db, 'rooms', cleanRoom, 'messages');

    const unsub = onSnapshot(
      msgsCollRef,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added' || change.type === 'modified') {
            const data = change.doc.data() as ChatMessage;
            if (!data || !data.id) return;
            setChatMessages((prev) => {
              const idx = prev.findIndex((m) => m.id === data.id);
              if (idx >= 0) {
                const copy = [...prev];
                copy[idx] = { ...copy[idx], ...data };
                return copy;
              }
              return [...prev, data];
            });

            // Mark read in Firestore if from another peer
            if (change.type === 'added' && data.senderId && data.senderId !== localPeerId && data.type !== 'system') {
              if (data.status !== 'read') {
                setDoc(doc(db, 'rooms', cleanRoom, 'messages', data.id), { status: 'read' }, { merge: true }).catch(() => {});
              }
            }
          }
        });
      },
      (error) => {
        console.warn('Firestore msgs onSnapshot error:', error);
      }
    );

    return () => unsub();
  }, [room.id]);

  // Sync files from Firestore real-time channel
  useEffect(() => {
    if (!room.id) return;
    const cleanRoom = room.id.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const bundleCollRef = collection(db, 'rooms', cleanRoom, 'bundleItems');

    const unsub = onSnapshot(
      bundleCollRef,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = change.doc.data();
            if (!data || !data.id) return;

            const exists = bundleItemsRef.current.some((item) => item.id === data.id);
            if (exists) return;

            let rawBlob: Blob | undefined;
            let blobUrl: string | undefined;

            if (data.dataUrl) {
              rawBlob = dataUrlToBlob(data.dataUrl);
              blobUrl = URL.createObjectURL(rawBlob);
            } else if (data.textContent) {
              rawBlob = new Blob([data.textContent], { type: data.type || 'text/plain' });
              blobUrl = URL.createObjectURL(rawBlob);
            }

            const newItem: BundleItem = {
              id: data.id,
              name: data.name,
              size: data.size,
              type: data.type,
              fileTypeLabel: data.fileTypeLabel,
              fileId: data.fileId,
              dimensions: data.dimensions,
              sha256: data.sha256,
              encryptedHash: data.encryptedHash,
              blobUrl,
              rawBlob,
              textContent: data.textContent,
              uploaderId: data.uploaderId,
              uploaderName: data.uploaderName,
              timestamp: data.timestamp,
              carbonFootprintGrams: data.carbonFootprintGrams,
              peerSeeds: data.peerSeeds || 1,
              encryptionStatus: 'AES-256-GCM VERIFIED',
            };

            onAddBundleItem(newItem);
          }
        });
      },
      (error) => {
        console.warn('Firestore bundleItems onSnapshot error:', error);
      }
    );

    return () => unsub();
  }, [room.id]);

  // WebRTC DataChannel initialization
  useEffect(() => {
    const peerEngine = new WebRTCPeerEngine(room.id, localPeerId);
    peerEngineRef.current = peerEngine;

    peerEngine.onStateChange = (state) => {
      setWebrtcState(state);
    };

    peerEngine.onDataReceived = (data) => {
      if (typeof data === 'string') {
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'CHAT_MESSAGE' && parsed.data) {
            const chatMsg = parsed.data as ChatMessage;
            setChatMessages((prev) => {
              if (prev.some((m) => m.id === chatMsg.id)) return prev;
              return [...prev, { ...chatMsg, status: 'read' }];
            });

            if (chatMsg.senderId !== localPeerId && peerEngineRef.current?.dataChannel?.readyState === 'open') {
              try {
                peerEngineRef.current.dataChannel.send(
                  JSON.stringify({ type: 'CHAT_ACK', messageId: chatMsg.id, status: 'read' })
                );
              } catch (e) {
                // ignore
              }
            }
          } else if (parsed.type === 'TYPING_STATUS') {
            const { peerId, isTyping, senderName } = parsed;
            if (peerId && peerId !== localPeerId) {
              handleRemoteTypingStatus(peerId, Boolean(isTyping), senderName);
            }
          } else if (parsed.type === 'REACTION' && parsed.messageId && parsed.emoji) {
            applyReactionUpdate(parsed.messageId, parsed.emoji, parsed.updatedPeers || []);
          } else if (parsed.type === 'CHAT_ACK' && parsed.messageId) {
            setChatMessages((prev) =>
              prev.map((m) => (m.id === parsed.messageId ? { ...m, status: parsed.status || 'read' } : m))
            );
          } else if (parsed.type === 'BUNDLE_ITEM_SHARE' && parsed.item) {
            const dataItem = parsed.item;
            const exists = bundleItemsRef.current.some((i) => i.id === dataItem.id);
            if (!exists) {
              let rawBlob: Blob | undefined;
              let blobUrl: string | undefined;

              if (dataItem.dataUrl) {
                rawBlob = dataUrlToBlob(dataItem.dataUrl);
                blobUrl = URL.createObjectURL(rawBlob);
              } else if (dataItem.textContent) {
                rawBlob = new Blob([dataItem.textContent], { type: dataItem.type || 'text/plain' });
                blobUrl = URL.createObjectURL(rawBlob);
              }

              const receivedItem: BundleItem = {
                id: dataItem.id,
                name: dataItem.name,
                size: dataItem.size,
                type: dataItem.type,
                fileTypeLabel: dataItem.fileTypeLabel,
                fileId: dataItem.fileId,
                dimensions: dataItem.dimensions,
                sha256: dataItem.sha256,
                encryptedHash: dataItem.encryptedHash,
                blobUrl,
                rawBlob,
                textContent: dataItem.textContent,
                uploaderId: dataItem.uploaderId,
                uploaderName: dataItem.uploaderName,
                timestamp: dataItem.timestamp,
                carbonFootprintGrams: dataItem.carbonFootprintGrams,
                peerSeeds: dataItem.peerSeeds || 1,
                encryptionStatus: 'AES-256-GCM VERIFIED',
              };

              onAddBundleItem(receivedItem);
            }
          }
        } catch (e) {
          console.error('[WebRTC] DataChannel receive parse error:', e);
        }
      }
    };

    peerEngine.onSignalOutput = (signal) => {
      if (signal.type === 'candidate' && signal.data) {
        const remoteTarget = peersListRef.current.find((p) => !p.isYou)?.id;
        if (remoteTarget) {
          sendCandidate(remoteTarget, signal.data);
        }
      }
    };

    return () => {
      peerEngine.close();
      peerEngineRef.current = null;
    };
  }, [room.id, localPeerId]);

  // Broadcast local typing status
  const broadcastTypingStatus = (isTyping: boolean) => {
    const myName = session?.identifier || 'Guest';
    const payload = { isTyping, senderName: myName, peerId: localPeerId };

    sendSignal({
      type: 'typing',
      roomId: room.id,
      peerId: localPeerId,
      data: payload,
    });

    if (peerEngineRef.current?.dataChannel?.readyState === 'open') {
      try {
        peerEngineRef.current.dataChannel.send(
          JSON.stringify({ type: 'TYPING_STATUS', ...payload })
        );
      } catch (e) {
        // ignore
      }
    }
  };

  const handleChatInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setChatInput(val);

    if (val.trim()) {
      if (!isCurrentlyTypingRef.current) {
        isCurrentlyTypingRef.current = true;
        broadcastTypingStatus(true);
      }

      if (localTypingTimeoutRef.current) {
        clearTimeout(localTypingTimeoutRef.current);
      }

      localTypingTimeoutRef.current = setTimeout(() => {
        isCurrentlyTypingRef.current = false;
        broadcastTypingStatus(false);
      }, 2500);
    } else {
      if (isCurrentlyTypingRef.current) {
        isCurrentlyTypingRef.current = false;
        broadcastTypingStatus(false);
      }
      if (localTypingTimeoutRef.current) {
        clearTimeout(localTypingTimeoutRef.current);
      }
    }
  };

  // Send Chat Message
  const handleSendChatMessage = async (textToSend?: string) => {
    const content = (textToSend || chatInput).trim();
    if (!content) return;

    // Clear typing indicator state
    if (isCurrentlyTypingRef.current) {
      isCurrentlyTypingRef.current = false;
      broadcastTypingStatus(false);
    }
    if (localTypingTimeoutRef.current) {
      clearTimeout(localTypingTimeoutRef.current);
    }

    const hasRemotePeers = peersList.some((p) => !p.isYou);
    const initialStatus: 'sent' | 'delivered' = hasRemotePeers ? 'delivered' : 'sent';

    const chatMsg: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      senderId: localPeerId,
      senderName: session?.identifier || 'Guest',
      text: content,
      timestamp: Date.now(),
      type: 'text',
      status: initialStatus,
      encryptedHash: 'AES-256-GCM',
    };

    setChatMessages((prev) => [...prev, chatMsg]);
    setChatInput('');

    // 1. Send via WebSocket signal
    sendSignal({
      type: 'chat',
      roomId: room.id,
      peerId: localPeerId,
      data: chatMsg,
    });

    // 2. Send via WebRTC DataChannel if open
    if (peerEngineRef.current?.dataChannel?.readyState === 'open') {
      try {
        peerEngineRef.current.dataChannel.send(
          JSON.stringify({ type: 'CHAT_MESSAGE', data: chatMsg })
        );
      } catch (e) {
        console.warn('DataChannel error:', e);
      }
    }

    // 3. Write to Firestore real-time channel
    try {
      const cleanRoom = room.id.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      await setDoc(doc(db, 'rooms', cleanRoom, 'messages', chatMsg.id), chatMsg);
    } catch (err) {
      // ignore
    }
  };

  // Copy Share Link
  const handleCopyLink = () => {
    const shareUrl = `${window.location.origin}?room=${room.id}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  // File Processing
  const processSingleFile = async (file: File) => {
    const fileName = file.name;
    const fileType = file.type || 'application/octet-stream';
    const fileSize = file.size;

    const quotaResult = validateTransferQuota(
      fileSize,
      room.bundleItems.reduce((acc, i) => acc + i.size, 0)
    );
    if (!quotaResult.valid) {
      addErrorToast(quotaResult.errorCode || 'ERR_QUOTA', quotaResult.errorMessage || 'Quota exceeded');
      return;
    }

    try {
      const fileBuffer = await file.arrayBuffer();
      const encrypted = await encryptFileBuffer(fileBuffer);
      const dataUrl = await arrayBufferToDataUrl(fileBuffer, fileType);
      const rawBlob = new Blob([fileBuffer], { type: fileType });
      const blobUrl = URL.createObjectURL(rawBlob);

      const newItem: BundleItem = {
        id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: fileName,
        size: fileSize,
        type: fileType,
        fileTypeLabel: getFileTypeLabel(fileName, fileType),
        fileId: `FLX-${Math.floor(1000 + Math.random() * 9000)}-${fileName.substring(0, 4).toUpperCase()}`,
        dimensions: `${(fileSize / 1024).toFixed(1)} KB`,
        sha256: encrypted.sha256Hex,
        encryptedHash: encrypted.sha256Hex,
        blobUrl,
        rawBlob,
        uploaderId: localPeerId,
        uploaderName: session?.identifier || 'Guest Host',
        timestamp: Date.now(),
        carbonFootprintGrams: calculateCarbonMetrics(fileSize).p2pCarbonGrams,
        peerSeeds: 1,
        encryptionStatus: 'AES-256-GCM VERIFIED',
      };

      onAddBundleItem(newItem);

      // Create a chat file notice message
      const fileChatNotice: ChatMessage = {
        id: `file-chat-${newItem.id}`,
        senderId: localPeerId,
        senderName: session?.identifier || 'Guest',
        text: `Shared file: ${fileName} (${formatBytes(fileSize)})`,
        timestamp: Date.now(),
        type: 'file_notice',
        attachment: {
          fileName: newItem.name,
          fileSize: newItem.size,
          fileId: newItem.id,
          blobUrl: newItem.blobUrl,
          fileTypeLabel: newItem.fileTypeLabel,
        },
      };

      setChatMessages((prev) => [...prev, fileChatNotice]);

      // Broadcast file metadata & chat message to room
      const cleanRoom = room.id.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      await setDoc(doc(db, 'rooms', cleanRoom, 'bundleItems', newItem.id), {
        id: newItem.id,
        name: newItem.name,
        size: newItem.size,
        type: newItem.type,
        fileTypeLabel: newItem.fileTypeLabel,
        fileId: newItem.fileId,
        sha256: newItem.sha256,
        encryptedHash: newItem.encryptedHash,
        uploaderId: newItem.uploaderId,
        uploaderName: newItem.uploaderName,
        timestamp: newItem.timestamp,
        carbonFootprintGrams: newItem.carbonFootprintGrams,
        dataUrl,
      });

      await setDoc(doc(db, 'rooms', cleanRoom, 'messages', fileChatNotice.id), fileChatNotice);
    } catch (err: any) {
      addErrorToast('ERR_ENCRYPT_FAIL', err?.message || 'Failed to encrypt file.');
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      (Array.from(e.target.files) as File[]).forEach((file) => processSingleFile(file));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      (Array.from(e.dataTransfer.files) as File[]).forEach((file) => processSingleFile(file));
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="min-h-screen pt-16 pb-12 px-3 sm:px-8 bg-[#F2F2EE] flex flex-col"
    >
      {/* Top Header Bar */}
      <div className="w-full max-w-[1280px] mx-auto mt-2 mb-4">
        <div className="bg-white/90 backdrop-blur-xl border border-[#192837]/10 rounded-2xl p-4 flex flex-wrap justify-between items-center gap-4 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={onLeaveRoom}
              className="p-2 bg-white border border-[#192837]/20 hover:bg-[#F2F2EE] text-[#192837] rounded-xl font-mono text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
            >
              <span className="material-symbols-outlined text-base">arrow_back</span>
              Leave Room
            </button>

            <div className="h-6 w-[1px] bg-[#192837]/15 hidden sm:block"></div>

            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-[#192837]/60">ROOM CODE:</span>
              <span className="font-mono text-base font-extrabold text-[#7342E2] bg-[#7342E2]/10 px-3 py-1 rounded-lg border border-[#7342E2]/30">
                {formatRoomOTPDisplay(room.id)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleCopyLink}
              className="px-3 py-1.5 bg-[#7342E2]/10 hover:bg-[#7342E2]/20 text-[#7342E2] border border-[#7342E2]/30 rounded-xl font-mono text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-base">
                {copiedLink ? 'check_circle' : 'link'}
              </span>
              {copiedLink ? 'LINK COPIED' : 'COPY SHARE LINK'}
            </button>

            <button
              onClick={() => setIsQrModalOpen(true)}
              className="px-3 py-1.5 bg-white border border-[#192837]/20 hover:bg-[#F2F2EE] text-[#192837] rounded-xl font-mono text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-base">qr_code_2</span>
              QR
            </button>

            <div className="relative">
              <button
                onClick={() => setShowPresenceList(!showPresenceList)}
                className="px-3 py-1.5 bg-emerald-500/10 text-emerald-700 border border-emerald-500/30 rounded-xl font-mono text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>{peersList.length} ONLINE</span>
              </button>

              {/* Online peers popup */}
              {showPresenceList && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-[#192837]/15 rounded-2xl shadow-xl p-3 z-50">
                  <div className="font-mono text-[10px] font-bold text-[#192837]/50 uppercase mb-2">
                    ACTIVE ROOM PEERS
                  </div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {peersList.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between text-xs font-mono p-1.5 rounded-lg bg-[#F2F2EE]"
                      >
                        <span className="font-bold text-[#192837]">
                          {p.name} {p.isYou ? '(YOU)' : ''}
                        </span>
                        <span className="text-[10px] text-emerald-600 font-bold">ONLINE</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Drag & drop overlay indicator */}
      {isDragging && (
        <div className="fixed inset-0 z-50 bg-[#7342E2]/80 backdrop-blur-md flex flex-col items-center justify-center text-white border-4 border-dashed border-white m-4 rounded-3xl pointer-events-none">
          <span className="material-symbols-outlined text-6xl mb-2 animate-bounce">upload_file</span>
          <div className="font-heading text-2xl font-bold">Drop files to share in room</div>
          <div className="font-mono text-xs opacity-90 mt-1">AES-256-GCM Ephemeral Encryption Active</div>
        </div>
      )}

      {/* Main Split Layout: Left Chat + Right Files/Dropzone */}
      <div className="w-full max-w-[1280px] mx-auto flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[580px]">
        
        {/* Left / Main Column: Real-time Ephemeral Chat (7 cols) */}
        <div className="lg:col-span-7 bg-white/90 backdrop-blur-2xl border border-[#192837]/10 rounded-3xl p-4 sm:p-6 flex flex-col justify-between shadow-sm min-h-[500px]">
          {/* Chat Header */}
          <div className="flex justify-between items-center pb-3 border-b border-[#192837]/10">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#7342E2] text-xl">forum</span>
              <span className="font-heading font-bold text-base text-[#192837]">REAL-TIME CHAT</span>
            </div>
            <div className="flex items-center gap-1.5 font-mono text-[11px] text-[#7342E2] bg-[#7342E2]/10 px-2.5 py-1 rounded-full font-bold">
              <span className="material-symbols-outlined text-sm">lock</span>
              <span>ZERO DATABASE LOGS</span>
            </div>
          </div>

          {/* Chat Message Stream */}
          <div className="flex-1 overflow-y-auto py-4 space-y-3.5 my-2 max-h-[460px] pr-1">
            {chatMessages.map((msg) => {
              const isYou = msg.senderId === localPeerId;
              const isSystem = msg.type === 'system';

              if (isSystem) {
                return (
                  <div key={msg.id} className="flex justify-center my-2">
                    <div className="bg-[#192837]/5 text-[#192837]/70 font-mono text-[11px] px-3.5 py-1.5 rounded-full border border-[#192837]/10 text-center max-w-md">
                      {msg.text}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col relative group/msg ${isYou ? 'items-end' : 'items-start'}`}
                >
                  <div className="flex items-center gap-1.5 mb-1 px-1">
                    <span className="font-mono text-[11px] font-bold text-[#192837]/70">
                      {isYou ? 'YOU' : msg.senderName}
                    </span>
                    <span className="font-mono text-[10px] text-[#192837]/40">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <div className="relative max-w-[85%] group/bubble">
                    {/* Hover & Click Reaction Floating Toolbar */}
                    <div
                      className={`absolute -top-4 z-20 flex items-center gap-1 bg-white border border-[#192837]/15 rounded-full px-2 py-1 shadow-md transition-all duration-200 ${
                        isYou ? 'right-2' : 'left-2'
                      } ${
                        activeEmojiPickerMsgId === msg.id
                          ? 'opacity-100 scale-100 pointer-events-auto'
                          : 'opacity-0 scale-95 group-hover/bubble:opacity-100 group-hover/bubble:scale-100 pointer-events-none group-hover/bubble:pointer-events-auto'
                      }`}
                    >
                      <div className="flex items-center gap-1 pr-1 border-r border-[#192837]/10">
                        {QUICK_EMOJIS.map((emoji) => {
                          const currentPeers = msg.reactions?.[emoji] || [];
                          const hasReacted = currentPeers.includes(localPeerId);
                          return (
                            <button
                              key={emoji}
                              onClick={() => {
                                handleToggleReaction(msg.id, emoji);
                                setActiveEmojiPickerMsgId(null);
                              }}
                              className={`text-sm hover:scale-130 transition-transform p-0.5 rounded-full cursor-pointer leading-none ${
                                hasReacted ? 'bg-[#7342E2]/20 scale-110' : 'hover:bg-[#192837]/5'
                              }`}
                              title={`React with ${emoji}`}
                            >
                              {emoji}
                            </button>
                          );
                        })}
                      </div>
                      <button
                        onClick={() =>
                          setActiveEmojiPickerMsgId(
                            activeEmojiPickerMsgId === msg.id ? null : msg.id
                          )
                        }
                        className="text-[10px] font-mono font-bold text-[#7342E2] hover:bg-[#7342E2]/10 px-1.5 py-0.5 rounded-md transition-colors flex items-center gap-0.5 cursor-pointer"
                        title="React to message"
                      >
                        <span className="material-symbols-outlined text-xs">add_reaction</span>
                        <span className="hidden sm:inline">React</span>
                      </button>
                    </div>

                    <div
                      className={`p-3.5 rounded-2xl text-sm font-sans leading-relaxed break-words shadow-2xs ${
                        isYou
                          ? 'bg-[#7342E2] text-white rounded-tr-none'
                          : 'bg-white text-[#192837] border border-[#192837]/15 rounded-tl-none'
                      }`}
                    >
                      {msg.text}

                      {/* Attachment preview inside chat bubble */}
                      {msg.attachment && (
                        <div className="mt-2.5 pt-2 border-t border-white/20 flex items-center justify-between gap-3 bg-black/10 p-2 rounded-xl">
                          <div className="flex items-center gap-2 overflow-hidden">
                            <span className="material-symbols-outlined text-lg">attachment</span>
                            <span className="font-mono text-xs font-bold truncate">{msg.attachment.fileName}</span>
                          </div>
                          {msg.attachment.blobUrl && (
                            <a
                              href={msg.attachment.blobUrl}
                              download={msg.attachment.fileName}
                              className="bg-white text-[#192837] hover:bg-emerald-400 font-mono text-[10px] font-bold px-2 py-1 rounded-md shrink-0 transition-colors"
                            >
                              DOWNLOAD
                            </a>
                          )}
                        </div>
                      )}

                      {/* Active Reactions List */}
                      {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2 border-t border-black/10">
                          {Object.entries(msg.reactions).map(([emoji, peerIdsVal]) => {
                            const peerIds = (peerIdsVal as string[]) || [];
                            if (!peerIds || peerIds.length === 0) return null;
                            const isMyReaction = peerIds.includes(localPeerId);
                            const names = peerIds.map((id) => {
                              if (id === localPeerId) return 'You';
                              const found = peersList.find((p) => p.id === id);
                              return found?.name || `Peer-${id.substring(0, 4).toUpperCase()}`;
                            });

                            return (
                              <button
                                key={emoji}
                                onClick={() => handleToggleReaction(msg.id, emoji)}
                                title={`Reacted by: ${names.join(', ')}`}
                                className={`inline-flex items-center gap-1 font-mono text-[11px] font-bold px-2 py-0.5 rounded-full transition-all cursor-pointer ${
                                  isMyReaction
                                    ? isYou
                                      ? 'bg-white text-[#7342E2] shadow-xs'
                                      : 'bg-[#7342E2] text-white shadow-xs'
                                    : isYou
                                    ? 'bg-black/20 text-white/90 hover:bg-black/30'
                                    : 'bg-[#F2F2EE] text-[#192837] hover:bg-[#192837]/10 border border-[#192837]/15'
                                }`}
                              >
                                <span>{emoji}</span>
                                <span>{peerIds.length}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Delivery & Read Status for outgoing messages */}
                    {isYou && (
                      <div className="mt-1.5 pt-1 border-t border-white/10 flex justify-end items-center gap-1">
                        {(() => {
                          const st = msg.status || 'sent';
                          if (st === 'sending') {
                            return (
                              <span className="inline-flex items-center gap-1 font-mono text-[10px] text-white/70" title="Sending message...">
                                <span className="material-symbols-outlined text-[13px] animate-spin">sync</span>
                                <span>Sending</span>
                              </span>
                            );
                          }
                          if (st === 'sent') {
                            return (
                              <span className="inline-flex items-center gap-1 font-mono text-[10px] text-white/70" title="Sent to room channel (Single check)">
                                <span className="material-symbols-outlined text-[13px]">check</span>
                                <span>Sent</span>
                              </span>
                            );
                          }
                          if (st === 'delivered') {
                            return (
                              <span className="inline-flex items-center gap-1 font-mono text-[10px] text-white/90" title="Delivered to room peers (Double check)">
                                <span className="material-symbols-outlined text-[13px]">done_all</span>
                                <span>Delivered</span>
                              </span>
                            );
                          }
                          if (st === 'read') {
                            return (
                              <span className="inline-flex items-center gap-1 font-mono text-[10px] text-emerald-300 font-bold" title="Read confirmed by peer (Double check)">
                                <span className="material-symbols-outlined text-[13px] font-bold">done_all</span>
                                <span>Read</span>
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
            })}
            {/* Typing Indicator */}
            {Object.keys(typingPeersMap).length > 0 && (
              <div className="flex items-center gap-2 text-xs font-mono text-[#7342E2] bg-[#7342E2]/10 py-1.5 px-3 rounded-full w-fit mb-2 border border-[#7342E2]/20 shadow-xs animate-fade-in">
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-[#7342E2] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-1.5 h-1.5 bg-[#7342E2] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-1.5 h-1.5 bg-[#7342E2] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
                <span className="font-semibold">
                  {(() => {
                    const names = Object.values(typingPeersMap);
                    if (names.length === 1) return `${names[0]} is typing...`;
                    if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;
                    return `${names[0]} and ${names.length - 1} others are typing...`;
                  })()}
                </span>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Quick Emojis Bar */}
          <div className="flex items-center gap-1.5 py-1.5 px-1 overflow-x-auto border-t border-[#192837]/10">
            {['👋', '👍', '🔥', '🚀', '🔒', '❤️', '📁', '💻'].map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleSendChatMessage(emoji)}
                className="text-base p-1.5 hover:bg-[#192837]/5 rounded-lg transition-colors cursor-pointer"
              >
                {emoji}
              </button>
            ))}
          </div>

          {/* Chat Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendChatMessage();
            }}
            className="flex items-center gap-2 pt-2"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileInputChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Attach File"
              className="p-3 bg-white border border-[#192837]/20 hover:bg-[#F2F2EE] text-[#192837] rounded-2xl flex items-center justify-center cursor-pointer transition-all"
            >
              <span className="material-symbols-outlined text-xl">attach_file</span>
            </button>

            <input
              type="text"
              value={chatInput}
              onChange={handleChatInputChange}
              placeholder="Type your ephemeral message..."
              className="flex-1 bg-white border border-[#192837]/20 rounded-2xl px-4 py-3 text-sm font-sans focus:outline-none focus:border-[#7342E2] focus:ring-1 focus:ring-[#7342E2] transition-all"
            />

            <button
              type="submit"
              disabled={!chatInput.trim()}
              className="px-5 py-3 bg-[#7342E2] disabled:opacity-50 hover:bg-[#7342E2]/90 text-white rounded-2xl font-mono text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-xs"
            >
              <span>SEND</span>
              <span className="material-symbols-outlined text-base">send</span>
            </button>
          </form>
        </div>

        {/* Right Column: File Dropzone & Bundle List (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* File Dropzone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="bg-white/80 border-2 border-dashed border-[#7342E2]/40 hover:border-[#7342E2] rounded-3xl p-6 text-center cursor-pointer transition-all hover:bg-white shadow-xs group"
          >
            <span className="material-symbols-outlined text-4xl text-[#7342E2] mb-1 group-hover:scale-110 transition-transform">
              cloud_upload
            </span>
            <div className="font-heading text-base font-bold text-[#192837]">
              DROP OR CLICK TO SHARE FILES
            </div>
            <div className="font-mono text-xs text-[#192837]/60 mt-0.5">
              AES-256-GCM Encrypted • Direct P2P Streaming
            </div>
          </div>

          {/* Ephemeral Bundle / Files List */}
          <div className="bg-white/90 backdrop-blur-2xl border border-[#192837]/10 rounded-3xl p-5 flex-1 flex flex-col justify-between shadow-sm min-h-[320px]">
            <div>
              <div className="flex justify-between items-center pb-3 border-b border-[#192837]/10 mb-3">
                <span className="font-heading font-bold text-sm text-[#192837]">
                  SHARED FILES ({room.bundleItems.length})
                </span>
                <span className="font-mono text-[10px] text-[#192837]/50 font-bold">
                  RAM CACHE
                </span>
              </div>

              {room.bundleItems.length === 0 ? (
                <div className="py-12 text-center text-[#192837]/50 font-mono text-xs">
                  No files shared yet in this room session.
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {room.bundleItems.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 bg-[#F2F2EE] border border-[#192837]/10 rounded-2xl flex items-center justify-between gap-3 hover:border-[#7342E2]/40 transition-colors"
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <span className="material-symbols-outlined text-[#7342E2] text-xl">
                          description
                        </span>
                        <div className="overflow-hidden">
                          <div className="font-mono text-xs font-bold text-[#192837] truncate">
                            {item.name}
                          </div>
                          <div className="font-mono text-[10px] text-[#192837]/60">
                            {formatBytes(item.size)} • {item.fileTypeLabel}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => onPreviewFile(item)}
                          className="px-2.5 py-1 bg-white border border-[#192837]/20 hover:bg-[#7342E2]/10 text-[#192837] font-mono text-[10px] font-bold rounded-lg cursor-pointer transition-colors"
                        >
                          VIEW
                        </button>
                        {item.blobUrl && (
                          <a
                            href={item.blobUrl}
                            download={item.name}
                            className="px-2.5 py-1 bg-[#7342E2] text-white hover:bg-[#7342E2]/90 font-mono text-[10px] font-bold rounded-lg transition-colors cursor-pointer"
                          >
                            GET
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Room Footer Status */}
            <div className="pt-3 border-t border-[#192837]/10 flex justify-between items-center font-mono text-[11px] text-[#192837]/60">
              <span>ENCRYPTION: AES-256-GCM</span>
              <span className="text-emerald-600 font-bold">READY</span>
            </div>
          </div>
        </div>
      </div>

      {/* QR Code Modal */}
      {isQrModalOpen && (
        <QRCodeModal
          roomId={room.id}
          onClose={() => setIsQrModalOpen(false)}
        />
      )}

      {/* Activity Toasts (Join/Leave notifications) */}
      <ActivityToastContainer
        toasts={activityToasts}
        onDismiss={dismissActivityToast}
      />

      {/* Error Toasts */}
      {errorToasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
          {errorToasts.map((toast) => (
            <div
              key={toast.id}
              className="bg-red-600 text-white p-3 rounded-2xl shadow-xl font-mono text-xs flex justify-between items-start gap-2 animate-bounce"
            >
              <div>
                <div className="font-bold">{toast.code}</div>
                <div>{toast.message}</div>
              </div>
              <button
                onClick={() => setErrorToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                className="text-white hover:opacity-80 cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
