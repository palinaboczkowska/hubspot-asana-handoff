export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** JSON request with a bearer token. Any non-2xx throws, so the job queue retries it. */
export async function requestJson<T>(
  url: string,
  token: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new HttpError(
      response.status,
      `${init.method ?? "GET"} ${new URL(url).pathname} returned ${response.status}: ${text.slice(0, 200)}`,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
