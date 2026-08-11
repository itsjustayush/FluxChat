import React, { useState, useRef } from 'react';
import { ViewMode, UserSession } from '../types';

interface DashboardScreenProps {
  session: UserSession;
  onCreateRoom: () => void;
  onJoinRoom: (otpCode: string) => void;
  setView: (view: ViewMode) => void;
  onUpdateNickname?: (newName: string) => void;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  session,
  onCreateRoom,
  onJoinRoom,
  setView,
  onUpdateNickname,
}) => {
  const [otpValues, setOtpValues] = useState<string[]>(['', '', '', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [editingNick, setEditingNick] = useState(false);
  const [nickVal, setNickVal] = useState(session.identifier);

  const handleOtpChange = (index: number, value: string) => {
    const val = value.toUpperCase();
    if (val.length > 1) {
      // If user pasted e.g. "XR92K8"
      const pasted = val.slice(0, 6).split('');
      const newOtp = [...otpValues];
      pasted.forEach((char, i) => {
        if (i < 6) newOtp[i] = char;
      });
      setOtpValues(newOtp);
      const nextIndex = Math.min(pasted.length, 5);
      inputRefs.current[nextIndex]?.focus();
      return;
    }

    const newOtp = [...otpValues];
    newOtp[index] = val;
    setOtpValues(newOtp);

    if (val && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpValues[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyJoin = () => {
    const code = otpValues.join('').replace(/-/g, '').trim();
    if (code.length === 6) {
      onJoinRoom(code);
    } else {
      alert('Please enter the full 6-character room code.');
    }
  };

  const handleSaveNick = (e: React.FormEvent) => {
    e.preventDefault();
    if (nickVal.trim() && onUpdateNickname) {
      onUpdateNickname(nickVal.trim());
    }
    setEditingNick(false);
  };

  return (
    <div className="min-h-screen flex flex-col pt-20 pb-20 px-4 md:px-12 selection:bg-[#7342E2] selection:text-white relative overflow-hidden bg-[#F2F2EE]">
      {/* Hero Welcome Banner */}
      <div className="w-full max-w-[1280px] mx-auto mt-4 mb-6">
        <div className="bg-white/80 backdrop-blur-xl border border-[#192837]/10 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shadow-xs">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-block w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></span>
              <span className="font-mono text-xs font-bold text-[#7342E2] uppercase tracking-wider">
                GUEST SESSION ACTIVE
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-heading font-bold text-[#192837] tracking-tight">
              Welcome to UltronChat
            </h1>
            <p className="font-sans text-sm text-[#192837]/80 mt-1 max-w-xl">
              Zero login, zero database history, 100% ephemeral P2P text messaging and direct file transfers.
            </p>
          </div>

          <div className="flex items-center gap-3 bg-[#7342E2]/5 border border-[#7342E2]/20 p-3.5 rounded-2xl w-full md:w-auto">
            <span className="material-symbols-outlined text-[#7342E2] text-2xl">account_circle</span>
            <div className="flex-1">
              <div className="font-mono text-[10px] text-[#192837]/60 font-bold uppercase">YOUR GUEST IDENTITY</div>
              {editingNick ? (
                <form onSubmit={handleSaveNick} className="flex items-center gap-2 mt-0.5">
                  <input
                    type="text"
                    value={nickVal}
                    onChange={(e) => setNickVal(e.target.value)}
                    className="font-mono text-xs font-bold bg-white border border-[#7342E2] rounded-md px-2 py-0.5 focus:outline-none"
                    maxLength={20}
                  />
                  <button type="submit" className="text-xs bg-[#7342E2] text-white px-2 py-0.5 rounded font-mono font-bold">
                    Save
                  </button>
                </form>
              ) : (
                <div className="font-mono text-xs font-bold text-[#192837] flex items-center gap-2">
                  <span>{session.identifier}</span>
                  <button
                    onClick={() => {
                      setNickVal(session.identifier);
                      setEditingNick(true);
                    }}
                    className="text-[#7342E2] hover:underline text-[11px] cursor-pointer"
                  >
                    (change)
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Action Panels */}
      <main className="flex-grow flex items-center justify-center py-2 relative z-10">
        <div className="w-full max-w-[1280px] grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          {/* Left Panel: CREATE CHAT ROOM */}
          <div className="bg-white/80 backdrop-blur-2xl border border-[#192837]/10 rounded-3xl p-8 md:p-10 flex flex-col justify-between min-h-[380px] transition-all duration-300 hover:border-[#7342E2]/50 hover:shadow-xl group shadow-sm">
            <div>
              <span className="font-mono text-xs font-bold text-[#7342E2] mb-3 block tracking-widest uppercase">
                INSTANT SESSION
              </span>
              <h2 className="text-2xl md:text-4xl font-heading font-bold text-[#192837] mb-4">
                CREATE CHAT ROOM
              </h2>
              <p className="font-sans text-sm text-[#192837]/80 max-w-md mb-6 leading-relaxed">
                Initialize a new ephemeral chat room. Invite peers using a 6-character code or shareable link. All messages live exclusively in browser RAM.
              </p>
              
              <div className="space-y-2 mb-8 font-mono text-xs text-[#192837]/70">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-emerald-600 text-base">check_circle</span>
                  <span>Real-time instant text messaging</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-emerald-600 text-base">check_circle</span>
                  <span>AES-256-GCM peer-to-peer file sharing</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-emerald-600 text-base">check_circle</span>
                  <span>Zero server database logs or tracking</span>
                </div>
              </div>
            </div>

            <button
              onClick={onCreateRoom}
              className="font-mono text-xs font-bold py-4 px-8 rounded-full w-full md:w-auto tracking-widest hover:scale-[1.02] active:scale-95 cursor-pointer flex items-center justify-center gap-2 text-white bg-[#7342E2] hover:bg-[#7342E2]/90 shadow-md transition-all"
            >
              <span className="material-symbols-outlined text-lg">add_comment</span>
              CREATE EPHEMERAL CHAT
            </button>
          </div>

          {/* Right Panel: JOIN CHAT ROOM */}
          <div className="bg-white/80 backdrop-blur-2xl border border-[#192837]/10 rounded-3xl p-8 md:p-10 flex flex-col justify-between min-h-[380px] transition-all duration-300 hover:border-[#7342E2]/50 hover:shadow-xl group shadow-sm">
            <div>
              <span className="font-mono text-xs font-bold text-[#7342E2] mb-3 block tracking-widest uppercase">
                JOIN EXISTING ROOM
              </span>
              <h2 className="text-2xl md:text-4xl font-heading font-bold text-[#192837] mb-4">
                JOIN WITH ROOM CODE
              </h2>
              <p className="font-sans text-sm text-[#192837]/80 max-w-md mb-6 leading-relaxed">
                Enter the 6-character room code shared by the host to connect instantly as a guest peer.
              </p>

              {/* OTP Input Group */}
              <div className="flex gap-2 sm:gap-3 mb-8 w-full justify-between sm:justify-start">
                {otpValues.map((val, idx) => (
                  <input
                    key={idx}
                    ref={(el) => (inputRefs.current[idx] = el)}
                    type="text"
                    maxLength={1}
                    value={val}
                    onChange={(e) => handleOtpChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    placeholder="•"
                    className="w-10 h-14 sm:w-12 sm:h-16 bg-white border border-[#192837]/20 rounded-2xl text-center font-mono text-xl text-[#7342E2] focus:border-[#7342E2] focus:bg-[#7342E2]/10 focus:shadow-[0_0_15px_rgba(115,66,226,0.2)] transition-all focus:outline-none font-bold"
                  />
                ))}
              </div>
            </div>

            <button
              onClick={handleVerifyJoin}
              className="bg-white border border-[#192837]/20 text-[#192837] hover:bg-[#F2F2EE] hover:border-[#7342E2]/50 rounded-full font-mono text-xs font-bold py-4 px-8 w-full md:w-auto tracking-widest transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 shadow-xs"
            >
              <span className="material-symbols-outlined text-lg">meeting_room</span>
              ENTER CHAT ROOM
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};
