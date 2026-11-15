export interface EmailMessage { to: string; subject: string; text: string; }
export interface EmailProvider {
  send(message: EmailMessage, options?: { idempotencyKey?: string }): Promise<{ id: string }>;
}

export class ResendEmailProvider implements EmailProvider {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: EmailMessage, options: { idempotencyKey?: string } = {}) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

    const response = await this.fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(typeof data?.message === 'string' ? data.message : `Email provider failed (${response.status})`);
    }
    return { id: String(data?.id ?? 'unknown') };
  }
}

export function configuredEmailProvider(): EmailProvider | null {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.OUTREACH_FROM_EMAIL?.trim();
  return key && from ? new ResendEmailProvider(key, from) : null;
}
