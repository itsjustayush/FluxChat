import React, { useState, useEffect } from 'react';
import { ViewMode, UserSession, RoomState, BundleItem } from './types';
import { Navbar } from './components/Navbar';
import { DashboardScreen } from './components/DashboardScreen';
import { RoomView } from './components/RoomView';
import { FilePreviewModal } from './components/FilePreviewModal';
import { NetworkTopologyScreen } from './components/NetworkTopologyScreen';
import { HistoryScreen } from './components/HistoryScreen';
import { generateRoomOTP } from './lib/p2pEngine';
import { getOrCreateGuestSession, updateGuestNickname } from './lib/session';

export default function App() {
  const [session, setSession] = useState<UserSession>(() => getOrCreateGuestSession());
  const [currentView, setCurrentView] = useState<ViewMode>('DASHBOARD');
  const [latencyMs, setLatencyMs] = useState(12);

  // Active Room State
  const [room, setRoom] = useState<RoomState>({
    id: 'X-R92-K',
    createdAt: Date.now(),
    hostId: session.id,
    activePeers: [
      { id: session.id, name: session.identifier, isYou: true, status: 'ONLINE', latencyMs: 0, ip: '127.0.0.1' },
    ],
    bundleItems: [],
    messages: [],
    selectedTargetPeerId: 'ALL_BUNDLE',
  });

  // Modal State
  const [previewFile, setPreviewFile] = useState<BundleItem | null>(null);

  // Check URL deep-links on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');

    if (roomParam) {
      const cleanRoom = roomParam.toUpperCase().replace(/[^A-Z0-9]/g, '');
      setRoom((prev) => ({
        ...prev,
        id: cleanRoom,
        hostId: 'HOST_NODE',
        activePeers: [
          { id: session.id, name: session.identifier, isYou: true, status: 'ONLINE', latencyMs: 0, ip: '127.0.0.1' },
        ],
      }));
      setCurrentView('ROOM');
    }
  }, [session.id, session.identifier]);

  const handleUpdateNickname = (newName: string) => {
    const updated = updateGuestNickname(newName);
    setSession(updated);
    // Update local peer name in room state
    setRoom((prev) => ({
      ...prev,
      activePeers: prev.activePeers.map((p) => (p.isYou ? { ...p, name: updated.identifier } : p)),
    }));
  };

  const handleCreateRoom = () => {
    const newOtp = generateRoomOTP();
    setRoom({
      id: newOtp,
      createdAt: Date.now(),
      hostId: session.id,
      activePeers: [
        { id: session.id, name: session.identifier, isYou: true, status: 'ONLINE', latencyMs: 0, ip: '127.0.0.1' },
      ],
      bundleItems: [],
      messages: [
        {
          id: `sys-${Date.now()}`,
          senderId: 'SYSTEM',
          senderName: 'FLUX SYSTEM',
          text: `Ephemeral encrypted chat room ${newOtp} created. Sharing is zero-cloud and strictly peer-to-peer.`,
          timestamp: Date.now(),
          type: 'system',
        },
      ],
      selectedTargetPeerId: 'ALL_BUNDLE',
    });
    setCurrentView('ROOM');
  };

  const handleJoinRoom = (otpCode: string) => {
    const cleanOtp = otpCode.replace(/-/g, '').toUpperCase();
    setRoom({
      id: cleanOtp,
      createdAt: Date.now(),
      hostId: 'HOST_NODE',
      activePeers: [
        { id: session.id, name: session.identifier, isYou: true, status: 'ONLINE', latencyMs: 0, ip: '127.0.0.1' },
      ],
      bundleItems: [],
      messages: [
        {
          id: `sys-${Date.now()}`,
          senderId: 'SYSTEM',
          senderName: 'FLUX SYSTEM',
          text: `Joined ephemeral room ${cleanOtp}. All text messages and file transfers are peer-to-peer and zero-storage.`,
          timestamp: Date.now(),
          type: 'system',
        },
      ],
      selectedTargetPeerId: 'ALL_BUNDLE',
    });
    setCurrentView('ROOM');
  };

  const handleAddBundleItem = (item: BundleItem) => {
    setRoom((prev) => ({
      ...prev,
      bundleItems: [item, ...prev.bundleItems],
    }));
  };

  const handleDownloadFile = (file: BundleItem) => {
    if (!file.blobUrl) return;
    const a = document.createElement('a');
    a.href = file.blobUrl;
    a.download = file.name;
    a.click();
  };

  const handleWipeSession = () => {
    if (window.confirm('Clear all ephemeral chat messages and RAM files for this session?')) {
      setRoom((prev) => ({
        ...prev,
        bundleItems: [],
        messages: [
          {
            id: `sys-${Date.now()}`,
            senderId: 'SYSTEM',
            senderName: 'FLUX SYSTEM',
            text: 'Ephemeral session cache wiped successfully.',
            timestamp: Date.now(),
            type: 'system',
          },
        ],
      }));
    }
  };

  return (
    <div className="bg-[#F2F2EE] text-[#192837] min-h-screen font-sans selection:bg-[#7342E2] selection:text-white relative overflow-x-hidden flex flex-col">
      {/* Top Navbar */}
      <Navbar
        currentView={currentView}
        setView={setCurrentView}
        session={session}
        onUpdateNickname={handleUpdateNickname}
        latencyMs={latencyMs}
      />

      {/* Main Views */}
      <main className="flex-1">
        {currentView === 'DASHBOARD' || currentView === 'AUTH' ? (
          <DashboardScreen
            session={session}
            onCreateRoom={handleCreateRoom}
            onJoinRoom={handleJoinRoom}
            setView={setCurrentView}
            onUpdateNickname={handleUpdateNickname}
          />
        ) : null}

        {currentView === 'ROOM' && (
          <RoomView
            room={room}
            session={session}
            onLeaveRoom={() => setCurrentView('DASHBOARD')}
            onPreviewFile={(file) => setPreviewFile(file)}
            onAddBundleItem={handleAddBundleItem}
          />
        )}

        {currentView === 'NETWORK' && <NetworkTopologyScreen room={room} />}

        {currentView === 'HISTORY' && (
          <HistoryScreen
            bundleItems={room.bundleItems}
            onWipeSession={handleWipeSession}
          />
        )}
      </main>

      {/* File Preview Modal */}
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          onDownload={handleDownloadFile}
        />
      )}

      {/* Footer */}
      <footer className="w-full py-6 text-center text-xs text-[#192837]/70 font-mono border-t border-[#192837]/10 mt-auto bg-white/40">
        FLUX Chat • Guest-Only Ephemeral P2P Messaging & File Share • Zero Storage
      </footer>
    </div>
  );
}
