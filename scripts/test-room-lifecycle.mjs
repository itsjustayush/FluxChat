import WebSocket from 'ws';

const base = 'http://127.0.0.1:3000';
const roomCode = 'ab-12-cd';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function openPeer(peerId, isHost) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:3000/ws');
    const messages = [];
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'join', roomId: roomCode, peerId, isHost, timestamp: Date.now() }));
      resolve({ ws, messages });
    });
    ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
    ws.on('error', reject);
  });
}

async function lookup() {
  const response = await fetch(`${base}/api/signal/rooms/AB12CD`);
  return { status: response.status, body: await response.json() };
}

const host = await openPeer('host-test-1', true);
await wait(100);
const hostRoom = await lookup();
if (hostRoom.status !== 200 || hostRoom.body.hostPeerId !== 'host-test-1' || hostRoom.body.peerCount !== 1) {
  throw new Error(`Host room lookup failed: ${JSON.stringify(hostRoom)}`);
}

const guest = await openPeer('guest-test-2', false);
await wait(150);
const joinedRoom = await lookup();
if (joinedRoom.status !== 200 || joinedRoom.body.peerCount !== 2 || !joinedRoom.body.peers.includes('guest-test-2')) {
  throw new Error(`Guest was not mapped to the existing room: ${JSON.stringify(joinedRoom)}`);
}

const joinedNotice = host.messages.some((message) => message.type === 'room_state' && message.data?.event === 'peer_joined' && message.data?.peerId === 'guest-test-2');
if (!joinedNotice) throw new Error('Host did not receive the guest peer_joined notice.');

guest.ws.send(JSON.stringify({ type: 'leave', roomId: roomCode, peerId: 'guest-test-2', timestamp: Date.now() }));
await wait(120);
const afterGuestLeave = await lookup();
if (afterGuestLeave.status !== 200 || afterGuestLeave.body.peerCount !== 1 || afterGuestLeave.body.peers.includes('guest-test-2')) {
  throw new Error(`Guest leave cleanup failed: ${JSON.stringify(afterGuestLeave)}`);
}

host.ws.send(JSON.stringify({ type: 'leave', roomId: roomCode, peerId: 'host-test-1', timestamp: Date.now() }));
await wait(120);
const afterAllLeave = await lookup();
if (afterAllLeave.status !== 404 || afterAllLeave.body.active !== false) {
  throw new Error(`Empty room was not pruned: ${JSON.stringify(afterAllLeave)}`);
}

guest.ws.close();
host.ws.close();
console.log('room lifecycle ok');
