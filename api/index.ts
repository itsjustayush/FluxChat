import express from 'express';
import { getSignalingServer } from '../src/server/signalServer';

const app = express();
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' ws: wss:; form-action 'self'");
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(express.json({ limit: '256kb' }));

const signalingServer = getSignalingServer();
app.use('/api/signal', signalingServer.getApp());
app.get('/api/health', (_req, res) => res.json({ status: 'ok', timestamp: Date.now() }));

export default app;
