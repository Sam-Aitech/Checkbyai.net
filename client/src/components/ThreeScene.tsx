import { useRef, useMemo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { 
  Float, 
  OrbitControls, 
  Environment, 
  Sparkles, 
  MeshDistortMaterial
} from '@react-three/drei'
import * as THREE from 'three'

function AnimatedSphere({ position, color }: { position: [number, number, number], color: string }) {
  const meshRef = useRef<THREE.Mesh>(null!)
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = state.clock.elapsedTime * 0.5
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.3
    }
  })

  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[0.5, 32, 32]} />
      <MeshDistortMaterial
        color={color}
        distort={0.3}
        speed={1.5}
        roughness={0.1}
        metalness={0.8}
      />
    </mesh>
  )
}

function FloatingDocument() {
  const meshRef = useRef<THREE.Group>(null!)
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.2
      meshRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.3) * 0.1
    }
  })

  return (
    <group ref={meshRef}>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[2, 2.8, 0.1]} />
        <meshStandardMaterial color="white" />
      </mesh>
      <mesh position={[0, 0, 0.06]}>
        <boxGeometry args={[1.8, 2.6, 0.01]} />
        <meshStandardMaterial color="#f8f9fa" />
      </mesh>
      {/* Document lines */}
      {[...Array(8)].map((_, i) => (
        <mesh key={i} position={[0, 0.8 - i * 0.2, 0.07]}>
          <boxGeometry args={[1.4, 0.05, 0.01]} />
          <meshStandardMaterial color="#6c757d" />
        </mesh>
      ))}
      {/* Verification checkmark */}
      <mesh position={[0.6, 0.6, 0.08]}>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshStandardMaterial color="#28a745" />
      </mesh>
    </group>
  )
}

function ParticleField() {
  const count = 200
  const positions = useMemo(() => {
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 20
      positions[i * 3 + 1] = (Math.random() - 0.5) * 20
      positions[i * 3 + 2] = (Math.random() - 0.5) * 20
    }
    return positions
  }, [count])

  const pointsRef = useRef<THREE.Points>(null!)
  
  useFrame((state) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y = state.clock.elapsedTime * 0.05
    }
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.03}
        color="#64b5f6"
        transparent
        opacity={0.6}
        sizeAttenuation={true}
      />
    </points>
  )
}

function Scene() {
  return (
    <>
      <Environment preset="city" />
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} intensity={1} />
      
      <ParticleField />
      
      <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.5}>
        <FloatingDocument />
      </Float>
      
      <AnimatedSphere position={[-3, 2, -2]} color="#ff6b6b" />
      <AnimatedSphere position={[3, -1, -1]} color="#4ecdc4" />
      <AnimatedSphere position={[-2, -2, 1]} color="#ffe66d" />
      <AnimatedSphere position={[2, 2, 2]} color="#a8e6cf" />
      
      <Sparkles count={50} scale={[10, 10, 10]} size={3} speed={0.5} />
      
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        enableRotate={true}
        autoRotate={true}
        autoRotateSpeed={0.5}
        maxPolarAngle={Math.PI / 2}
        minPolarAngle={Math.PI / 3}
      />
    </>
  )
}

export default function ThreeScene() {
  return (
    <div className="w-full h-full">
      <Canvas
        camera={{ position: [0, 0, 6], fov: 75 }}
        dpr={[1, 2]}
        performance={{ min: 0.5 }}
        gl={{ 
          antialias: true,
          alpha: true,
          powerPreference: "high-performance"
        }}
      >
        <Scene />
      </Canvas>
    </div>
  )
}