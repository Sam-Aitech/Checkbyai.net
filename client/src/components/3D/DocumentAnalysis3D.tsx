import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text, Box, Sphere, Cylinder, Html } from '@react-three/drei';
import { useRef, useState, useEffect } from 'react';
import * as THREE from 'three';

interface Metadata {
  fileSize?: number;
  pages?: number;
  xmp_tags?: {
    'dc:date'?: string;
    'dc:format'?: string;
    'dc:language'?: string;
    'pdf:PDFVersion'?: string;
    'pdf:Producer'?: string;
    'xmp:CreateDate'?: string;
    'xmp:CreatorTool'?: string;
    'xmp:MetadataDate'?: string;
  };
}

interface DocumentAnalysis3DProps {
  metadata?: Metadata;
  analysisResult?: {
    result: string;
    confidence: number;
  };
}

function MetadataNode({ 
  position, 
  label, 
  value, 
  color = '#4338ca',
  onClick 
}: { 
  position: [number, number, number]; 
  label: string; 
  value: string; 
  color?: string;
  onClick?: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const [clicked, setClicked] = useState(false);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.01;
      meshRef.current.scale.setScalar(hovered ? 1.2 : clicked ? 1.1 : 1);
    }
  });

  return (
    <group position={position}>
      {/* Main Node */}
      <Sphere
        ref={meshRef}
        args={[0.3, 32, 32]}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        onClick={() => {
          setClicked(!clicked);
          onClick?.();
        }}
      >
        <meshStandardMaterial 
          color={hovered ? '#6366f1' : color} 
          transparent 
          opacity={0.8}
          emissive={hovered ? '#1e1b4b' : '#000000'}
        />
      </Sphere>

      {/* Floating Label */}
      <Text
        position={[0, 0.8, 0]}
        fontSize={0.15}
        color="white"
        anchorX="center"
        anchorY="middle"
        font="/fonts/Inter-Bold.woff"
      >
        {label}
      </Text>

      {/* Value Display */}
      {(hovered || clicked) && (
        <Html position={[0, -0.8, 0]} center>
          <div className="bg-black/80 text-white p-2 rounded-lg backdrop-blur-sm text-xs max-w-48 text-center">
            <div className="font-semibold text-blue-300">{label}</div>
            <div className="mt-1 break-words">{value}</div>
          </div>
        </Html>
      )}

      {/* Connection Lines */}
      <Cylinder
        args={[0.02, 0.02, 2]}
        position={[0, 1, 0]}
        rotation={[0, 0, 0]}
      >
        <meshStandardMaterial color="#374151" transparent opacity={0.3} />
      </Cylinder>
    </group>
  );
}

function DocumentVisualization({ metadata }: { metadata?: Metadata }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.005;
    }
  });

  const xmpTags = metadata?.xmp_tags || {};
  const metadataEntries = Object.entries(xmpTags);

  return (
    <group ref={groupRef}>
      {/* Central Document Representation */}
      <Box args={[1, 1.4, 0.1]} position={[0, 0, 0]}>
        <meshStandardMaterial 
          color="#f3f4f6" 
          transparent 
          opacity={0.9}
          metalness={0.1}
          roughness={0.2}
        />
      </Box>

      {/* Document Icon */}
      <Text
        position={[0, 0, 0.1]}
        fontSize={0.3}
        color="#374151"
        anchorX="center"
        anchorY="middle"
        font="/fonts/Inter-Bold.woff"
      >
        PDF
      </Text>

      {/* Metadata Nodes in Orbital Pattern */}
      {metadataEntries.map(([key, value], index) => {
        const angle = (index / metadataEntries.length) * Math.PI * 2;
        const radius = 3;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const y = Math.sin(index * 0.5) * 0.5;

        const getNodeColor = (key: string) => {
          if (key.startsWith('dc:')) return '#10b981'; // Emerald
          if (key.startsWith('pdf:')) return '#f59e0b'; // Amber
          if (key.startsWith('xmp:')) return '#8b5cf6'; // Violet
          return '#6366f1'; // Default blue
        };

        return (
          <MetadataNode
            key={key}
            position={[x, y, z]}
            label={key}
            value={value || 'Not available'}
            color={getNodeColor(key)}
          />
        );
      })}

      {/* File Stats */}
      {metadata?.fileSize && (
        <MetadataNode
          position={[0, 2.5, 0]}
          label="File Size"
          value={`${(metadata.fileSize / 1024).toFixed(1)} KB`}
          color="#ef4444"
        />
      )}

      {metadata?.pages && (
        <MetadataNode
          position={[0, -2.5, 0]}
          label="Pages"
          value={metadata.pages.toString()}
          color="#06b6d4"
        />
      )}
    </group>
  );
}

function AnalysisResults({ result }: { result?: { result: string; confidence: number } }) {
  if (!result) return null;

  const getResultColor = (resultType: string) => {
    switch (resultType.toLowerCase()) {
      case 'genuine': return '#10b981';
      case 'suspicious': return '#f59e0b';
      case 'fake': return '#ef4444';
      default: return '#6b7280';
    }
  };

  return (
    <group position={[0, 4, 0]}>
      {/* Result Badge */}
      <Cylinder
        args={[1, 1, 0.2]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <meshStandardMaterial 
          color={getResultColor(result.result)}
          transparent 
          opacity={0.8}
          emissive={getResultColor(result.result)}
          emissiveIntensity={0.2}
        />
      </Cylinder>

      {/* Result Text */}
      <Text
        position={[0, 0, 0.2]}
        fontSize={0.3}
        color="white"
        anchorX="center"
        anchorY="middle"
        font="/fonts/Inter-Bold.woff"
      >
        {result.result.toUpperCase()}
      </Text>

      {/* Confidence Text */}
      <Text
        position={[0, -0.5, 0.2]}
        fontSize={0.15}
        color="white"
        anchorX="center"
        anchorY="middle"
        font="/fonts/Inter-Regular.woff"
      >
        {result.confidence.toFixed(1)}% Confidence
      </Text>
    </group>
  );
}

function Scene({ metadata, analysisResult }: DocumentAnalysis3DProps) {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(5, 5, 8);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight 
        position={[10, 10, 5]} 
        intensity={1}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <pointLight position={[-10, -10, -5]} intensity={0.5} color="#4338ca" />

      {/* Document Visualization */}
      <DocumentVisualization metadata={metadata} />

      {/* Analysis Results */}
      <AnalysisResults result={analysisResult} />

      {/* Controls */}
      <OrbitControls 
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={3}
        maxDistance={15}
        autoRotate={false}
      />
    </>
  );
}

export default function DocumentAnalysis3D({ metadata, analysisResult }: DocumentAnalysis3DProps) {
  return (
    <div className="w-full h-96 bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 rounded-xl overflow-hidden">
      <Canvas
        camera={{ position: [5, 5, 8], fov: 75 }}
        gl={{ antialias: true, alpha: true }}
        shadows
      >
        <Scene metadata={metadata} analysisResult={analysisResult} />
      </Canvas>
      
      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-sm rounded-lg p-3 text-white text-xs">
        <div className="font-semibold mb-2">XMP Namespaces</div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
            <span>dc: (Dublin Core)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-500"></div>
            <span>pdf: (PDF Properties)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-violet-500"></div>
            <span>xmp: (XMP Core)</span>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-sm rounded-lg p-3 text-white text-xs max-w-48">
        <div className="font-semibold mb-1">Controls</div>
        <div>• Click and drag to rotate</div>
        <div>• Scroll to zoom</div>
        <div>• Hover nodes for details</div>
      </div>
    </div>
  );
}