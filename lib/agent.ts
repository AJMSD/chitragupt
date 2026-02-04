const DEFAULT_AGENT_URL = "http://127.0.0.1:7777";
const AGENT_TOKEN = process.env.AGENT_TOKEN ?? "";
const AGENT_TOKEN_HEADER = (
  process.env.AGENT_TOKEN_HEADER ?? "x-agent-token"
).toLowerCase();
const AGENT_PRIVATE_HEADER = (
  process.env.AGENT_PRIVATE_HEADER ?? "x-ajmsd-private"
).toLowerCase();
const AGENT_PRIVATE_VALUE = process.env.AGENT_PRIVATE_VALUE ?? "1";

export function getAgentBaseUrl(): string {
  const raw = process.env.AGENT_URL ?? DEFAULT_AGENT_URL;
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

type AgentFetchSuccess<T> = {
  ok: true;
  status: number;
  data: T;
};

type AgentFetchFailure = {
  ok: false;
  status: number;
  error: string;
};

type AgentFetchOptions = {
  private?: boolean;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

export function getPrivateAgentHeaders(): Record<string, string> {
  if (!AGENT_TOKEN) return {};
  return {
    [AGENT_TOKEN_HEADER]: AGENT_TOKEN,
    [AGENT_PRIVATE_HEADER]: AGENT_PRIVATE_VALUE,
  };
}

export async function agentFetchJson<T>(
  path: string,
  options: AgentFetchOptions = {}
): Promise<AgentFetchSuccess<T> | AgentFetchFailure> {
  const baseUrl = getAgentBaseUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(normalizedPath, baseUrl);
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options.private ? getPrivateAgentHeaders() : {}),
    ...(options.headers ?? {}),
  };
  const timeoutMs = options.timeoutMs ?? 4000;

  const fetchOnce = async (): Promise<AgentFetchSuccess<T> | AgentFetchFailure> => {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
        headers,
      });

      const contentType = response.headers.get("content-type") ?? "";
      const isJson = contentType.includes("application/json");
      const payload = isJson ? await response.json() : await response.text();

      if (!response.ok) {
        const message =
          typeof payload === "string"
            ? payload
            : payload?.error ?? "Agent request failed";
        return { ok: false, status: response.status, error: message };
      }

      return { ok: true, status: response.status, data: payload as T };
    } catch {
      return { ok: false, status: 502, error: "Agent unavailable" };
    }
  };

  let lastError: AgentFetchFailure = {
    ok: false,
    status: 502,
    error: "Agent unavailable",
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await fetchOnce();
    if (result.ok) {
      return result;
    }

    lastError = result;

    if (result.status < 500) {
      return result;
    }
  }

  return lastError;
}

