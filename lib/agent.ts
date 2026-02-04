const DEFAULT_AGENT_URL = "http://127.0.0.1:7777";

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

export async function agentFetchJson<T>(
  path: string
): Promise<AgentFetchSuccess<T> | AgentFetchFailure> {
  const baseUrl = getAgentBaseUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(normalizedPath, baseUrl);

  const fetchOnce = async (): Promise<AgentFetchSuccess<T> | AgentFetchFailure> => {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
        headers: {
          Accept: "application/json",
        },
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

