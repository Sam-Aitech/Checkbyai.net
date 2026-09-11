import { useState } from 'react'
import { useSpring, animated } from '@react-spring/web'

/* Ambient language: one floating document (status metaphor) + a sparse static
   starfield. Rotating blurred shapes were removed — they duplicated the hero's
   static gradient blobs while costing a backdrop-filter per shape. */

function ParticleField() {
  const particles = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 3 + 1.5,
    duration: Math.random() * 3000 + 2000,
    useEmerald: i % 3 === 0,
  }))

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((particle) => (
        <div
          key={particle.id}
          className={`absolute rounded-full animate-pulse ${particle.useEmerald ? 'bg-emerald-400/25' : 'bg-indigo-400/20'}`}
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            width: `${particle.size}px`,
            height: `${particle.size}px`,
            animationDelay: `${Math.random() * 2}s`,
            animationDuration: `${particle.duration}ms`,
          }}
        />
      ))}
    </div>
  )
}

function DocumentAnimation() {
  const [isHovered, setIsHovered] = useState(false)
  
  const documentAnimation = useSpring({
    transform: isHovered
      ? 'translateY(-10px) rotateY(4deg) scale(1.04)'
      : 'translateY(0px) rotateY(0deg) scale(1)',
    config: { mass: 1, tension: 280, friction: 60 },
  })

  const floatingAnimation = useSpring({
    from: { transform: 'translateY(0px)' },
    to: async (next) => {
      while (true) {
        await next({ transform: 'translateY(-14px)' })
        await next({ transform: 'translateY(0px)' })
      }
    },
    config: { mass: 1, tension: 220, friction: 60 },
  })

  return (
    <div className="relative flex items-center justify-center h-full">
      <animated.div
        style={floatingAnimation}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="relative cursor-pointer"
      >
        <animated.div
          style={{ ...documentAnimation, width: '264px', height: '340px' }}
          className="relative bg-white dark:bg-slate-900 rounded-xl p-6 border border-indigo-100 dark:border-slate-700 overflow-hidden shadow-[0_12px_32px_rgba(0,0,0,0.16)]"
        >
          {/* Document Header with UK cues */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center mb-2.5 shadow-md shadow-indigo-500/20">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                </svg>
              </div>
              <h3 className="text-[11px] font-bold text-gray-900 dark:text-white leading-tight">Certificate of Sponsorship</h3>
              <p className="text-[9px] text-gray-400 dark:text-gray-500 mt-0.5 uppercase tracking-wide">AI Forensic Verification</p>
            </div>
            {/* UK flag mini */}
            <svg width="22" height="15" viewBox="0 0 22 15" className="opacity-75">
              <rect width="22" height="15" fill="#012169"/>
              <path d="M0 0L22 15M22 0L0 15" stroke="white" strokeWidth="3"/>
              <path d="M0 0L22 15M22 0L0 15" stroke="#C8102E" strokeWidth="1.5"/>
              <path d="M11 0V15M0 7.5H22" stroke="white" strokeWidth="4"/>
              <path d="M11 0V15M0 7.5H22" stroke="#C8102E" strokeWidth="2"/>
            </svg>
          </div>

          {/* Form field mock-ups */}
          <div className="space-y-2.5 mb-4">
            <div>
              <div className="text-[8px] text-gray-400 dark:text-gray-500 mb-0.5 uppercase tracking-wider font-semibold">Sponsor Name</div>
              <div className="h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full w-full" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[8px] text-gray-400 dark:text-gray-500 mb-0.5 uppercase tracking-wider font-semibold">CoS Ref</div>
                <div className="h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full" />
              </div>
              <div>
                <div className="text-[8px] text-gray-400 dark:text-gray-500 mb-0.5 uppercase tracking-wider font-semibold">Issue Date</div>
                <div className="h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full w-3/4" />
              </div>
            </div>
            <div>
              <div className="text-[8px] text-gray-400 dark:text-gray-500 mb-0.5 uppercase tracking-wider font-semibold">Worker Name</div>
              <div className="h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full w-5/6" />
            </div>
            <div>
              <div className="text-[8px] text-gray-400 dark:text-gray-500 mb-0.5 uppercase tracking-wider font-semibold">SOC Code</div>
              <div className="h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full w-1/2" />
            </div>
          </div>

          {/* AI Analysis status bar */}
          <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/40 rounded-lg px-3 py-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[9px] text-indigo-600 dark:text-indigo-300 font-bold tracking-widest uppercase">AI Analyzing…</span>
            </div>
            <div className="mt-1.5 w-full bg-indigo-100 dark:bg-indigo-900/50 rounded-full h-1">
              <div className="h-1 rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 w-4/5" style={{ animation: 'pulse 2s ease-in-out infinite' }} />
            </div>
          </div>

          {/* Verification stamp — bottom right */}
          <div className="absolute bottom-4 right-4">
            <div className="w-11 h-11 bg-emerald-50 dark:bg-emerald-950/40 rounded-full border-2 border-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/15">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" fill="rgba(16,185,129,0.12)" stroke="#10b981" strokeWidth="1.5"/>
                <polyline points="8,12 11,15 16,9" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>

          {/* AI Scan line overlay */}
          <div className="scan-line" />
        </animated.div>
      </animated.div>
    </div>
  )
}

export default function AnimatedBackground() {
  return (
    <div className="relative w-full h-full overflow-hidden bg-gradient-to-br from-indigo-50/60 via-purple-50/30 to-blue-100/50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <ParticleField />
      <DocumentAnimation />
      <div className="absolute inset-0 bg-gradient-to-t from-white/5 via-transparent to-white/3 dark:from-slate-900/20 dark:to-slate-800/10 pointer-events-none" />
    </div>
  )
}