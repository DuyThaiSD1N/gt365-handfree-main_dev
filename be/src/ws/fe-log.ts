import type { Request, Response, RequestHandler } from 'express';

export function feLogHandler(): RequestHandler {
  return (req: Request, res: Response) => {
    const body = req.body as { event?: string; data?: unknown } | undefined;
    if (body && typeof body.event === 'string') {
      const payload = body.data !== undefined ? ` ${JSON.stringify(body.data)}` : '';
      console.log(`[fe] ${body.event}${payload}`);
    }
    res.status(204).end();
  };
}
