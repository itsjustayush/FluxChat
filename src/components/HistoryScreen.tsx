import React from 'react';
import { BundleItem } from '../types';
import { formatBytes } from '../lib/crypto';

interface HistoryScreenProps {
  bundleItems: BundleItem[];
  onWipeSession: () => void;
}

export const HistoryScreen: React.FC<HistoryScreenProps> = ({ bundleItems, onWipeSession }) => {
  const totalBytes = bundleItems.reduce((acc, curr) => acc + curr.size, 0);
  const totalCarbonGrams = bundleItems.reduce((acc, curr) => acc + curr.carbonFootprintGrams, 0);
  const savedCloudCarbonGrams = parseFloat((totalBytes / (1024 * 1024) * 0.055).toFixed(2));

  return (
    <div className="min-h-screen pt-24 pb-20 px-6 md:px-12 max-w-[1280px] mx-auto selection:bg-[#7342E2] selection:text-white relative overflow-hidden bg-[#F2F2EE]">
      <header className="relative z-10 mb-8 border-b border-[#192837]/10 pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <span className="font-mono text-xs font-bold text-[#7342E2] block mb-1">
            // EPHEMERAL SESSION LOGS
          </span>
          <h1 className="text-3xl md:text-4xl font-heading font-bold text-[#192837]">
            TRANSFERRED ASSETS CACHE
          </h1>
        </div>

        <button
          onClick={onWipeSession}
          className="border border-red-500/50 text-red-600 bg-red-500/10 hover:bg-red-500/20 px-5 py-2.5 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer flex items-center gap-2 shadow-sm"
        >
          <span className="material-symbols-outlined text-lg">delete_forever</span>
          WIPE EPHEMERAL RAM
        </button>
      </header>

      {/* Overview Cards */}
      <div className="relative z-10 grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
        <div className="bg-white/80 backdrop-blur-2xl border border-[#192837]/10 rounded-3xl p-6 shadow-xl">
          <span className="font-mono text-[11px] font-bold text-[#192837]/50 block mb-1">
            TOTAL ASSETS HELD
          </span>
          <span className="font-heading text-3xl font-bold text-[#192837]">
            {bundleItems.length} FILES
          </span>
        </div>

        <div className="bg-white/80 backdrop-blur-2xl border border-[#192837]/10 rounded-3xl p-6 shadow-xl">
          <span className="font-mono text-[11px] font-bold text-[#192837]/50 block mb-1">
            TOTAL EPHEMERAL DATA
          </span>
          <span className="font-heading text-3xl font-bold text-[#7342E2]">
            {formatBytes(totalBytes)}
          </span>
        </div>

        <div className="bg-white/80 backdrop-blur-2xl border border-[#192837]/10 rounded-3xl p-6 shadow-xl">
          <span className="font-mono text-[11px] font-bold text-[#192837]/50 block mb-1">
            ESTIMATED CARBON SAVINGS
          </span>
          <span className="font-heading text-3xl font-bold text-emerald-600">
            {savedCloudCarbonGrams}g CO2e
          </span>
        </div>
      </div>

      {/* Asset Table */}
      <div className="relative z-10 bg-white/80 backdrop-blur-2xl border border-[#192837]/10 rounded-3xl overflow-hidden shadow-xl text-[#192837]">
        <div className="p-4 bg-[#192837]/5 border-b border-[#192837]/10 flex justify-between items-center">
          <span className="font-mono text-xs font-bold text-[#192837]">SESSION PAYLOAD REGISTRY</span>
          <span className="font-mono text-[11px] font-bold text-[#7342E2]">NON-PERSISTENT (RAM ONLY)</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead className="border-b border-[#192837]/10 bg-[#192837]/5 text-[#192837]/60">
              <tr>
                <th className="p-3.5 font-bold">FILE NAME</th>
                <th className="p-3.5 font-bold">FILE ID</th>
                <th className="p-3.5 font-bold">SIZE</th>
                <th className="p-3.5 font-bold">ENCRYPTION</th>
                <th className="p-3.5 font-bold">CARBON</th>
                <th className="p-3.5 font-bold">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#192837]/10 text-[#192837]">
              {bundleItems.map((item) => (
                <tr key={item.id} className="hover:bg-[#192837]/5 transition-colors">
                  <td className="p-3.5 font-bold truncate max-w-[200px]">{item.name}</td>
                  <td className="p-3.5 text-[#7342E2] font-bold">{item.fileId}</td>
                  <td className="p-3.5 font-bold">{formatBytes(item.size)}</td>
                  <td className="p-3.5 text-emerald-600 font-bold">{item.encryptionStatus}</td>
                  <td className="p-3.5 font-bold">{item.carbonFootprintGrams}g CO2e</td>
                  <td className="p-3.5">
                    <button
                      onClick={() => {
                        const a = document.createElement('a');
                        a.href = item.blobUrl || '#';
                        a.download = item.name;
                        a.click();
                      }}
                      className="text-[#7342E2] hover:underline cursor-pointer font-bold"
                    >
                      DOWNLOAD
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
