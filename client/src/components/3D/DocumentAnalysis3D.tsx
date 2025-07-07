import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import { useRef, useState } from 'react';
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
  color = '#4338ca'
}: { 
  position: [number, number, number]; 
  label: string; 
  value: string; 
  color?: string;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.01;
      meshRef.current.scale.setScalar(hovered ? 1.2 : 1);
    }
  });

  return (
    <group position={position}>
      {/* Main Node */}
      <mesh
        ref={meshRef}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial 
          color={hovered ? '#6366f1' : color} 
          transparent 
          opacity={0.8}
        />
      </mesh>

      {/* Value Display */}
      {hovered && (
        <Html position={[0, -0.8, 0]} center>
          <div className="bg-black/80 text-white p-2 rounded-lg text-xs max-w-48 text-center">
            <div className="font-semibold text-blue-300">{label}</div>
            <div className="mt-1 break-words">{value}</div>
          </div>
        </Html>
      )}
    </group>
  );
}

function DocumentVisualization({ metadata }: { metadata?: Metadata }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.005;
    }
  });

  const xmpTags = metadata?.xmp_tags || {};
  const metadataEntries = Object.entries(xmpTags);

  return (
    <group ref={groupRef}>
      {/* Central Document Representation */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1, 1.4, 0.1]} />
        <meshStandardMaterial 
          color="#f3f4f6" 
          transparent 
          opacity={0.9}
        />
      </mesh>

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
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1, 1, 0.2]} />
        <meshStandardMaterial 
          color={getResultColor(result.result)}
          transparent 
          opacity={0.8}
        />
      </mesh>

      {/* Result Text Display */}
      <Html position={[0, 0, 0]} center>
        <div className="text-center text-white font-bold">
          <div className="text-lg">{result.result.toUpperCase()}</div>
          <div className="text-sm">{result.confidence.toFixed(1)}% Confidence</div>
        </div>
      </Html>
    </group>
  );
}

function Scene({ metadata, analysisResult }: DocumentAnalysis3DProps) {
  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
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