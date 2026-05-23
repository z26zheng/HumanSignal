import { logger } from '@/shared/logger';
import { errorMessage as toErrorMessage } from '@/shared/safe-catch';

export interface TmrStatus {
  readonly isLoaded: boolean;
  readonly isLoading: boolean;
  readonly downloadProgress: number | null;
  readonly errorMessage: string | null;
}

export interface TmrClassifyResult {
  readonly aiProbability: number;
  readonly latencyMs: number;
}

const TMR_DTYPE = 'q4' as const;

const TMR_LOCAL_MODEL_PATH: string = './models/tmr-ai-text-detector/';

export class TmrService {
  private pipeline: TmrPipeline | null = null;
  private loading: boolean = false;
  private errorMessage: string | null = null;

  public async initialize(): Promise<TmrStatus> {
    if (this.pipeline !== null) {
      return this.getStatus();
    }

    if (this.loading) {
      return this.getStatus();
    }

    this.loading = true;
    this.errorMessage = null;

    try {
      const transformers = await import('@huggingface/transformers');
      transformers.env.allowLocalModels = true;
      transformers.env.allowRemoteModels = false;
      const onnxWasm = transformers.env.backends.onnx.wasm;
      if (onnxWasm !== undefined) {
        onnxWasm.wasmPaths = {
          mjs: './ort/ort-wasm-simd-threaded.asyncify.mjs',
          wasm: './ort/ort-wasm-simd-threaded.asyncify.wasm',
        };
      }
      this.pipeline = await transformers.pipeline('text-classification', TMR_LOCAL_MODEL_PATH, {
        dtype: TMR_DTYPE,
        local_files_only: true,
      }) as unknown as TmrPipeline;

      logger.info('tmr.init', 'TMR model loaded from bundled files', { dtype: TMR_DTYPE });
      return this.getStatus();
    } catch (error: unknown) {
      this.errorMessage = toErrorMessage(error);
      logger.error('tmr.init', error);
      return this.getStatus();
    } finally {
      this.loading = false;
    }
  }

  public async classify(text: string): Promise<TmrClassifyResult> {
    if (this.pipeline === null) {
      await this.initialize();
    }

    if (this.pipeline === null) {
      throw new Error('TMR model is not loaded.');
    }

    const startedAt: number = Date.now();
    const results: readonly TmrPipelineOutput[] = await this.pipeline(text);
    const top: TmrPipelineOutput | undefined = results[0];

    if (top === undefined) {
      throw new Error('TMR pipeline returned no results.');
    }

    const aiProbability: number = clamp01(
      top.label === 'ai' ? top.score : 1 - top.score,
    );

    return {
      aiProbability,
      latencyMs: Date.now() - startedAt,
    };
  }

  public getStatus(): TmrStatus {
    return {
      isLoaded: this.pipeline !== null,
      isLoading: this.loading,
      downloadProgress: this.pipeline !== null ? 100 : null,
      errorMessage: this.errorMessage,
    };
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

interface TmrPipelineOutput {
  readonly label: string;
  readonly score: number;
}

type TmrPipeline = (text: string) => Promise<readonly TmrPipelineOutput[]>;
