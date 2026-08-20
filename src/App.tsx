import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { ViewMode, UserSession, RoomState, BundleItem } from './types';
import { Navbar } from './components/Navbar';
import { DashboardScreen } from './components/DashboardScreen';
import { RoomView } from './components/RoomView';
import { FilePreviewModal } from './components/FilePreviewModal';
import { NetworkTopologyScreen } from './components/NetworkTopologyScreen';
import { HistoryScreen } from './components/HistoryScreen';
import { generateRoomOTP } from './lib/p2pEngine';
import { getOrCreateGuestSession, updateGuestNickname } from './lib/session';

const createInitialRoom = (session: UserSession, roomId = 'X-R92-K', hostId = session.id): RoomState => ({
  id: roomId,
  createdAt: Date.now(),
  hostId,
  activePeers: [{ id: session.id, name: session.identifier, isYou: true, status: 'ONLINE', latencyMs: 0, ip: 'P2P_DIRECT' }],
  bundleItems: [],
  messages: [],
  selectedTargetPeerId: 'ALL_BUNDLE',
});

export default function App() {
  const [session, setSession] = useState<UserSession>(() => getOrCreateGuestSession());
  const [currentView, setCurrentView] = useState<ViewMode>('DASHBOARD');
  const [latencyMs] = useState(12);
  const [room, setRoom] = useState<RoomState>(() => createInitialRoom(session));
  const [previewFile, setPreviewFile] = useState<BundleItem | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (!roomParam) return;
    const cleanRoom = roomParam.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    if (cleanRoom.length < 3) return;
    setRoom(createInitialRoom(session, cleanRoom, 'HOST_NODE'));
    setCurrentView('ROOM');
  }, [session]);

  const handleUpdateNickname = (newName: string) => {
    const updated = updateGuestNickname(newName);
    setSession(updated);
    setRoom((prev) => ({ ...prev, activePeers: prev.activePeers.map((peer) => peer.isYou ? { ...peer, name: updated.identifier } : peer) }));
  };

  const handleCreateRoom = () => {
    const newOtp = generateRoomOTP();
    setRoom({ ...createInitialRoom(session, newOtp), messages: [{ id: `sys-${Date.now()}`, senderId: 'SYSTEM', senderName: 'FLUX SYSTEM', text: `Private room ${newOtp} created. Content is kept in memory for this session.`, timestamp: Date.now(), type: 'system' }] });
    setCurrentView('ROOM');
  };

  const handleJoinRoom = (otpCode: string) => {
    const cleanOtp = otpCode.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 12);
    if (cleanOtp.length !== 6) return;
    setRoom({ ...createInitialRoom(session, cleanOtp, 'HOST_NODE'), messages: [{ id: `sys-${Date.now()}`, senderId: 'SYSTEM', senderName: 'FLUX SYSTEM', text: `Joined room ${cleanOtp}. Signaling is transient; room content is not archived.`, timestamp: Date.now(), type: 'system' }] });
    setCurrentView('ROOM');
  };

  const handleAddBundleItem = (item: BundleItem) => setRoom((prev) => ({ ...prev, bundleItems: [item, ...prev.bundleItems] }));

  const handleDownloadFile = (file: BundleItem) => {
    if (!file.blobUrl) return;
    const anchor = document.createElement('a');
    anchor.href = file.blobUrl;
    anchor.download = file.name;
    anchor.rel = 'noreferrer';
    anchor.click();
  };

  const handleWipeSession = () => {
    if (!window.confirm('Wipe this tab’s in-memory files and messages? This cannot be undone.')) return;
    setRoom((prev) => ({ ...prev, bundleItems: [], messages: [{ id: `sys-${Date.now()}`, senderId: 'SYSTEM', senderName: 'FLUX SYSTEM', text: 'Local session memory wiped.', timestamp: Date.now(), type: 'system' }] }));
  };

  return (
    <div className="app-shell">
      <div className="noise-overlay" aria-hidden="true" />
      <Navbar currentView={currentView} setView={setCurrentView} session={session} onUpdateNickname={handleUpdateNickname} latencyMs={latencyMs} />
      <main className="relative z-10 min-h-[calc(100vh-76px)]">
        {currentView === 'DASHBOARD' || currentView === 'AUTH' ? <DashboardScreen session={session} onCreateRoom={handleCreateRoom} onJoinRoom={handleJoinRoom} setView={setCurrentView} onUpdateNickname={handleUpdateNickname} /> : null}
        {currentView === 'ROOM' && <RoomView room={room} session={session} onLeaveRoom={() => setCurrentView('DASHBOARD')} onPreviewFile={setPreviewFile} onAddBundleItem={handleAddBundleItem} />}
        {currentView === 'NETWORK' && <NetworkTopologyScreen room={room} />}
        {currentView === 'HISTORY' && <HistoryScreen bundleItems={room.bundleItems} onWipeSession={handleWipeSession} />}
      </main>
      {previewFile && <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} onDownload={handleDownloadFile} />}
      <footer className="relative z-10 mx-auto flex w-full max-w-[1440px] items-center justify-between gap-4 border-t border-white/10 px-5 py-6 font-mono text-[10px] uppercase tracking-[.16em] text-white/35 sm:px-8 lg:px-12">
        <span>FluxChat / ephemeral collaboration</span>
        <span className="inline-flex items-center gap-2"><ShieldCheck size={13} className="text-[#d6ff62]" /> No room archive</span>
      </footer>
    </div>
  );
}
