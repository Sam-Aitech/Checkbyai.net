import { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useSoundEffects } from '../hooks/useSoundEffects';

interface Enhanced3DDemoProps {
  isVisible: boolean;
  onClose: () => void;
  onTryFreeCheck: () => void;
}

export default function Enhanced3DDemo({ isVisible, onClose, onTryFreeCheck }: Enhanced3DDemoProps) {
  const [demoStep, setDemoStep] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [viewMode, setViewMode] = useState<'simplified' | 'technical'>('simplified');
  const [selectedScenario, setSelectedScenario] = useState<'genuine' | 'edited' | 'fake'>('genuine');
  const [showTooltip, setShowTooltip] = useState<string | null>(null);
  
  // Sound effects integration
  const { playSound } = useSoundEffects();
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  // Professional color scheme from style guide
  const colors = {
    primary: '#003366',
    primaryLight: '#0066CC',
    secondary: '#009933',
    caution: '#FF6600',
    background: '#f8fafc',
    glow: '#4FC3F7'
  };

  // Initialize Three.js scene
  useEffect(() => {
    if (!isVisible || !mountRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(colors.background);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(75, 800 / 600, 0.1, 1000);
    camera.position.set(0, 0, 10);
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(800, 600);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    if (mountRef.current) {
      mountRef.current.appendChild(renderer.domElement);
    }

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Create initial 3D elements
    createInitialElements(scene);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      
      // Rotate elements slightly for dynamic effect
      scene.children.forEach((child, index) => {
        if (child.userData.rotatable) {
          child.rotation.y += 0.01 * (index % 2 === 0 ? 1 : -1);
        }
      });
      
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [isVisible]);

  const createInitialElements = (scene: THREE.Scene) => {
    // User avatar node
    const userGeometry = new THREE.SphereGeometry(0.5, 32, 32);
    const userMaterial = new THREE.MeshPhongMaterial({ 
      color: new THREE.Color(colors.primaryLight),
      emissive: new THREE.Color(colors.primaryLight).multiplyScalar(0.1)
    });
    const userSphere = new THREE.Mesh(userGeometry, userMaterial);
    userSphere.position.set(-6, 2, 0);
    userSphere.userData = { type: 'user', rotatable: true };
    scene.add(userSphere);

    // Processing pipeline nodes
    const pipelineSteps = [
      { name: 'Metadata Extraction', position: [-2, 1, 0], color: colors.primaryLight },
      { name: 'Pattern Recognition', position: [0, 0, 0], color: colors.secondary },
      { name: 'Anomaly Detection', position: [2, -1, 0], color: colors.caution },
      { name: 'Cross-Reference', position: [4, 0, 0], color: colors.primary },
      { name: 'Result Generation', position: [6, 1, 0], color: colors.secondary }
    ];

    pipelineSteps.forEach((step, index) => {
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const material = new THREE.MeshPhongMaterial({ 
        color: new THREE.Color(step.color),
        emissive: new THREE.Color(step.color).multiplyScalar(0.05)
      });
      const cube = new THREE.Mesh(geometry, material);
      cube.position.set(step.position[0], step.position[1], step.position[2]);
      cube.userData = { 
        type: 'pipeline', 
        name: step.name, 
        rotatable: true,
        step: index + 1
      };
      scene.add(cube);
    });

    // Connection lines between nodes
    for (let i = 0; i < pipelineSteps.length - 1; i++) {
      const start = new THREE.Vector3(...pipelineSteps[i].position);
      const end = new THREE.Vector3(...pipelineSteps[i + 1].position);
      
      const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
      const material = new THREE.LineBasicMaterial({ 
        color: new THREE.Color(colors.glow),
        linewidth: 3
      });
      const line = new THREE.Line(geometry, material);
      line.userData = { type: 'connection' };
      scene.add(line);
    }

    // Expert review system
    const expertGeometry = new THREE.ConeGeometry(0.5, 1, 6);
    const expertMaterial = new THREE.MeshPhongMaterial({ 
      color: new THREE.Color(colors.caution),
      emissive: new THREE.Color(colors.caution).multiplyScalar(0.1)
    });
    const expertCone = new THREE.Mesh(expertGeometry, expertMaterial);
    expertCone.position.set(4, 3, 0);
    expertCone.userData = { type: 'expert', rotatable: true };
    scene.add(expertCone);
  };

  const startAnimation = () => {
    playSound('transition');
    setDemoStep(0);
    setIsAnimating(true);
    
    const steps = [
      { delay: 1000, step: 1, sound: null },
      { delay: 3000, step: 2, sound: null },
      { delay: 5000, step: 3, sound: null },
      { delay: 7000, step: 4, sound: selectedScenario === 'genuine' ? 'success' : selectedScenario === 'edited' ? 'warning' : 'error' },
      { delay: 9000, step: 5, sound: null },
      { delay: 11000, step: 0, sound: 'complete' }
    ];

    steps.forEach(({ delay, step, sound }) => {
      setTimeout(() => {
        setDemoStep(step);
        if (step > 0 && sound) {
          playSound(sound as any);
        }
        if (step === 0) setIsAnimating(false);
      }, delay);
    });
  };

  const scenarioResults = {
    genuine: { color: colors.secondary, label: 'GENUINE DOCUMENT', confidence: 98 },
    edited: { color: colors.caution, label: 'EDITED DOCUMENT', confidence: 75 },
    fake: { color: '#dc2626', label: 'FAKE DOCUMENT', confidence: 15 }
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-95 flex items-center justify-center z-50 p-4">
      <div 
        className="bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 rounded-2xl p-8 max-w-7xl w-full max-h-[95vh] overflow-y-auto relative"
        style={{ backgroundColor: colors.background }}
      >
        {/* Enhanced Header */}
        <div className="text-center mb-8">
          <h2 
            className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-600 bg-clip-text text-transparent"
            style={{ color: colors.primary }}
          >
            Interactive COS Verification System
          </h2>
          <p className="text-blue-200 text-lg max-w-4xl mx-auto mb-6">
            Explore our AI-powered document verification ecosystem with real-time 3D visualization
          </p>

          {/* Control Panel */}
          <div className="flex flex-wrap justify-center gap-4 mb-6">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-white/10 rounded-lg p-2">
              <span className="text-white text-sm mr-3">View Mode:</span>
              <button
                onClick={() => {
                  playSound('click');
                  setViewMode(viewMode === 'simplified' ? 'technical' : 'simplified');
                }}
                onMouseEnter={() => playSound('hover')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-300 ${
                  viewMode === 'simplified' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-600 text-gray-300'
                }`}
              >
                {viewMode === 'simplified' ? 'Simplified' : 'Technical'}
              </button>
            </div>

            {/* Scenario Selection */}
            <div className="flex items-center bg-white/10 rounded-lg p-2">
              <span className="text-white text-sm mr-3">Scenario:</span>
              <select
                value={selectedScenario}
                onChange={(e) => {
                  playSound('click');
                  setSelectedScenario(e.target.value as 'genuine' | 'edited' | 'fake');
                }}
                onMouseEnter={() => playSound('hover')}
                className="bg-gray-700 text-white rounded-md px-3 py-2 text-sm"
              >
                <option value="genuine">Genuine Document</option>
                <option value="edited">Edited Document</option>
                <option value="fake">Fake Document</option>
              </select>
            </div>
          </div>

          {/* Step Indicator */}
          <div className="flex justify-center items-center space-x-2 mb-6">
            <span className="text-blue-300 text-sm">Step {demoStep} of 5:</span>
            <span className="text-white font-semibold">
              {demoStep === 0 && "Ready to Start"}
              {demoStep === 1 && "Document Upload & Initial Processing"}
              {demoStep === 2 && "Metadata Analysis & Pattern Matching"}
              {demoStep === 3 && "AI/ML Verification Pipeline"}
              {demoStep === 4 && "Result Generation & Confidence Scoring"}
              {demoStep === 5 && "Expert Review & Final Report"}
            </span>
          </div>
        </div>

        {/* Main 3D Visualization Area */}
        <div className="relative bg-gradient-to-br from-gray-900/50 to-blue-900/30 rounded-2xl p-8 mb-8 min-h-[600px] overflow-hidden border border-blue-500/20">
          {/* Three.js Canvas Container */}
          <div 
            ref={mountRef} 
            className="w-full h-full flex items-center justify-center"
            style={{ minHeight: '600px' }}
          />

          {/* Interactive Overlay Elements */}
          <div className="absolute top-4 left-4 space-y-3">
            <h3 className="text-white font-bold text-lg">Processing Pipeline Status</h3>
            {['Upload', 'Extract', 'Analyze', 'Verify', 'Report'].map((stage, index) => (
              <div 
                key={stage} 
                className={`flex items-center space-x-3 transition-all duration-500 cursor-pointer ${
                  demoStep > index ? 'opacity-100' : 'opacity-30'
                }`}
                onMouseEnter={() => setShowTooltip(`${stage}: ${getStageDescription(stage)}`)}
                onMouseLeave={() => setShowTooltip(null)}
              >
                <div className={`w-4 h-4 rounded-full transition-all duration-300 ${
                  demoStep > index ? 'bg-green-500 animate-pulse shadow-lg shadow-green-500/50' : 'bg-gray-500'
                }`} />
                <span className="text-white text-sm font-medium">{stage}</span>
              </div>
            ))}
          </div>

          {/* Technical Information Panel */}
          {viewMode === 'technical' && (
            <div className="absolute top-4 right-4 bg-black/50 backdrop-blur-sm rounded-lg p-4 max-w-sm">
              <h4 className="text-white font-bold mb-3">Technical Details</h4>
              <div className="space-y-2 text-sm">
                <div className="text-blue-300">
                  <span className="font-medium">Algorithm:</span> Multi-layer verification
                </div>
                <div className="text-green-300">
                  <span className="font-medium">Accuracy:</span> 99.2% detection rate
                </div>
                <div className="text-yellow-300">
                  <span className="font-medium">Processing:</span> ~2.5 seconds avg
                </div>
                <div className="text-purple-300">
                  <span className="font-medium">Features:</span> 150+ metadata points
                </div>
              </div>
            </div>
          )}

          {/* Result Display */}
          {demoStep >= 4 && (
            <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 text-center">
              <div 
                className="inline-block px-8 py-4 rounded-full text-white font-bold text-xl shadow-2xl transition-all duration-1000 transform animate-pulse"
                style={{ 
                  backgroundColor: scenarioResults[selectedScenario].color,
                  boxShadow: `0 0 30px ${scenarioResults[selectedScenario].color}50`
                }}
              >
                {scenarioResults[selectedScenario].label}
              </div>
              
              <div className="mt-4 bg-gray-700 rounded-full h-4 w-64 mx-auto overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all duration-2000 ease-out"
                  style={{ 
                    width: demoStep >= 4 ? `${scenarioResults[selectedScenario].confidence}%` : '0%',
                    backgroundColor: scenarioResults[selectedScenario].color
                  }}
                />
              </div>
              <p className="text-white mt-2 font-semibold">
                Confidence: {scenarioResults[selectedScenario].confidence}%
              </p>
            </div>
          )}

          {/* Floating Tooltip */}
          {showTooltip && (
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/80 backdrop-blur-sm rounded-lg p-4 max-w-xs z-10">
              <p className="text-white text-sm">{showTooltip}</p>
            </div>
          )}
        </div>

        {/* Data Flow Visualization */}
        <div className="mb-8">
          <h3 className="text-white text-xl font-bold mb-4 text-center">Real-time Data Flow</h3>
          <div className="flex justify-center items-center space-x-4">
            {['Input', 'Processing', 'Analysis', 'Output'].map((phase, index) => (
              <div key={phase} className="flex items-center">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-500 ${
                  demoStep > index ? 'bg-blue-600 animate-pulse' : 'bg-gray-600'
                }`}>
                  <span className="text-white text-xs font-bold">{index + 1}</span>
                </div>
                {index < 3 && (
                  <div className={`w-16 h-1 mx-2 transition-all duration-500 ${
                    demoStep > index ? 'bg-blue-400 animate-pulse' : 'bg-gray-600'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Control Buttons */}
        <div className="text-center space-y-4">
          <div className="flex justify-center space-x-4">
            <button 
              onClick={() => {
                playSound('click');
                startAnimation();
              }}
              onMouseEnter={() => playSound('hover')}
              disabled={isAnimating}
              className="px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-full text-white font-bold text-lg hover:shadow-xl hover:shadow-blue-500/50 transition-all duration-300 transform hover:-translate-y-1 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAnimating ? 'Animation Running...' : 'Start Interactive Demo'}
            </button>
            
            <button 
              onClick={() => {
                playSound('click');
                onClose();
                onTryFreeCheck();
              }}
              onMouseEnter={() => playSound('hover')}
              className="px-8 py-4 bg-gradient-to-r from-green-600 to-emerald-600 rounded-full text-white font-bold text-lg hover:shadow-xl hover:shadow-green-500/50 transition-all duration-300 transform hover:-translate-y-1"
            >
              Try Free Verification
            </button>
          </div>

          <button
            onClick={() => {
              playSound('click');
              onClose();
            }}
            onMouseEnter={() => playSound('hover')}
            className="px-6 py-3 bg-gray-600 hover:bg-gray-500 rounded-lg text-white font-medium transition-colors duration-200"
          >
            Close Demo
          </button>
        </div>
      </div>
    </div>
  );
}

function getStageDescription(stage: string): string {
  const descriptions = {
    Upload: "Secure document upload with integrity validation",
    Extract: "Advanced PDF metadata extraction using PyMuPDF",
    Analyze: "Pattern recognition and anomaly detection algorithms",
    Verify: "Cross-reference against trusted document database",
    Report: "Generate comprehensive verification report with confidence scoring"
  };
  return descriptions[stage as keyof typeof descriptions] || "Processing stage";
}