import React from 'react';
import { RoomState } from '../types';
import { formatRoomOTPDisplay } from '../lib/p2pEngine';

interface NetworkTopologyScreenProps {
  room: RoomState;
}

export const NetworkTopologyScreen: React.FC<NetworkTopologyScreenProps> = ({ room }) => {
  const peers = room.activePeers;
  const you = peers.find((p) => p.isYou);
  const remotePeers = peers.filter((p) => !p.isYou);

  return (
    <div className="min-h-screen pt-24 pb-20 px-6 md:px-12 max-w-[1280px] mx-auto selection:bg-[#7342E2] selection:text-white relative overflow-hidden bg-[#F2F2EE]">
      <header className="relative z-10 mb-8 border-b border-[#192837]/10 pb-4">
        <span className="font-mono text-xs font-bold text-[#7342E2] block mb-1">
          // DECENTRALIZED TOPOLOGY
        </span>
        <h1 className="text-3xl md:text-4xl font-heading font-bold text-[#192837]">
          TRANSFER MAP // {formatRoomOTPDisplay(room.id)}
        </h1>
        <p className="font-sans text-sm text-[#192837]/70 mt-1">
          Real-time WebRTC data channels, encryption status, and peer routing matrix.
        </p>
      </header>

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Topology Visual Canvas */}
        <div className="lg:col-span-2 bg-white/80 backdrop-blur-2xl border border-[#192837]/10 rounded-3xl p-8 min-h-[400px] flex flex-col justify-between relative overflow-hidden shadow-xl text-[#192837]">
          <div className="flex justify-between items-center z-10">
            <span className="font-mono text-xs font-bold text-[#192837]">
              ACTIVE SIGNALING: REALTIME + WEBRTC
            </span>
            <span className="px-3 py-1 bg-[#7342E2]/15 border border-[#7342E2]/40 text-[#7342E2] font-mono text-xs rounded-full font-bold">
              0 SERVER STORAGE
            </span>
          </div>

          {/* Dynamic peer graph */}
          {peers.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-[#192837]/40 font-mono text-sm">
              No peers connected yet.
            </div>
          ) : (
            <div className="relative my-8 flex items-center justify-center gap-0 flex-wrap">
              {/* Host node */}
              {you && (
                <div className="flex flex-col items-center gap-2 z-10 mx-6">
                  <div className="w-16 h-16 bg-[#F2F2EE] rounded-2xl border-2 border-[#7342E2] flex items-center justify-center font-mono text-sm font-bold text-[#7342E2] shadow-md">
                    {you.name.slice(0, 5)}
                  </div>
                  <span className="font-mono text-xs text-[#192837] font-bold">YOU (HOST)</span>
                  <span className="font-mono text-[10px] text-[#7342E2] font-bold">AES-256-GCM</span>
                </div>
              )}

              {/* Connector lines + remote peers */}
              {remotePeers.map((peer, idx) => (
                <React.Fragment key={peer.id}>
                  <div className="flex items-center mx-2">
                    <div className="w-16 md:w-24 h-0.5 bg-gradient-to-r from-[#7342E2] via-purple-400 to-[#7342E2] relative animate-pulse">
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white backdrop-blur-md px-2 py-0.5 rounded-full border border-[#192837]/20 font-mono text-[10px] text-[#7342E2] font-bold shadow-md whitespace-nowrap">
                        {peer.latencyMs}ms
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-2 z-10 mx-6">
                    <div className="w-16 h-16 bg-[#F2F2EE] rounded-2xl border border-[#192837]/30 flex items-center justify-center font-mono text-sm font-bold text-[#192837] shadow-sm">
                      {peer.name.slice(0, 5)}
                    </div>
                    <span className="font-mono text-xs text-[#192837] font-bold">
                      EPH PEER {String.fromCharCode(65 + idx)}
                    </span>
                    <span className="font-mono text-[10px] text-[#7342E2] font-bold">AES-256-GCM</span>
                  </div>
                </React.Fragment>
              ))}

              {/* Show placeholder if only you are connected */}
              {remotePeers.length === 0 && you && (
                <div className="flex items-center mx-4 text-[#192837]/40 font-mono text-xs">
                  ← Waiting for peers to connect
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-3 gap-4 border-t border-[#192837]/10 pt-4 z-10 font-bold">
            <div>
              <div className="font-mono text-[10px] text-[#192837]/50">ENCRYPTION KEY</div>
              <div className="font-mono text-xs text-[#7342E2]">LOCAL WEB CRYPTO</div>
            </div>
            <div>
              <div className="font-mono text-[10px] text-[#192837]/50">STUN/TURN SERVER</div>
              <div className="font-mono text-xs text-[#192837]">DIRECT ICE HOST</div>
            </div>
            <div>
              <div className="font-mono text-[10px] text-[#192837]/50">DATA CHANNEL</div>
              <div className="font-mono text-xs text-emerald-600">
                {peers.length > 1 ? 'OPEN STABLE' : 'AWAITING PEER'}
              </div>
            </div>
          </div>
        </div>

        {/* Telemetry & Carbon Breakdown */}
        <div className="bg-white/80 backdrop-blur-2xl border border-[#192837]/10 rounded-3xl p-6 flex flex-col justify-between shadow-xl text-[#192837]">
          <div>
            <h3 className="font-mono text-xs font-bold text-[#7342E2] mb-4 uppercase tracking-wider">
              // CARBON FOOTPRINT SAVINGS
            </h3>

            <div className="space-y-4 mb-6">
              <div className="p-4 bg-[#F2F2EE] backdrop-blur-md border border-[#192837]/10 rounded-2xl shadow-sm">
                <span className="font-mono text-[11px] font-bold text-[#192837]/50 block mb-1">
                  P2P vs CLOUD SERVER COMPARISON
                </span>
                <div className="font-heading text-2xl font-bold text-emerald-600">
                  -91.6% CO2e EMISSIONS
                </div>
                <p className="font-sans text-xs text-[#192837]/70 mt-1 leading-relaxed">
                  Ephemeral browser-to-browser WebRTC transfers eliminate intermediate cloud file storage servers, drastically lowering carbon footprint per transfer.
                </p>
              </div>

              <div className="space-y-2 font-mono text-xs font-bold">
                <div className="flex justify-between p-2.5 bg-white border border-[#192837]/10 rounded-xl">
                  <span className="text-[#192837]/60">Cloud Server Baseline:</span>
                  <span className="text-red-600 font-bold">~0.060 g CO2e/MB</span>
                </div>
                <div className="flex justify-between p-2.5 bg-white border border-[#192837]/10 rounded-xl">
                  <span className="text-[#192837]/60">FLUX P2P Ephemeral:</span>
                  <span className="text-emerald-600 font-bold">~0.005 g CO2e/MB</span>
                </div>
              </div>
            </div>

            {/* Live peer count */}
            <div className="p-3 bg-[#7342E2]/10 border border-[#7342E2]/30 rounded-2xl">
              <span className="font-mono text-[11px] font-bold text-[#7342E2] block mb-1">
                LIVE PEERS IN THIS ROOM
              </span>
              <span className="font-heading text-2xl font-bold text-[#192837]">
                {peers.length} CONNECTED
              </span>
            </div>
          </div>

          <div className="pt-4 border-t border-[#192837]/10">
            <span className="font-mono text-[11px] font-bold text-[#192837]/50 block mb-1">
              PROTOCOL INTEGRITY
            </span>
            <span className="font-mono text-xs font-bold text-[#192837]">
              SHA-256 PARALLEL CHECKSUM // ACTIVE
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
