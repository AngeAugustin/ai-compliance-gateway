declare module "@huggingface/transformers" {
  export const env: {
    allowLocalModels: boolean;
    allowRemoteModels: boolean;
    useBrowserCache?: boolean;
  };
  export function pipeline(
    task: string,
    model: string,
    options?: Record<string, unknown>,
  ): Promise<(text: string) => Promise<unknown>>;
}
