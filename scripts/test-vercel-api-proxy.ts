import { createServer } from 'node:http';
import app from '../api/index';

const server = createServer(app);
server.listen(3010, '127.0.0.1', async () => {
  try {
    const base = 'http://127.0.0.1:3010';
    const post = async (path: string, body: Record<string, unknown>) => {
      const response = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { status: response.status, data: await response.json() };
    };
    const health = await fetch(`${base}/api/health`);
    if (health.status !== 200) throw new Error(`health failed: ${health.status}`);

    const roomCode = 'VRC8M2';
    const created = await post('/api/signal/registry', { action: 'create', roomCode, peerId: 'vercel-host-1', peerName: 'Vercel Host' });
    if (created.status !== 200 || created.data.host_peer_id !== 'vercel-host-1') throw new Error(`create failed: ${JSON.stringify(created)}`);

    const duplicate = await post('/api/signal/registry', { action: 'create', roomCode: 'VR-C8-M2', peerId: 'vercel-other-2', peerName: 'Other' });
    if (duplicate.status !== 409 || duplicate.data.code !== 'ROOM_EXISTS') throw new Error(`duplicate failed: ${JSON.stringify(duplicate)}`);

    const lookup = await fetch(`${base}/api/signal/rooms/${roomCode}`);
    const lookupData = await lookup.json();
    if (lookup.status !== 200 || lookupData.peerCount !== 1) throw new Error(`lookup failed: ${JSON.stringify(lookupData)}`);

    const joined = await post('/api/signal/registry', { action: 'join', roomCode: 'VR-C8-M2', peerId: 'vercel-guest-3', peerName: 'Guest' });
    if (joined.status !== 200 || joined.data.peers.length !== 2) throw new Error(`join failed: ${JSON.stringify(joined)}`);

    await post('/api/signal/registry', { action: 'leave', roomCode, peerId: 'vercel-guest-3' });
    const closed = await post('/api/signal/registry', { action: 'leave', roomCode, peerId: 'vercel-host-1' });
    if (closed.status !== 200 || closed.data.roomClosed !== true) throw new Error(`cleanup failed: ${JSON.stringify(closed)}`);

    console.log('vercel API proxy ok');
  } finally {
    server.close();
  }
});
