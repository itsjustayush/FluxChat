import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRightCircle,
  Zap,
  LockKeyhole,
  Fingerprint,
  Menu,
  X,
} from 'lucide-react';

export const Logo: React.FC<{ size?: number; className?: string }> = ({ size = 32, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 256 256"
    fill="#192837"
    className={className}
    style={{ minWidth: size, minHeight: size }}
  >
    <path d="M 64 128 L 64.5 128 L 32 95 L 0 64 L 0 0 L 64 0 L 128 64 L 128 64.5 L 161 32 L 192 0 L 256 0 L 256 64 L 192 128 L 128 128 L 128 192 L 96 223 L 63.5 256 L 0 256 L 0 192 Z M 256 192 L 224 223 L 191.5 256 L 128 256 L 128 192 L 192 128 L 256 128 Z" />
  </svg>
);

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.15,
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1],
    },
  }),
};

const navLinks = ['P2P Grid', 'Encryption', 'WebRTC', 'Topology', 'Logs'];

interface HeroSectionProps {
  onSignIn?: () => void;
  onStartForFree?: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onSignIn, onStartForFree }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="relative min-h-screen w-full overflow-hidden flex flex-col justify-between selection:bg-[#7342E2] selection:text-white">
      {/* Loop Background Video */}
      <video
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 z-0 w-full h-full object-cover"
      >
        <source
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260606_131516_eca35265-ea66-4fbd-8d52-22aae6e1a503.mp4"
          type="video/mp4"
        />
      </video>

      {/* Navbar */}
      <header className="relative z-10 w-full max-w-[1280px] mx-auto px-5 sm:px-8 py-4 sm:py-5 flex justify-between items-center">
        {/* Left: Logo */}
        <div className="flex items-center gap-3">
          <Logo size={32} />
        </div>

        {/* Center: Desktop Nav Links */}
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <a
              key={link}
              href={`#${link.toLowerCase()}`}
              className="text-sm font-medium transition-opacity hover:opacity-70"
              style={{ color: 'var(--color-text)' }}
            >
              {link}
            </a>
          ))}
        </nav>

        {/* Right: Desktop CTA Buttons */}
        <div className="hidden md:flex items-center gap-3">
          <button
            type="button"
            onClick={onStartForFree}
            className="text-sm font-semibold px-5 py-2.5 rounded-full text-white transition-all hover:shadow-lg active:scale-95 cursor-pointer"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            Start For Free
          </button>
          <button
            type="button"
            onClick={onSignIn}
            className="text-sm font-semibold px-5 py-2.5 rounded-full transition-all hover:shadow-md active:scale-95 cursor-pointer"
            style={{
              backgroundColor: 'var(--color-login-bg)',
              color: 'var(--color-text)',
            }}
          >
            Sign In
          </button>
        </div>

        {/* Mobile Hamburger Toggle Button */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 text-[#192837] hover:opacity-80 transition-opacity cursor-pointer z-50"
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </header>

      {/* Mobile Slide-in Sheet Navigation */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 z-40 bg-[#192837]/35 backdrop-blur-[4px]"
            />

            {/* Sheet */}
            <motion.div
              key="sheet"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{
                duration: 0.45,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="fixed top-0 right-0 z-50 flex flex-col justify-between p-6 shadow-2xl"
              style={{
                width: 'min(88vw, 360px)',
                height: '100dvh',
                backgroundColor: '#CFC8C5',
                boxShadow: '-12px 0 48px rgba(25,40,55,0.18)',
              }}
            >
              <div>
                {/* Mobile Header */}
                <div className="flex items-center justify-between pb-4">
                  <Logo size={32} />
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-colors"
                    style={{ backgroundColor: 'rgba(25,40,55,0.1)' }}
                    aria-label="Close menu"
                  >
                    <X size={20} color="#192837" />
                  </motion.button>
                </div>

                {/* Divider */}
                <div
                  className="h-[1px] my-4"
                  style={{ backgroundColor: 'rgba(25,40,55,0.12)' }}
                />

                {/* Nav links */}
                <div className="flex flex-col space-y-2 mt-4">
                  {navLinks.map((link, i) => (
                    <motion.a
                      key={link}
                      href={`#${link.toLowerCase()}`}
                      onClick={() => setMobileMenuOpen(false)}
                      initial={{ opacity: 0, x: 24 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        delay: 0.18 + i * 0.07,
                        duration: 0.4,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      className="px-4 py-3 rounded-xl font-medium text-[1.1rem] hover:bg-black/10 transition-colors"
                      style={{ color: 'var(--color-text)' }}
                    >
                      {link}
                    </motion.a>
                  ))}
                </div>
              </div>

              {/* Mobile CTA buttons */}
              <div className="flex flex-col gap-3 pt-6 pb-2">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    if (onStartForFree) onStartForFree();
                  }}
                  className="w-full py-3.5 rounded-full font-semibold text-[0.95rem] text-white shadow-lg active:scale-95 transition-all cursor-pointer"
                  style={{ backgroundColor: 'var(--color-accent)' }}
                >
                  Start For Free
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    if (onSignIn) onSignIn();
                  }}
                  className="w-full py-3.5 rounded-full font-semibold text-[0.95rem] active:scale-95 transition-all cursor-pointer"
                  style={{
                    backgroundColor: 'var(--color-login-bg)',
                    color: 'var(--color-text)',
                  }}
                >
                  Sign In
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Hero Content */}
      <main className="relative z-10 w-full max-w-[1280px] mx-auto px-5 sm:px-8 pt-[clamp(40px,8vw,72px)] pb-12 flex-1 flex flex-col justify-center items-center text-center">
        <div className="max-w-[660px] mx-auto flex flex-col items-center">
          {/* Heading */}
          <motion.h1
            custom={0}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="text-center"
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 'clamp(1.65rem, 5vw, 3rem)',
              lineHeight: 1.05,
              letterSpacing: '-0.01em',
              color: 'var(--color-text)',
            }}
          >
            <span className="whitespace-nowrap">
              Transfer
              <Zap
                size={24}
                style={{
                  color: '#192837',
                  display: 'inline',
                  verticalAlign: 'middle',
                  position: 'relative',
                  top: '-2px',
                  margin: '0 4px',
                }}
              />
              Files Direct
              <LockKeyhole
                size={24}
                style={{
                  color: '#192837',
                  display: 'inline',
                  verticalAlign: 'middle',
                  position: 'relative',
                  top: '-2px',
                  margin: '0 4px',
                }}
              />
              P2P
            </span>
            <br />
            <span>
              with Zero-Cloud Privacy
              <Fingerprint
                size={24}
                style={{
                  color: '#192837',
                  display: 'inline',
                  verticalAlign: 'middle',
                  position: 'relative',
                  top: '-2px',
                  marginLeft: '6px',
                }}
              />
            </span>
          </motion.h1>

          {/* Subtext */}
          <motion.p
            custom={1}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="mt-6 max-w-[560px] text-center"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'clamp(0.9rem, 2.5vw, 1.1rem)',
              color: 'var(--color-text)',
              opacity: 0.8,
              lineHeight: 1.65,
            }}
          >
            Zero cloud servers, total privacy. WebRTC direct peer-to-peer streaming, client-side AES-GCM encryption, and instant QR room sharing.
          </motion.p>

          {/* CTA Button */}
          <motion.div
            custom={2}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="mt-8"
          >
            <motion.button
              type="button"
              onClick={onStartForFree}
              whileHover={{ scale: 1.04, filter: 'brightness(1.1)' }}
              whileTap={{ scale: 0.96 }}
              className="flex items-center justify-between text-white font-medium cursor-pointer transition-all"
              style={{
                borderRadius: '50px',
                backgroundColor: 'var(--color-accent)',
                fontSize: 'clamp(0.9rem, 2vw, 1rem)',
                padding: '17px 24px',
                minWidth: '210px',
                gap: '32px',
                boxShadow: '0 4px 24px rgba(115,66,226,0.28)',
              }}
            >
              <span>Launch Ephemeral Grid</span>
              <ArrowRightCircle size={20} className="shrink-0" />
            </motion.button>
          </motion.div>
        </div>
      </main>

      {/* Bottom spacer / Footer hint */}
      <footer className="relative z-10 w-full py-6 text-center text-xs opacity-80 font-mono">
        Made by{' '}
        <a
          href="https://github.com/itsjustayush"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-[#7342E2] transition-colors font-semibold"
        >
          Ayush Bhattacharya
        </a>
      </footer>
    </div>
  );
};
