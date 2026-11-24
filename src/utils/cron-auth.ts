export function authorizeCronRequest(authorization: string | null, secret: string | undefined) {
    const configuredSecret = secret?.trim();
    if (!configuredSecret) return { ok: false as const, status: 503, error: 'Cron authentication is not configured' };
    if (authorization !== `Bearer ${configuredSecret}`) {
        return { ok: false as const, status: 401, error: 'Unauthorized' };
    }
    return { ok: true as const };
}
