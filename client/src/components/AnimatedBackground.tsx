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
      opacity: 0.6 
    },
    to: async (next) => {
      while (true) {
        await next({ 
          transform: 'translateY(-20px) rotateZ(180deg) scale(1.1)',
          opacity: 0.8 
        })
        await next({ 
          transform: 'translateY(0px) rotateZ(360deg) scale(0.8)',
          opacity: 0.6 
        })
      }
    },
    config: { mass: 1, tension: 280, friction: 60 },
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
        borderRadius: '50%',
        background: `linear-gradient(135deg, ${color}, ${color}88)`,
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: `0 4px 15px ${color}33`,
      }}
    />
  )
}

function ParticleField() {
  const particles = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 4 + 2,
    duration: Math.random() * 3000 + 2000,
  }))

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((particle) => (
        <div
          key={particle.id}
          className="absolute w-1 h-1 bg-blue-400/30 rounded-full animate-pulse"
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
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
      ? 'translateY(-10px) rotateY(5deg) scale(1.05)' 
      : 'translateY(0px) rotateY(0deg) scale(1)',
    boxShadow: isHovered
      ? '0 20px 40px rgba(0,0,0,0.2)'
      : '0 10px 30px rgba(0,0,0,0.1)',
    config: { mass: 1, tension: 280, friction: 60 },
  })

  const floatingAnimation = useSpring({
    from: { transform: 'translateY(0px)' },
    to: async (next) => {
      while (true) {
        await next({ transform: 'translateY(-15px)' })
        await next({ transform: 'translateY(0px)' })
      }
    },
    config: { mass: 1, tension: 280, friction: 60 },
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
          style={{
            ...documentAnimation,
            width: '280px',
            height: '350px',
          }}
          className="relative bg-white dark:bg-gray-800 rounded-lg shadow-2xl p-8 border border-gray-200 dark:border-gray-700"
        >
          {/* Document Header */}
          <div className="mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Certificate of Sponsorship</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">AI-Verified Document</p>
          </div>

          {/* Document Lines */}
          <div className="space-y-3 mb-6">
            {[100, 85, 95, 70, 90].map((width, i) => (
              <div
                key={i}
                className="h-2 bg-gray-300 dark:bg-gray-600 rounded"
                style={{ width: `${width}%` }}
              />
            ))}
          </div>

          {/* Verification Badge */}
          <div className="absolute bottom-4 right-4">
            <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
          </div>

          {/* Scan Lines Effect */}
          <div className="absolute inset-0 overflow-hidden rounded-lg pointer-events-none">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-500/10 to-transparent animate-pulse" />
          </div>
        </animated.div>
      </animated.div>
    </div>
  )
}

export default function AnimatedBackground() {
  const shapes = [
    { color: '#3B82F6', size: '120px', position: { x: '10%', y: '20%' }, delay: 0, duration: 4000 },
    { color: '#8B5CF6', size: '80px', position: { x: '80%', y: '10%' }, delay: 1000, duration: 3000 },
    { color: '#10B981', size: '100px', position: { x: '85%', y: '70%' }, delay: 2000, duration: 3500 },
    { color: '#F59E0B', size: '60px', position: { x: '15%', y: '80%' }, delay: 500, duration: 4500 },
    { color: '#EF4444', size: '90px', position: { x: '5%', y: '50%' }, delay: 1500, duration: 3200 },
  ]

  return (
    <div className="relative w-full h-full overflow-hidden bg-gradient-to-br from-blue-50/50 via-purple-50/30 to-indigo-100/50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Animated Background Shapes */}
      {shapes.map((shape, i) => (
        <FloatingShape
          key={i}
          delay={shape.delay}
          size={shape.size}
          color={shape.color}
          position={shape.position}
          duration={shape.duration}
        />
      ))}
      
      {/* Particle Field */}
      <ParticleField />
      
      {/* Main Document Animation */}
      <DocumentAnimation />
      
      {/* Overlay Gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-white/10 via-transparent to-white/5 dark:from-gray-900/20 dark:to-gray-800/10 pointer-events-none" />
    </div>
  )
}