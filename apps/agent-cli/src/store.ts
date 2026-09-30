import { homedir } from "node:os";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AgentPersistedConfig, ConfigStore } from "@acg/agent-runtime";
import { DEFAULT_AGENT_CONFIG } from "@acg/agent-runtime";

export function configPath(): string {
  return join(homedir(), ".acg", "agent-a2.json");
}

export function queuePath(): string {
  return join(homedir(), ".acg", "queue.json");
}

export function fileConfigStore(): ConfigStore {
  return {
    async load() {
      try {
        const raw = await readFile(configPath(), "utf8");
        return { ...DEFAULT_AGENT_CONFIG, module: "A2", ...JSON.parse(raw) };
      } catch {
        return { ...DEFAULT_AGENT_CONFIG, module: "A2" };
      }
    },
    async save(config: AgentPersistedConfig) {
      await mkdir(dirname(configPath()), { recursive: true });
      await writeFile(configPath(), JSON.stringify(config, null, 2), "utf8");
    },
  };
}

export function fileQueuePersist() {
  return {
    persist: async (raw: string) => {
      await mkdir(dirname(queuePath()), { recursive: true });
      await writeFile(queuePath(), raw, "utf8");
    },
    read: async () => {
      try {
        return await readFile(queuePath(), "utf8");
      } catch {
        return null;
      }
    },
  };
}

export function shimBinDir(): string {
  return join(homedir(), ".acg", "bin");
}

export function daemonPidPath(): string {
  return join(homedir(), ".acg", "daemon.pid");
}

export function daemonLogPath(): string {
  return join(homedir(), ".acg", "daemon.log");
}

export async function isDaemonAlive(): Promise<boolean> {
  try {
    const raw = await readFile(daemonPidPath(), "utf8");
    const pid = Number(raw.trim());
    if (!Number.isInteger(pid) || pid <= 0) return false;
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function readDaemonPid(): Promise<number | null> {
  try {
    const pid = Number((await readFile(daemonPidPath(), "utf8")).trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}
