import type { BedrockRendererApi } from "./bedrock-api";

declare global {
  interface Window {
    bedrock?: BedrockRendererApi;
  }
}

export {};
