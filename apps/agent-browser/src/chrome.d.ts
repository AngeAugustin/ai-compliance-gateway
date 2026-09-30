declare const chrome: {
  storage: { local: { get: (k: string) => Promise<Record<string, unknown>>; set: (v: Record<string, unknown>) => Promise<void> } };
  runtime: {
    id?: string;
    onInstalled: { addListener: (fn: () => void) => void };
    onStartup: { addListener: (fn: () => void) => void };
    onMessage: {
      addListener: (fn: (msg: Record<string, unknown>, s: unknown, send: (v: unknown) => void) => boolean | void) => void;
    };
    sendMessage: (msg: unknown) => Promise<unknown>;
  };
  alarms: {
    create: (name: string, opts: { periodInMinutes: number }) => void;
    onAlarm: { addListener: (fn: (a: { name: string }) => void) => void };
  };
  permissions: {
    request: (p: { origins?: string[]; permissions?: string[] }) => Promise<boolean>;
    contains: (p: { origins?: string[] }) => Promise<boolean>;
  };
  scripting: {
    registerContentScripts: (
      scripts: Array<{
        id: string;
        js: string[];
        matches: string[];
        runAt?: "document_start" | "document_idle" | "document_end";
        world?: "ISOLATED" | "MAIN";
        persistAcrossSessions?: boolean;
      }>,
    ) => Promise<void>;
    unregisterContentScripts: (filter?: { ids?: string[] }) => Promise<void>;
    executeScript: (opts: { target: { tabId: number }; files?: string[]; world?: "ISOLATED" | "MAIN" }) => Promise<unknown>;
  };
  tabs: {
    query: (q: Record<string, unknown>) => Promise<Array<{ id?: number; url?: string }>>;
  };
};
