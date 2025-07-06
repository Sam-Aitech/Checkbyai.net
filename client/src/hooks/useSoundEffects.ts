import { useRef, useCallback } from 'react';

// Sound effect types for different interactions
export type SoundType = 
  | 'hover' 
  | 'click' 
  | 'upload' 
  | 'processing' 
  | 'success' 
  | 'error' 
  | 'notification' 
  | 'transition'
  | 'complete'
  | 'warning';

export const useSoundEffects = () => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const isEnabledRef = useRef(true);

  // Initialize audio context on first use
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current && typeof window !== 'undefined') {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  // Generate different sound frequencies and patterns for each interaction
  const createSound = useCallback((type: SoundType) => {
    const audioContext = getAudioContext();
    if (!audioContext || !isEnabledRef.current) return;

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Configure sound parameters based on type
    switch (type) {
      case 'hover':
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
        oscillator.type = 'sine';
        break;

      case 'click':
        oscillator.frequency.setValueAtTime(1200, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(800, audioContext.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
        oscillator.type = 'square';
        break;

      case 'upload':
        // Rising tone for upload start
        oscillator.frequency.setValueAtTime(400, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(800, audioContext.currentTime + 0.3);
        gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
        oscillator.type = 'sawtooth';
        break;

      case 'processing':
        // Subtle pulsing sound for processing
        oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.05, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.05, audioContext.currentTime + 0.2);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        oscillator.type = 'triangle';
        break;

      case 'success':
        // Positive chord progression
        oscillator.frequency.setValueAtTime(523, audioContext.currentTime); // C5
        oscillator.frequency.setValueAtTime(659, audioContext.currentTime + 0.1); // E5
        oscillator.frequency.setValueAtTime(784, audioContext.currentTime + 0.2); // G5
        gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.6);
        oscillator.type = 'sine';
        break;

      case 'error':
        // Descending tone for errors
        oscillator.frequency.setValueAtTime(400, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(200, audioContext.currentTime + 0.3);
        gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
        oscillator.type = 'sawtooth';
        break;

      case 'notification':
        // Gentle bell-like sound
        oscillator.frequency.setValueAtTime(1000, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(800, audioContext.currentTime + 0.1);
        oscillator.frequency.exponentialRampToValueAtTime(1000, audioContext.currentTime + 0.2);
        gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        oscillator.type = 'sine';
        break;

      case 'transition':
        // Smooth transition sound
        oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
        oscillator.frequency.linearRampToValueAtTime(800, audioContext.currentTime + 0.2);
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        oscillator.type = 'triangle';
        break;

      case 'complete':
        // Completion fanfare
        const frequencies = [523, 659, 784, 1047]; // C5, E5, G5, C6
        frequencies.forEach((freq, index) => {
          setTimeout(() => {
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            osc.connect(gain);
            gain.connect(audioContext.destination);
            
            osc.frequency.setValueAtTime(freq, audioContext.currentTime);
            gain.gain.setValueAtTime(0.1, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
            osc.type = 'sine';
            
            osc.start();
            osc.stop(audioContext.currentTime + 0.3);
          }, index * 100);
        });
        return; // Early return to avoid the standard oscillator setup

      case 'warning':
        // Warning beep pattern
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.05, audioContext.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.15, audioContext.currentTime + 0.2);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        oscillator.type = 'square';
        break;

      default:
        oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
        oscillator.type = 'sine';
    }

    // Resume audio context if needed (browsers require user interaction)
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    oscillator.start();
    oscillator.stop(audioContext.currentTime + (type === 'success' ? 0.6 : 0.4));
  }, [getAudioContext]);

  const playSound = useCallback((type: SoundType) => {
    try {
      createSound(type);
    } catch (error) {
      console.warn('Sound effect failed:', error);
    }
  }, [createSound]);

  const toggleSounds = useCallback(() => {
    isEnabledRef.current = !isEnabledRef.current;
    return isEnabledRef.current;
  }, []);

  const enableSounds = useCallback(() => {
    isEnabledRef.current = true;
  }, []);

  const disableSounds = useCallback(() => {
    isEnabledRef.current = false;
  }, []);

  return {
    playSound,
    toggleSounds,
    enableSounds,
    disableSounds,
    isEnabled: () => isEnabledRef.current
  };
};