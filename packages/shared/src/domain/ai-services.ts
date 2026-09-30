/**
 * Référentiel par défaut des services d'IA générative surveillés (DAT §7.1).
 * Chargé en base par le seed, puis synchronisé vers les agents via /v1/agents/sync.
 * Les agents embarquent aussi cette liste comme repli au premier démarrage.
 */
export interface AIServiceDefinition {
  id: string;
  name: string;
  hostingRegion: string;
  riskBaseline: number;
  freeAccess: boolean;
  domains: string[];
  cliCommands: string[];
}

/** Patterns Chrome `matches` pour les domaines du catalogue (A1, sans reconstruire l'extension). */
export function hostPermissionMatches(domains: string[]): string[] {
  const matches = new Set<string>();
  for (const raw of domains) {
    const host = raw.replace(/^https?:\/\//, "").split("/")[0]?.toLowerCase();
    if (!host || host.includes("*") || host.includes("..") || /[^\w.-]/.test(host)) continue;
    matches.add(`https://${host}/*`);
  }
  return [...matches];
}

export const DEFAULT_AI_SERVICES: AIServiceDefinition[] = [
  {
    id: "chatgpt.com",
    name: "ChatGPT (OpenAI)",
    hostingRegion: "US",
    riskBaseline: 30,
    freeAccess: true,
    domains: ["chatgpt.com", "chat.openai.com"],
    cliCommands: ["codex"],
  },
  {
    id: "gemini.google.com",
    name: "Gemini (Google)",
    hostingRegion: "US",
    riskBaseline: 30,
    freeAccess: true,
    domains: ["gemini.google.com", "aistudio.google.com"],
    cliCommands: ["gemini"],
  },
  {
    id: "claude.ai",
    name: "Claude (Anthropic)",
    hostingRegion: "US",
    riskBaseline: 25,
    freeAccess: true,
    domains: ["claude.ai"],
    cliCommands: ["claude"],
  },
  {
    id: "copilot.microsoft.com",
    name: "Microsoft Copilot",
    hostingRegion: "US",
    riskBaseline: 25,
    freeAccess: true,
    domains: ["copilot.microsoft.com", "m365.cloud.microsoft"],
    cliCommands: ["gh-copilot", "copilot"],
  },
  {
    id: "chat.deepseek.com",
    name: "DeepSeek",
    hostingRegion: "CN",
    riskBaseline: 45,
    freeAccess: true,
    domains: ["chat.deepseek.com", "deepseek.com"],
    cliCommands: [],
  },
  {
    id: "chat.mistral.ai",
    name: "Le Chat (Mistral)",
    hostingRegion: "EU",
    riskBaseline: 20,
    freeAccess: true,
    domains: ["chat.mistral.ai"],
    cliCommands: ["vibe"],
  },
  {
    id: "perplexity.ai",
    name: "Perplexity",
    hostingRegion: "US",
    riskBaseline: 30,
    freeAccess: true,
    domains: ["perplexity.ai", "www.perplexity.ai"],
    cliCommands: [],
  },
  {
    id: "grok.com",
    name: "Grok (xAI)",
    hostingRegion: "US",
    riskBaseline: 35,
    freeAccess: true,
    domains: ["grok.com", "x.com/i/grok"],
    cliCommands: [],
  },
  {
    id: "aider",
    name: "Aider (CLI multi-fournisseurs)",
    hostingRegion: "US",
    riskBaseline: 30,
    freeAccess: true,
    domains: [],
    cliCommands: ["aider"],
  },
  {
    id: "cursor-agent",
    name: "Cursor Agent CLI",
    hostingRegion: "US",
    riskBaseline: 25,
    freeAccess: false,
    domains: [],
    cliCommands: ["cursor-agent", "agent"],
  },
];
