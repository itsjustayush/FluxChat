import express from 'express';
import { getSignalingServer } from '../src/server/signalServer';

const app = express();
app.use(express.json());

const signalingServer = getSignalingServer();
app.use('/api/signal', signalingServer.getApp());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

export default app;
