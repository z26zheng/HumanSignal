import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TmrService } from '@/tmr/tmr-service';

type MockPipeline = (text: string) => Promise<readonly { readonly label: string; readonly score: number }[]>;

let mockPipelineImpl: MockPipeline = async () => [{ label: 'ai', score: 0.5 }];
let mockPipelineFactoryError: Error | null = null;
let pipelineFactoryCallCount: number = 0;

vi.mock('@huggingface/transformers', () => ({
  pipeline: vi.fn(async (
    _task: string,
    _model: string,
    _options?: Record<string, unknown>,
  ): Promise<MockPipeline> => {
    pipelineFactoryCallCount += 1;

    if (mockPipelineFactoryError !== null) {
      throw mockPipelineFactoryError;
    }

    return mockPipelineImpl;
  }),
  env: {
    allowLocalModels: false,
    allowRemoteModels: true,
    backends: {
      onnx: {
        wasm: {
          wasmPaths: undefined,
        },
      },
    },
  },
}));

beforeEach((): void => {
  mockPipelineImpl = async () => [{ label: 'ai', score: 0.5 }];
  mockPipelineFactoryError = null;
  pipelineFactoryCallCount = 0;
});

describe('TmrService', (): void => {
  it('reports not loaded before initialization', (): void => {
    const service = new TmrService();
    const status = service.getStatus();

    expect(status.isLoaded).toBe(false);
    expect(status.isLoading).toBe(false);
    expect(status.errorMessage).toBeNull();
  });

  it('reports loaded after successful initialization', async (): Promise<void> => {
    const service = new TmrService();
    await service.initialize();
    const status = service.getStatus();

    expect(status.isLoaded).toBe(true);
    expect(status.errorMessage).toBeNull();
    expect(status.downloadProgress).toBe(100);
  });

  it('classifies text and returns probability between 0 and 1', async (): Promise<void> => {
    mockPipelineImpl = async () => [{ label: 'ai', score: 0.72 }];

    const service = new TmrService();
    await service.initialize();
    const result = await service.classify('Some test text');

    expect(result.aiProbability).toBe(0.72);
    expect(result.aiProbability).toBeGreaterThanOrEqual(0);
    expect(result.aiProbability).toBeLessThanOrEqual(1);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('inverts probability when pipeline returns human label', async (): Promise<void> => {
    mockPipelineImpl = async () => [{ label: 'human', score: 0.8 }];

    const service = new TmrService();
    const result = await service.classify('Some test text');

    expect(result.aiProbability).toBeCloseTo(0.2, 5);
  });

  it('clamps out-of-range probabilities above 1', async (): Promise<void> => {
    mockPipelineImpl = async () => [{ label: 'ai', score: 1.5 }];

    const service = new TmrService();
    const result = await service.classify('Some test text');

    expect(result.aiProbability).toBe(1);
  });

  it('clamps out-of-range probabilities below 0', async (): Promise<void> => {
    mockPipelineImpl = async () => [{ label: 'ai', score: -0.3 }];

    const service = new TmrService();
    const result = await service.classify('Some test text');

    expect(result.aiProbability).toBe(0);
  });

  it('returns error status when model fails to load', async (): Promise<void> => {
    mockPipelineFactoryError = new Error('Network failure: 503');

    const service = new TmrService();
    await service.initialize();
    const status = service.getStatus();

    expect(status.isLoaded).toBe(false);
    expect(status.isLoading).toBe(false);
    expect(status.errorMessage).toBe('Network failure: 503');
  });

  it('throws when classifying without successful initialization', async (): Promise<void> => {
    mockPipelineFactoryError = new Error('Network failure');

    const service = new TmrService();
    await service.initialize();

    await expect(service.classify('Some text')).rejects.toThrow();
  });

  it('throws when pipeline returns no results', async (): Promise<void> => {
    mockPipelineImpl = async () => [];

    const service = new TmrService();
    await service.initialize();

    await expect(service.classify('Some text')).rejects.toThrow('TMR pipeline returned no results.');
  });

  it('does not re-initialize when already loaded', async (): Promise<void> => {
    const service = new TmrService();
    await service.initialize();
    await service.initialize();
    await service.initialize();

    expect(pipelineFactoryCallCount).toBe(1);
  });

  it('reports loading state during in-flight initialization', async (): Promise<void> => {
    mockPipelineImpl = async () => [{ label: 'ai', score: 0.5 }];

    const service = new TmrService();
    const initPromise = service.initialize();

    expect(service.getStatus().isLoading).toBe(true);

    await initPromise;
    expect(service.getStatus().isLoading).toBe(false);
    expect(service.getStatus().isLoaded).toBe(true);
  });

  it('auto-initializes when classify is called before initialize', async (): Promise<void> => {
    mockPipelineImpl = async () => [{ label: 'ai', score: 0.42 }];

    const service = new TmrService();
    const result = await service.classify('Some text long enough for the model');

    expect(result.aiProbability).toBeCloseTo(0.42, 5);
    expect(service.getStatus().isLoaded).toBe(true);
  });

  it('tracks download progress from progress_callback', async (): Promise<void> => {
    const service = new TmrService();
    await service.initialize();

    expect(service.getStatus().downloadProgress).toBe(100);
  });
});
