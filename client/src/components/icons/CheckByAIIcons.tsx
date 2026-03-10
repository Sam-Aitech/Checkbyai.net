/**
 * CheckByAI.net — Premium Custom SVG Icon Library
 * Hand-crafted icons replacing generic Lucide icons.
 * Each icon is designed with human warmth, geometric precision, and brand alignment.
 */

import React from 'react';

interface IconProps {
  className?: string;
  size?: number;
}

// ─── Shield Monitor Icon ──────────────────────────────────────────────────────
// Shield with heartbeat/pulse line inside — real-time monitoring
export function ShieldMonitorIcon({ className = '', size = 24 }: IconProps) {
  const id = 'shield-grad';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#4338ca" />
        </linearGradient>
      </defs>
      {/* Shield body */}
      <path
        d="M12 2L4 5.5V11c0 4.55 3.4 8.74 8 9.93C16.6 19.74 20 15.55 20 11V5.5L12 2Z"
        fill={`url(#${id})`}
        opacity="0.15"
        stroke={`url(#${id})`}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Pulse / heartbeat line */}
      <polyline
        points="6.5,12 8.5,12 9.5,9.5 11,14.5 12.5,10 13.5,12 17.5,12"
        stroke="#818cf8"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Pulse dot */}
      <circle cx="6.5" cy="12" r="1" fill="#818cf8" />
      <circle cx="17.5" cy="12" r="1" fill="#818cf8" />
    </svg>
  );
}

// ─── Alert Bell Icon ──────────────────────────────────────────────────────────
// Elegant bell with lightning bolt in the notification badge
export function AlertBellIcon({ className = '', size = 24 }: IconProps) {
  const id = 'bell-grad';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
      </defs>
      {/* Bell body */}
      <path
        d="M5 14.5C5 11.46 7.46 9 10.5 9H13.5C16.54 9 19 11.46 19 14.5V18H5V14.5Z"
        fill={`url(#${id})`}
        opacity="0.15"
        stroke={`url(#${id})`}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Bell top stem */}
      <line x1="12" y1="3" x2="12" y2="9" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" />
      {/* Bell clapper base */}
      <path
        d="M9.5 18a2.5 2.5 0 0 0 5 0"
        stroke="#34d399"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* Badge dot with lightning bolt */}
      <circle cx="18.5" cy="6" r="4" fill="#059669" />
      <path
        d="M19.5 3.8L17.8 6.2H19L17.5 8.2"
        stroke="white"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

// ─── Document Verify Icon ─────────────────────────────────────────────────────
// Document with magnifying glass that has a checkmark lens
export function DocumentVerifyIcon({ className = '', size = 24 }: IconProps) {
  const id = 'doc-grad';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      {/* Document */}
      <path
        d="M6 2h8l4 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"
        fill={`url(#${id})`}
        opacity="0.12"
        stroke={`url(#${id})`}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Fold corner */}
      <polyline
        points="14,2 14,6 18,6"
        stroke="#a78bfa"
        strokeWidth="1.5"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Document lines */}
      <line x1="8" y1="10" x2="12" y2="10" stroke="#a78bfa" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="8" y1="13" x2="11" y2="13" stroke="#a78bfa" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
      {/* Magnifying glass */}
      <circle cx="15.5" cy="16" r="3.2" stroke="#c4b5fd" strokeWidth="1.5" fill="rgba(167,139,250,0.1)" />
      <line x1="17.7" y1="18.2" x2="20" y2="20.5" stroke="#c4b5fd" strokeWidth="1.8" strokeLinecap="round" />
      {/* Checkmark in lens */}
      <polyline
        points="13.8,16 15,17.2 17.2,14.8"
        stroke="#c4b5fd"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

// ─── Timeline Clock Icon ──────────────────────────────────────────────────────
// Clock face layered over a calendar — history tracking
export function TimelineClockIcon({ className = '', size = 24 }: IconProps) {
  const id = 'clock-grad';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ef4444" />
          <stop offset="100%" stopColor="#dc2626" />
        </linearGradient>
      </defs>
      {/* Calendar page (background) */}
      <rect
        x="3"
        y="5"
        width="12"
        height="11"
        rx="1.5"
        fill={`url(#${id})`}
        opacity="0.12"
        stroke={`url(#${id})`}
        strokeWidth="1.2"
      />
      <line x1="3" y1="8" x2="15" y2="8" stroke="#f87171" strokeWidth="1" opacity="0.5" />
      <line x1="7" y1="5" x2="7" y2="3" stroke="#f87171" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="11" y1="5" x2="11" y2="3" stroke="#f87171" strokeWidth="1.2" strokeLinecap="round" />
      {/* Clock circle (foreground) */}
      <circle
        cx="15.5"
        cy="15.5"
        r="5.5"
        fill="white"
        stroke={`url(#${id})`}
        strokeWidth="1.5"
        className="dark:fill-slate-900"
      />
      {/* Clock hands — midnight / 12 */}
      <line x1="15.5" y1="15.5" x2="15.5" y2="11.5" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="15.5" y1="15.5" x2="18.2" y2="15.5" stroke="#ef4444" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="15.5" cy="15.5" r="0.8" fill="#ef4444" />
    </svg>
  );
}

// ─── Early Warning Icon ───────────────────────────────────────────────────────
// Magnifying glass with a rising danger triangle + eye
export function EarlyWarningIcon({ className = '', size = 24 }: IconProps) {
  const id = 'warn-grad';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
      </defs>
      {/* Magnifying glass */}
      <circle
        cx="11"
        cy="11"
        r="7.5"
        fill={`url(#${id})`}
        opacity="0.1"
        stroke={`url(#${id})`}
        strokeWidth="1.5"
      />
      <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" />
      {/* Warning triangle inside lens */}
      <path
        d="M11 7L14.5 13.5H7.5L11 7Z"
        fill={`url(#${id})`}
        opacity="0.4"
        stroke="#fbbf24"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {/* Exclamation in triangle */}
      <line x1="11" y1="9.5" x2="11" y2="11.5" stroke="#fbbf24" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="11" cy="12.8" r="0.5" fill="#fbbf24" />
    </svg>
  );
}

// ─── Triple Channel Icon ──────────────────────────────────────────────────────
// Three stacked signal waves for Email + WhatsApp + SMS
export function TripleChannelIcon({ className = '', size = 24 }: IconProps) {
  const id = 'triple-grad';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#14b8a6" />
          <stop offset="100%" stopColor="#0891b2" />
        </linearGradient>
      </defs>
      {/* Center source dot */}
      <circle cx="5" cy="12" r="1.5" fill={`url(#${id})`} />
      {/* Wave 1 — innermost */}
      <path
        d="M8.5 9.5C9.8 10.5 9.8 13.5 8.5 14.5"
        stroke="#2dd4bf"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* Wave 2 — middle */}
      <path
        d="M11.5 7C13.6 8.6 13.6 15.4 11.5 17"
        stroke="#2dd4bf"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.75"
      />
      {/* Wave 3 — outermost */}
      <path
        d="M14.5 4.5C17.4 6.8 17.4 17.2 14.5 19.5"
        stroke="#2dd4bf"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.45"
      />
      {/* Channel labels — stylized dots for Email, WhatsApp, SMS */}
      <rect x="18" y="5.5" width="3.5" height="3" rx="0.8" fill={`url(#${id})`} opacity="0.7" />
      <rect x="18" y="10.5" width="3.5" height="3" rx="0.8" fill={`url(#${id})`} opacity="0.7" />
      <rect x="18" y="15.5" width="3.5" height="3" rx="0.8" fill={`url(#${id})`} opacity="0.7" />
    </svg>
  );
}

// ─── UK Lock Icon ─────────────────────────────────────────────────────────────
// Padlock with Union Jack pattern etched in — UK GDPR compliance
export function UKLockIcon({ className = '', size = 24 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Lock shackle */}
      <path
        d="M8 11V7a4 4 0 0 1 8 0v4"
        stroke="#94a3b8"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* Lock body */}
      <rect
        x="4.5"
        y="11"
        width="15"
        height="10"
        rx="2"
        fill="rgba(59,130,246,0.1)"
        stroke="#3b82f6"
        strokeWidth="1.5"
      />
      {/* Union Jack cross — horizontal + vertical */}
      <line x1="4.5" y1="16" x2="19.5" y2="16" stroke="#ef4444" strokeWidth="1" opacity="0.6" />
      <line x1="12" y1="11" x2="12" y2="21" stroke="#ef4444" strokeWidth="1" opacity="0.6" />
      {/* Union Jack diagonals */}
      <line x1="4.5" y1="11" x2="19.5" y2="21" stroke="#3b82f6" strokeWidth="0.7" opacity="0.4" />
      <line x1="19.5" y1="11" x2="4.5" y2="21" stroke="#3b82f6" strokeWidth="0.7" opacity="0.4" />
      {/* Keyhole */}
      <circle cx="12" cy="15.5" r="1.5" fill="#3b82f6" opacity="0.8" />
      <rect x="11.25" y="15.5" width="1.5" height="2.5" rx="0.5" fill="#3b82f6" opacity="0.8" />
    </svg>
  );
}

// ─── Verified Stamp Icon ──────────────────────────────────────────────────────
// Used in AnimatedBackground — AI verification stamp
export function VerifiedStampIcon({ className = '', size = 24 }: IconProps) {
  const id = 'stamp-grad';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="10" fill={`url(#${id})`} opacity="0.15" stroke={`url(#${id})`} strokeWidth="1.5" />
      <circle cx="12" cy="12" r="7" stroke="#34d399" strokeWidth="1" strokeDasharray="2 2" fill="none" />
      <polyline
        points="8,12 11,15 16,9"
        stroke="#10b981"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

// ─── Premium Credit Coin Icon ─────────────────────────────────────────────────
// Used in CreditCounter — replacing plain CreditCard icon
export function CreditCoinIcon({ className = '', size = 16 }: IconProps) {
  const id = 'coin-grad';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <circle cx="8" cy="8" r="7" fill={`url(#${id})`} opacity="0.2" stroke={`url(#${id})`} strokeWidth="1" />
      <circle cx="8" cy="8" r="4.5" stroke="#60a5fa" strokeWidth="0.8" fill="none" />
      <text
        x="8"
        y="11.2"
        textAnchor="middle"
        fontSize="7"
        fontWeight="700"
        fontFamily="Inter, system-ui"
        fill="#93c5fd"
      >₵</text>
    </svg>
  );
}

// ─── Hero Highlight Icons (Phase 7 Redesign) ───────────────────────────────────

// Vivid, glowing version of the Timeline Clock for the Hero section
export function HeroAlertIcon({ className = '', size = 20 }: IconProps) {
  const id = 'hero-alert-grad';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fca5a5" />
          <stop offset="100%" stopColor="#ef4444" />
        </linearGradient>
        <filter id="hero-alert-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      <circle cx="12" cy="12" r="10" fill="url(#hero-alert-grad)" opacity="0.2" filter="url(#hero-alert-glow)" />
      <rect x="5" y="6" width="14" height="12" rx="2" fill="url(#hero-alert-grad)" opacity="0.15" stroke="url(#hero-alert-grad)" strokeWidth="1.5" />
      <line x1="8" y1="4" x2="8" y2="7" stroke="#fca5a5" strokeWidth="2" strokeLinecap="round" />
      <line x1="16" y1="4" x2="16" y2="7" stroke="#fca5a5" strokeWidth="2" strokeLinecap="round" />
      <line x1="5" y1="10" x2="19" y2="10" stroke="#fca5a5" strokeWidth="1.5" opacity="0.7" />
      
      {/* Intense Glowing Clock overlay */}
      <circle cx="16" cy="16" r="6" fill="#1e1b4b" stroke="#f87171" strokeWidth="1.5" />
      <line x1="16" y1="16" x2="16" y2="13" stroke="#fca5a5" strokeWidth="2" strokeLinecap="round" />
      <line x1="16" y1="16" x2="18.5" y2="16" stroke="#fca5a5" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="16" cy="16" r="1" fill="#fee2e2" filter="url(#hero-alert-glow)"/>
    </svg>
  );
}

// Vivid, glowing version of the Tracked Sponsors map/shield logic
export function HeroTrackedIcon({ className = '', size = 20 }: IconProps) {
  const id = 'hero-track-grad';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#4f46e5" />
        </linearGradient>
        <filter id="hero-track-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      
      <circle cx="12" cy="12" r="10" fill="url(#hero-track-grad)" opacity="0.2" filter="url(#hero-track-glow)" />
      
      <path d="M12 3L4 6.5V11c0 5.5 3.5 10 8 11.5c4.5-1.5 8-6 8-11.5V6.5L12 3Z" fill="url(#hero-track-grad)" opacity="0.3" stroke="#818cf8" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 3L4 6.5V11c0 5.5 3.5 10 8 11.5c4.5-1.5 8-6 8-11.5V6.5L12 3Z" stroke="#818cf8" strokeWidth="0.5" strokeLinejoin="round" filter="url(#hero-track-glow)" opacity="0.5" />

      {/* Intense Glowing Pulse Line */}
      <polyline points="6,12 8,12 9.5,8.5 11.5,15.5 13,10.5 14.5,12 18,12" stroke="#c7d2fe" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" filter="url(#hero-track-glow)"/>
      <circle cx="6" cy="12" r="1.5" fill="#e0e7ff" />
      <circle cx="18" cy="12" r="1.5" fill="#e0e7ff" />
    </svg>
  );
}

// Vivid, glowing version of the UK GDPR Lock
export function HeroGDPRLockIcon({ className = '', size = 20 }: IconProps) {
  const id = 'hero-gdpr-grad';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
        <filter id="hero-gdpr-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      
      <circle cx="12" cy="12" r="10" fill="url(#hero-gdpr-grad)" opacity="0.15" filter="url(#hero-gdpr-glow)" />
      
      {/* Heavy Lock body with inner glow reflection */}
      <rect x="5.5" y="11" width="13" height="10" rx="3" fill="url(#hero-gdpr-grad)" stroke="#60a5fa" strokeWidth="1.5" opacity="0.8" />
      <rect x="6.5" y="12" width="11" height="8" rx="2" fill="none" stroke="#93c5fd" strokeWidth="0.5" opacity="0.5" />
      
      {/* Shackle */}
      <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="#bfdbfe" strokeWidth="2.5" strokeLinecap="round" fill="none" filter="url(#hero-gdpr-glow)"/>
      
      {/* Glowing Keyhole */}
      <circle cx="12" cy="15" r="1.8" fill="#eff6ff" filter="url(#hero-gdpr-glow)" />
      <rect x="11.2" y="15" width="1.6" height="3" rx="0.5" fill="#eff6ff" filter="url(#hero-gdpr-glow)" />
      
      {/* Red cross detail (UK cue) */}
      <line x1="5.5" y1="16" x2="8" y2="16" stroke="#f87171" strokeWidth="1.5" opacity="0.9" strokeLinecap="round" />
      <line x1="16" y1="16" x2="18.5" y2="16" stroke="#f87171" strokeWidth="1.5" opacity="0.9" strokeLinecap="round" />
    </svg>
  );
}
