export interface PromptApiAvailabilityOptions {
  readonly expectedInputs: readonly PromptApiContentType[];
  readonly expectedOutputs: readonly PromptApiContentType[];
}

export interface PromptApiContentType {
  readonly type: 'text';
  readonly languages: readonly string[];
}

export interface PromptApiMonitor {
  readonly addEventListener: (
    type: 'downloadprogress',
    listener: (event: PromptApiDownloadProgressEvent) => void,
  ) => void;
}

export interface PromptApiDownloadProgressEvent {
  readonly loaded: number;
}

export interface PromptApiCreateOptions {
  readonly initialPrompts?: readonly PromptApiInitialPrompt[];
  readonly monitor?: (monitor: PromptApiMonitor) => void;
}

export interface PromptApiInitialPrompt {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

export interface PromptApiPromptOptions {
  readonly responseConstraint?: unknown;
}

export interface PromptApiSession {
  readonly prompt: (input: string, options?: PromptApiPromptOptions) => Promise<string>;
  readonly destroy?: () => void;
}

export interface PromptApiLanguageModel {
  readonly availability: (options: PromptApiAvailabilityOptions) => Promise<string>;
  readonly create: (options?: PromptApiCreateOptions) => Promise<PromptApiSession>;
}

export function getLanguageModel(): PromptApiLanguageModel | null {
  const candidate: unknown = (globalThis as { readonly LanguageModel?: unknown }).LanguageModel;

  if (!isPromptApiLanguageModel(candidate)) {
    return null;
  }

  return candidate;
}

function isPromptApiLanguageModel(value: unknown): value is PromptApiLanguageModel {
  if (value === null || value === undefined) {
    return false;
  }

  const record: Record<string, unknown> = value as Record<string, unknown>;
  return typeof record.availability === 'function' && typeof record.create === 'function';
}
