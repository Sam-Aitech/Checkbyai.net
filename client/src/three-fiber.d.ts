import type { ThreeElements } from '@react-three/fiber';

// Augment React's JSX namespace (TypeScript 5.1+ with react-jsx transform)
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}

// Augment global JSX namespace (jsx: "preserve" / classic transform)
declare global {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}
