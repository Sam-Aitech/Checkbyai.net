import { useEffect, useState, ReactNode } from 'react'
// import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals'

interface PerformanceMetrics {
  cls: number | null
  fid: number | null
  fcp: number | null
  lcp: number | null
  ttfb: number | null
}

interface LazyComponentProps {
  children: ReactNode
  threshold?: number
  rootMargin?: string
  fallback?: ReactNode
}

// Performance monitoring hook
export function usePerformanceMetrics() {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    cls: null,
    fid: null,
    fcp: null,
    lcp: null,
    ttfb: null,
  })

  useEffect(() => {
    getCLS((metric) => setMetrics(prev => ({ ...prev, cls: metric.value })))
    getFID((metric) => setMetrics(prev => ({ ...prev, fid: metric.value })))
    getFCP((metric) => setMetrics(prev => ({ ...prev, fcp: metric.value })))
    getLCP((metric) => setMetrics(prev => ({ ...prev, lcp: metric.value })))
    getTTFB((metric) => setMetrics(prev => ({ ...prev, ttfb: metric.value })))
  }, [])

  return metrics
}

// Lazy loading component with intersection observer
export function LazyComponent({ 
  children, 
  threshold = 0.1, 
  rootMargin = '50px',
  fallback = null 
}: LazyComponentProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [ref, setRef] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!ref) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.unobserve(ref)
        }
      },
      { threshold, rootMargin }
    )

    observer.observe(ref)
    return () => observer.disconnect()
  }, [ref, threshold, rootMargin])

  return (
    <div ref={setRef}>
      {isVisible ? children : fallback}
    </div>
  )
}

// Image optimization component
interface OptimizedImageProps {
  src: string
  alt: string
  className?: string
  width?: number
  height?: number
  priority?: boolean
}

export function OptimizedImage({ 
  src, 
  alt, 
  className = '', 
  width, 
  height, 
  priority = false 
}: OptimizedImageProps) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [error, setError] = useState(false)

  return (
    <div className={`relative ${className}`}>
      {!isLoaded && !error && (
        <div className="absolute inset-0 bg-gray-200 dark:bg-gray-700 animate-pulse rounded" />
      )}
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        onLoad={() => setIsLoaded(true)}
        onError={() => setError(true)}
        className={`transition-opacity duration-300 ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        } ${className}`}
      />
      {error && (
        <div className="absolute inset-0 bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 text-sm">
          Failed to load image
        </div>
      )}
    </div>
  )
}

// Memory usage optimizer hook
export function useMemoryOptimization() {
  useEffect(() => {
    const handleMemoryWarning = () => {
      if ('memory' in performance) {
        const memory = (performance as any).memory
        if (memory.usedJSHeapSize / memory.totalJSHeapSize > 0.8) {
          // Force garbage collection if available
          if ('gc' in window) {
            (window as any).gc()
          }
        }
      }
    }

    const interval = setInterval(handleMemoryWarning, 30000) // Check every 30 seconds
    return () => clearInterval(interval)
  }, [])
}

// Prefetch critical resources
export function usePrefetch(urls: string[]) {
  useEffect(() => {
    urls.forEach(url => {
      const link = document.createElement('link')
      link.rel = 'prefetch'
      link.href = url
      document.head.appendChild(link)
    })
  }, [urls])
}

// Performance observer for tracking metrics
export function usePerformanceObserver() {
  useEffect(() => {
    if ('PerformanceObserver' in window) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          // Log performance entries for monitoring
          if (process.env.NODE_ENV === 'development') {
            console.log(`Performance: ${entry.name} - ${entry.duration}ms`)
          }
        }
      })

      observer.observe({ entryTypes: ['navigation', 'resource', 'paint'] })
      return () => observer.disconnect()
    }
  }, [])
}