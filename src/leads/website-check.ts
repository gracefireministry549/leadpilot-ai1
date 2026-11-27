export interface WebsiteCheck {
  status: 'REACHABLE' | 'UNREACHABLE' | 'INVALID' | 'NOT_CHECKED';
  httpStatus?: number;
  detail: string;
}

export function validateWebsiteUrl(value?: string): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url;
  } catch {
    return null;
  }
}

/** Fast, bounded reachability check. Discovery must never wait on a slow website. */
export async function checkWebsite(value?: string, timeoutMs = 1500): Promise<WebsiteCheck> {
  const url = validateWebsiteUrl(value);
  if (!url) return { status: value ? 'INVALID' : 'NOT_CHECKED', detail: value ? 'Invalid HTTP(S) URL.' : 'No website supplied.' };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Follow redirects: http→https and bare-domain→www 301/302s are the norm
    // for real small-business sites and must not be scored as unreachable.
    const response = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal });
    return {
      status: response.ok ? 'REACHABLE' : 'UNREACHABLE',
      httpStatus: response.status,
      detail: response.ok ? 'Website responded successfully to the reachability check.' : `Website returned HTTP ${response.status}.`,
    };
  } catch {
    return { status: 'UNREACHABLE', detail: 'Website could not be reached within the configured timeout.' };
  } finally {
    clearTimeout(timeout);
  }
}
