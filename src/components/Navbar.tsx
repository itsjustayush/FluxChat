import React, { useState } from 'react';
import { ViewMode, UserSession } from '../types';

interface NavbarProps {
  currentView: ViewMode;
  setView: (view: ViewMode) => void;
  session: UserSession;
  onUpdateNickname: (newName: string) => void;
  latencyMs: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  setView,
  session,
  onUpdateNickname,
  latencyMs,
}) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(session.identifier);

  const handleSaveName = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (nameInput.trim()) {
      onUpdateNickname(nameInput.trim());
    }
    setIsEditingName(false);
  };

  return (
    <header className="fixed top-0 left-0 w-full z-50 bg-white/90 backdrop-blur-xl border-b border-[#192837]/10 shadow-xs transition-all">
      <div className="flex justify-between items-center w-full px-4 sm:px-8 py-3 max-w-[1280px] mx-auto">
        {/* Left: Brand logo */}
        <div className="flex items-center gap-6 sm:gap-8">
          <button
            onClick={() => setView('DASHBOARD')}
            className="text-xl font-bold font-heading text-[#192837] tracking-tighter hover:opacity-90 transition-opacity flex items-center gap-2 cursor-pointer"
          >
            <div className="w-3 h-3 bg-[#7342E2] rounded-full shadow-[0_0_12px_#7342E2] animate-pulse"></div>
            <span>FLUX<span className="text-[#7342E2]">.CHAT</span></span>
            <span className="hidden sm:inline-block font-mono text-[10px] bg-[#7342E2]/10 text-[#7342E2] px-2 py-0.5 rounded-full font-semibold border border-[#7342E2]/20">
              GUEST MODE
            </span>
          </button>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1.5">
            <button
              onClick={() => setView('DASHBOARD')}
              className={`font-mono text-xs font-bold uppercase transition-all px-3 py-1.5 rounded-lg cursor-pointer flex items-center gap-1.5 ${
                currentView === 'DASHBOARD'
                  ? 'text-[#7342E2] bg-[#7342E2]/10 border border-[#7342E2]/30'
                  : 'text-[#192837]/70 hover:text-[#192837] hover:bg-[#192837]/5'
              }`}
            >
              <span className="material-symbols-outlined text-base">forum</span>
              ROOMS
            </button>

            <button
              onClick={() => setView('ROOM')}
              className={`font-mono text-xs font-bold uppercase transition-all px-3 py-1.5 rounded-lg cursor-pointer flex items-center gap-1.5 ${
                currentView === 'ROOM'
                  ? 'text-[#7342E2] bg-[#7342E2]/10 border border-[#7342E2]/30'
                  : 'text-[#192837]/70 hover:text-[#192837] hover:bg-[#192837]/5'
              }`}
            >
              <span className="material-symbols-outlined text-base">chat</span>
              ACTIVE CHAT
            </button>

            <button
              onClick={() => setView('NETWORK')}
              className={`font-mono text-xs font-bold uppercase transition-all px-3 py-1.5 rounded-lg cursor-pointer flex items-center gap-1.5 ${
                currentView === 'NETWORK'
                  ? 'text-[#7342E2] bg-[#7342E2]/10 border border-[#7342E2]/30'
                  : 'text-[#192837]/70 hover:text-[#192837] hover:bg-[#192837]/5'
              }`}
            >
              <span className="material-symbols-outlined text-base">hub</span>
              TOPOLOGY
            </button>

            <button
              onClick={() => setView('HISTORY')}
              className={`font-mono text-xs font-bold uppercase transition-all px-3 py-1.5 rounded-lg cursor-pointer flex items-center gap-1.5 ${
                currentView === 'HISTORY'
                  ? 'text-[#7342E2] bg-[#7342E2]/10 border border-[#7342E2]/30'
                  : 'text-[#192837]/70 hover:text-[#192837] hover:bg-[#192837]/5'
              }`}
            >
              <span className="material-symbols-outlined text-base">folder_delete</span>
              EPHEMERAL RAM
            </button>
          </nav>
        </div>

        {/* Right: Guest Badge & Nickname editor */}
        <div className="flex items-center gap-3">
          <div className="relative">
            {isEditingName ? (
              <form onSubmit={handleSaveName} className="flex items-center gap-2">
                <input
                  type="text"
                  autoFocus
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="px-2.5 py-1 text-xs font-mono font-bold bg-white border border-[#7342E2] rounded-lg focus:outline-none text-[#192837]"
                  maxLength={18}
                />
                <button
                  type="submit"
                  className="px-2.5 py-1 bg-[#7342E2] text-white text-xs font-mono font-bold rounded-lg cursor-pointer hover:bg-[#7342E2]/90"
                >
                  Save
                </button>
              </form>
            ) : (
              <button
                onClick={() => {
                  setNameInput(session.identifier);
                  setIsEditingName(true);
                }}
                className="group flex items-center gap-2 px-3 py-1.5 bg-white/80 border border-[#192837]/15 hover:border-[#7342E2]/50 rounded-full transition-all cursor-pointer shadow-2xs"
                title="Click to edit guest nickname"
              >
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                <span className="font-mono text-xs font-bold text-[#192837] group-hover:text-[#7342E2] transition-colors">
                  {session.identifier}
                </span>
                <span className="material-symbols-outlined text-sm text-[#192837]/40 group-hover:text-[#7342E2]">
                  edit
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
