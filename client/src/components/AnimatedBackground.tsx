import { useEffect, useState } from 'react'
import { useSpring, animated } from '@react-spring/web'

interface FloatingShapeProps {
  delay: number
  size: string
  color: string
  position: { x: string, y: string }
  duration: number
}

function FloatingShape({ delay, size, color, position, duration }: FloatingShapeProps) {
  const animation = useSpring({
    from: { 
      transform: 'translateY(0px) rotateZ(0deg) scale(0.8)',
      opacity: 0.5 
    },
    to: async (next) => {
      while (true) {
        await next({ 
          transform: 'translateY(-18px) rotateZ(180deg) scale(1.08)',
          opacity: 0.75 
        })
        await next({ 
          transform: 'translateY(0px) rotateZ(360deg) scale(0.8)',
          opacity: 0.5 
        })
      }
    },
    config: { mass: 1, tension: 260, friction: 65 },
    delay: delay,
  })

  return (
    <animated.div
      style={{
        ...animation,
        position: 'absolute',
        left: position.x,
        top: position.y,
        width: size,
        height: size,
        borderRadius: '30% 70% 70% 30% / 30% 30% 70% 70%',
        background: `linear-gradient(135deg, ${color}60, ${color}25)`,
        backdropFilter: 'blur(10px)',
        border: `1px solid ${color}30`,
        boxShadow: `0 4px 20px ${color}20`,
      }}
    />
  )
}

function ParticleField() {
  const particles = Array.from({ length: 30 }, (_, i) => ({
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
    boxShadow: isHovered
      ? '0 28px 48px rgba(0,0,0,0.28), 0 0 0 1px rgba(99,102,241,0.2)'
      : '0 12px 32px rgba(0,0,0,0.16)',
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
          aria-hidden="true"
          className="relative bg-white dark:bg-slate-900 rounded-xl p-6 border border-indigo-100 dark:border-slate-700 overflow-hidden"
        >
          {/* Document Header with UK cues */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center mb-2.5 shadow-md shadow-indigo-500/20">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                </svg>
              </div>
              <p className="text-xs font-bold text-gray-900 dark:text-white leading-tight">Certificate of Sponsorship</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">AI forensic verification</p>
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

          {/* Form field mock-ups (decorative) */}
          <div className="space-y-2.5 mb-4" aria-hidden="true">
            <div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mb-0.5 font-semibold">Sponsor name</div>
              <div className="h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full w-full" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-xs text-gray-400 dark:text-gray-500 mb-0.5 font-semibold">CoS ref</div>
                <div className="h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full" />
              </div>
              <div>
                <div className="text-xs text-gray-400 dark:text-gray-500 mb-0.5 font-semibold">Issue date</div>
                <div className="h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full w-3/4" />
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mb-0.5 font-semibold">Worker name</div>
              <div className="h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full w-5/6" />
            </div>
            <div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mb-0.5 font-semibold">SOC code</div>
              <div className="h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full w-1/2" />
            </div>
          </div>

          {/* AI Analysis status bar */}
          <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/40 rounded-xl px-3 py-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs text-indigo-600 dark:text-indigo-300 font-bold">AI analysing…</span>
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
  const shapes = [
    { color: '#6366f1', size: '90px', position: { x: '8%', y: '15%' }, delay: 0, duration: 4200 },
    { color: '#8B5CF6', size: '65px', position: { x: '79%', y: '8%' }, delay: 900, duration: 3200 },
    { color: '#10B981', size: '80px', position: { x: '82%', y: '66%' }, delay: 2000, duration: 3800 },
    { color: '#F59E0B', size: '50px', position: { x: '12%', y: '76%' }, delay: 500, duration: 4600 },
    { color: '#ef4444', size: '70px', position: { x: '3%', y: '46%' }, delay: 1500, duration: 3400 },
  ]

  return (
    <div className="relative w-full h-full overflow-hidden bg-gradient-to-br from-indigo-50/60 via-purple-50/30 to-blue-100/50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      {shapes.map((shape, i) => (
        <FloatingShape key={i} {...shape} />
      ))}
      <ParticleField />
      <DocumentAnimation />
      <div className="absolute inset-0 bg-gradient-to-t from-white/5 via-transparent to-white/3 dark:from-slate-900/20 dark:to-slate-800/10 pointer-events-none" />
    </div>
  )
}