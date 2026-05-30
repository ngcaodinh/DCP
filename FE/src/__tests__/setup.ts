import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Suppress jsdom warning: "Not implemented: HTMLCanvasElement's getContext() method"
HTMLCanvasElement.prototype.getContext = vi.fn() as unknown as (contextId: '2d' | 'webgl' | 'webgl2', options?: CanvasRenderingContext2DSettings | WebGLContextAttributes) => CanvasRenderingContext2D | WebGLRenderingContext | WebGL2RenderingContext | null;
