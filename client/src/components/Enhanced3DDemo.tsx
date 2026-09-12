import { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';

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
    background: 'transparent',
    glow: '#4FC3F7'
  };

  // Initialize Three.js scene
  useEffect(() => {
    if (!isVisible || !mountRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    // No background color - transparent
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
      
      // Static rendering without rotation animations
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
    // Document Upload Portal
    const portalGeometry = new THREE.CylinderGeometry(1.2, 1.2, 0.1, 32);
    const portalMaterial = new THREE.MeshPhongMaterial({ 
      color: new THREE.Color(colors.primaryLight),
      emissive: new THREE.Color(colors.primaryLight).multiplyScalar(0.2),
      transparent: true,
      opacity: 0.8
    });
    const portal = new THREE.Mesh(portalGeometry, portalMaterial);
    portal.position.set(-5, 0, 0);
    portal.userData = { type: 'upload-portal', name: 'Document Upload' };
    scene.add(portal);

    // AI Brain Core - Central processing unit
    const brainGeometry = new THREE.IcosahedronGeometry(1, 2);
    const brainMaterial = new THREE.MeshPhongMaterial({ 
      color: new THREE.Color(colors.secondary),
      emissive: new THREE.Color(colors.secondary).multiplyScalar(0.15),
      wireframe: false
    });
    const brain = new THREE.Mesh(brainGeometry, brainMaterial);
    brain.position.set(0, 0, 0);
    brain.userData = { type: 'ai-core', name: 'AI Analysis Engine' };
    scene.add(brain);

    // Data Processing Modules (floating around the brain)
    const modules = [
      { name: 'Metadata Scanner', position: [-2, 2, 1], color: colors.primaryLight, shape: 'octahedron' },
      { name: 'Pattern Analyzer', position: [2, 2, -1], color: colors.primary, shape: 'dodecahedron' },
      { name: 'Security Validator', position: [-2, -2, -1], color: colors.caution, shape: 'tetrahedron' },
      { name: 'Authenticity Engine', position: [2, -2, 1], color: colors.secondary, shape: 'octahedron' }
    ];

    modules.forEach((module) => {
      let geometry;
      switch(module.shape) {
        case 'octahedron':
          geometry = new THREE.OctahedronGeometry(0.6);
          break;
        case 'dodecahedron':
          geometry = new THREE.DodecahedronGeometry(0.6);
          break;
        case 'tetrahedron':
          geometry = new THREE.TetrahedronGeometry(0.8);
          break;
        default:
          geometry = new THREE.OctahedronGeometry(0.6);
      }
      
      const material = new THREE.MeshPhongMaterial({ 
        color: new THREE.Color(module.color),
        emissive: new THREE.Color(module.color).multiplyScalar(0.1),
        transparent: true,
        opacity: 0.9
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(module.position[0], module.position[1], module.position[2]);
      mesh.userData = { type: 'processor', name: module.name };
      scene.add(mesh);

      // Add energy connections from modules to brain
      const points = [
        new THREE.Vector3(module.position[0], module.position[1], module.position[2]),
        new THREE.Vector3(0, 0, 0)
      ];
      const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
      const lineMaterial = new THREE.LineBasicMaterial({ 
        color: new THREE.Color(colors.glow),
        transparent: true,
        opacity: 0.6
      });
      const line = new THREE.Line(lineGeometry, lineMaterial);
      scene.add(line);
    });

    // Result Display Screens
    const screenGeometry = new THREE.PlaneGeometry(1.5, 1);
    const screens = [
      { position: [5, 1, 0], result: 'GENUINE', color: colors.secondary },
      { position: [5, 0, 0], result: 'EDITED', color: colors.caution },
      { position: [5, -1, 0], result: 'FAKE', color: '#CC0000' }
    ];

    screens.forEach((screen) => {
      const material = new THREE.MeshBasicMaterial({ 
        color: new THREE.Color(screen.color),
        transparent: true,
        opacity: 0.7
      });
      const mesh = new THREE.Mesh(screenGeometry, material);
      mesh.position.set(screen.position[0], screen.position[1], screen.position[2]);
      mesh.userData = { type: 'result-screen', result: screen.result };
      scene.add(mesh);

      // Add glow effect around screens
      const glowGeometry = new THREE.RingGeometry(0.8, 1.2, 32);
      const glowMaterial = new THREE.MeshBasicMaterial({ 
        color: new THREE.Color(screen.color),
        transparent: true,
        opacity: 0.2
      });
      const glow = new THREE.Mesh(glowGeometry, glowMaterial);
      glow.position.copy(mesh.position);
      scene.add(glow);
    });

    // Data Flow Particles (visual representation of processing)
    const particleCount = 50;
    const particles = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 10;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 6;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 4;
    }
    
    particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMaterial = new THREE.PointsMaterial({ 
      color: new THREE.Color(colors.glow),
      size: 0.05,
      transparent: true,
      opacity: 0.6
    });
    const particleSystem = new THREE.Points(particles, particleMaterial);
    scene.add(particleSystem);
  };

  const startAnimation = () => {
    setDemoStep(0);
    setIsAnimating(true);
    
    const steps = [
      { delay: 1000, step: 1 },
      { delay: 3000, step: 2 },
      { delay: 5000, step: 3 },
      { delay: 7000, step: 4 },
      { delay: 9000, step: 5 },
      { delay: 11000, step: 0 }
    ];

    steps.forEach(({ delay, step }) => {
      setTimeout(() => {
        setDemoStep(step);
        if (step === 0) setIsAnimating(false);
      }, delay);
    });
  };

  const scenarioResults = {
    genuine: { tone: 'success' as const, label: 'GENUINE DOCUMENT', confidence: 98 },
    edited: { tone: 'warning' as const, label: 'EDITED DOCUMENT', confidence: 75 },
    fake: { tone: 'destructive' as const, label: 'FAKE DOCUMENT', confidence: 15 }
  };

  const toneClasses = {
    success: { bg: 'bg-success', text: 'text-success-foreground', bar: 'bg-success' },
    warning: { bg: 'bg-warning', text: 'text-warning-foreground', bar: 'bg-warning' },
    destructive: { bg: 'bg-destructive', text: 'text-destructive-foreground', bar: 'bg-destructive' },
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 p-4">
      <div
        className="bg-surface-inverse rounded-2xl p-8 max-w-7xl w-full max-h-[95vh] overflow-y-auto relative"
      >
        {/* Enhanced Header */}
        <div className="text-center mb-8">
          <h2 className="text-4xl font-bold mb-4 text-surface-inverse-foreground">
            Interactive COS Verification System
          </h2>
          <p className="text-surface-inverse-muted text-lg max-w-4xl mx-auto mb-6">
            Explore our AI-powered document verification ecosystem with real-time 3D visualization
          </p>

          {/* Control Panel */}
          <div className="flex flex-wrap justify-center gap-4 mb-6">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-white/10 rounded-lg p-2">
              <span className="text-surface-inverse-foreground text-sm mr-3">View Mode:</span>
              <button
                onClick={() => {
                  setViewMode(viewMode === 'simplified' ? 'technical' : 'simplified');
                }}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  viewMode === 'simplified'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-surface-inverse-border text-surface-inverse-muted'
                }`}
              >
                {viewMode === 'simplified' ? 'Simplified' : 'Technical'}
              </button>
            </div>

            {/* Scenario Selection */}
            <div className="flex items-center bg-white/10 rounded-lg p-2">
              <span className="text-surface-inverse-foreground text-sm mr-3">Scenario:</span>
              <select
                value={selectedScenario}
                onChange={(e) => {
                  setSelectedScenario(e.target.value as 'genuine' | 'edited' | 'fake');
                }}
                className="bg-surface-inverse-border text-surface-inverse-foreground rounded-md px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="genuine">Genuine Document</option>
                <option value="edited">Edited Document</option>
                <option value="fake">Fake Document</option>
              </select>
            </div>
          </div>

          {/* Step Indicator */}
          <div className="flex justify-center items-center space-x-2 mb-6">
            <span className="text-surface-inverse-muted text-sm">Step {demoStep} of 5:</span>
            <span className="text-surface-inverse-foreground font-semibold">
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
        <div className="relative bg-surface-inverse/60 rounded-2xl p-8 mb-8 min-h-[600px] overflow-hidden border border-surface-inverse-border">
          {/* Three.js Canvas Container */}
          <div 
            ref={mountRef} 
            className="w-full h-full flex items-center justify-center"
            style={{ minHeight: '600px' }}
          />

          {/* Interactive Overlay Elements */}
          <div className="absolute top-4 left-4 space-y-3">
            <h3 className="text-surface-inverse-foreground font-bold text-lg">Processing Pipeline Status</h3>
            {['Upload', 'Extract', 'Analyze', 'Verify', 'Report'].map((stage, index) => (
              <div
                key={stage}
                className={`flex items-center space-x-3 transition-opacity duration-200 cursor-pointer ${
                  demoStep > index ? 'opacity-100' : 'opacity-30'
                }`}
                onMouseEnter={() => setShowTooltip(`${stage}: ${getStageDescription(stage)}`)}
                onMouseLeave={() => setShowTooltip(null)}
              >
                <div className={`w-4 h-4 rounded-full transition-colors duration-200 ${
                  demoStep > index ? 'bg-success animate-pulse shadow-lg shadow-success/50' : 'bg-surface-inverse-border'
                }`} />
                <span className="text-surface-inverse-foreground text-sm font-medium">{stage}</span>
              </div>
            ))}
          </div>

          {/* Technical Information Panel */}
          {viewMode === 'technical' && (
            <div className="absolute top-4 right-4 bg-black/50 backdrop-blur-sm rounded-lg p-4 max-w-sm">
              <h4 className="text-surface-inverse-foreground font-bold mb-3">Technical Details</h4>
              <div className="space-y-2 text-sm">
                <div className="text-info">
                  <span className="font-medium">Algorithm:</span> Multi-layer verification
                </div>
                <div className="text-success">
                  <span className="font-medium">Accuracy:</span> 99.2% detection rate
                </div>
                <div className="text-surface-inverse-muted">
                  <span className="font-medium">Processing:</span> ~2.5 seconds avg
                </div>
                <div className="text-surface-inverse-muted">
                  <span className="font-medium">Features:</span> 150+ metadata points
                </div>
              </div>
            </div>
          )}

          {/* Result Display */}
          {demoStep >= 4 && (
            <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 text-center">
              <div
                className={`inline-block px-8 py-4 rounded-full font-bold text-xl shadow-lg animate-in fade-in zoom-in-95 duration-200 ${toneClasses[scenarioResults[selectedScenario].tone].bg} ${toneClasses[scenarioResults[selectedScenario].tone].text}`}
              >
                {scenarioResults[selectedScenario].label}
              </div>

              <div className="mt-4 bg-surface-inverse-border rounded-full h-4 w-64 mx-auto overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-200 ease-out ${toneClasses[scenarioResults[selectedScenario].tone].bar}`}
                  style={{ width: `${scenarioResults[selectedScenario].confidence}%` }}
                />
              </div>
              <p className="text-surface-inverse-foreground mt-2 font-semibold">
                Confidence: {scenarioResults[selectedScenario].confidence}%
              </p>
            </div>
          )}

          {/* Floating Tooltip */}
          {showTooltip && (
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/80 backdrop-blur-sm rounded-lg p-4 max-w-xs z-10">
              <p className="text-surface-inverse-foreground text-sm">{showTooltip}</p>
            </div>
          )}
        </div>

        {/* Data Flow Visualization */}
        <div className="mb-8">
          <h3 className="text-surface-inverse-foreground text-xl font-bold mb-4 text-center">Real-time Data Flow</h3>
          <div className="flex justify-center items-center space-x-4">
            {['Input', 'Processing', 'Analysis', 'Output'].map((phase, index) => (
              <div key={phase} className="flex items-center">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors duration-200 ${
                  demoStep > index ? 'bg-primary animate-pulse' : 'bg-surface-inverse-border'
                }`}>
                  <span className="text-primary-foreground text-xs font-bold">{index + 1}</span>
                </div>
                {index < 3 && (
                  <div className={`w-16 h-1 mx-2 transition-colors duration-200 ${
                    demoStep > index ? 'bg-primary animate-pulse' : 'bg-surface-inverse-border'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Control Buttons */}
        <div className="text-center space-y-4">
          <div className="flex justify-center space-x-4">
            <Button
              onClick={() => {
                startAnimation();
              }}
              disabled={isAnimating}
              size="lg"
              className="rounded-full px-8 py-4 text-lg"
            >
              {isAnimating ? 'Animation Running...' : 'Start Interactive Demo'}
            </Button>

            <Button
              onClick={() => {
                onClose();
                onTryFreeCheck();
              }}
              size="lg"
              className="rounded-full px-8 py-4 text-lg bg-success text-success-foreground hover:bg-success/90"
            >
              Try Free Verification
            </Button>
          </div>

          <button
            onClick={() => {
              onClose();
            }}
            className="px-6 py-3 bg-surface-inverse-border hover:bg-surface-inverse-border/70 rounded-lg text-surface-inverse-foreground font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
    Upload: "Document enters secure upload portal with integrity validation",
    Extract: "AI Brain Core activates metadata scanner and pattern analyzer modules",
    Analyze: "Security validator and authenticity engine process document structure",
    Verify: "Cross-reference analysis against trusted pattern database",
    Report: "Result display screens show verification outcome with confidence scoring"
  };
  return descriptions[stage as keyof typeof descriptions] || "AI processing stage";
}