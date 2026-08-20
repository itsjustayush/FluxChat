const base = 'http://127.0.0.1:3000/api/signal/registry';
const roomCode = 'DB9J4P';
const hostId = 'db-reg-host';
const guestId = 'db-reg-guest';

async function call(action, payload = {}) {
  const response = await fetch(base, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await response.json();
  return { status: response.status, data };
}

async function lookup() {
  const response = await fetch(`http://127.0.0.1:3000/api/signal/rooms/${roomCode}`);
  return { status: response.status, data: await response.json() };
}

try {
  const created = await call('create', { roomCode, peerId: hostId, peerName: 'Registry Host' });
  if (created.status !== 200 || created.data.host_peer_id !== hostId) throw new Error(`create failed: ${JSON.stringify(created)}`);

  const duplicate = await call('create', { roomCode: 'DB-9J-4P', peerId: 'db-duplicate', peerName: 'Duplicate Attempt' });
  if (duplicate.status !== 409 || duplicate.data.code !== 'ROOM_EXISTS') throw new Error(`duplicate room creation was not rejected: ${JSON.stringify(duplicate)}`);

  const joined = await call('join', { roomCode: 'DB-9J-4P', peerId: guestId, peerName: 'Registry Guest' });
  if (joined.status !== 200 || joined.data.peers.length !== 2) throw new Error(`join failed: ${JSON.stringify(joined)}`);

  const hostEvents = await call('poll', { roomCode, peerId: hostId });
  if (!hostEvents.data.messages.some((message) => message.type === 'room_state' && message.data?.event === 'peer_joined' && message.data?.peerId === guestId)) {
    throw new Error(`join event missing: ${JSON.stringify(hostEvents)}`);
  }

  const sent = await call('signal', { roomCode, peerId: guestId, type: 'chat', data: { id: 'registry-chat-1', text: 'shared' } });
  if (sent.status !== 200 || sent.data.delivered !== 1) throw new Error(`signal failed: ${JSON.stringify(sent)}`);

  const delivered = await call('poll', { roomCode, peerId: hostId });
  if (!delivered.data.messages.some((message) => message.type === 'chat' && message.peerId === guestId && message.data?.text === 'shared')) {
    throw new Error(`signal delivery missing: ${JSON.stringify(delivered)}`);
  }

  const heartbeat = await call('heartbeat', { roomCode, peerId: guestId });
  if (heartbeat.status !== 200 || heartbeat.data.active !== true) throw new Error(`heartbeat failed: ${JSON.stringify(heartbeat)}`);

  const guestLeft = await call('leave', { roomCode, peerId: guestId });
  if (guestLeft.status !== 200 || guestLeft.data.active !== true) throw new Error(`guest leave failed: ${JSON.stringify(guestLeft)}`);

  const afterGuestLeave = await lookup();
  if (afterGuestLeave.status !== 200 || afterGuestLeave.data.peerCount !== 1) throw new Error(`guest mapping remained: ${JSON.stringify(afterGuestLeave)}`);

  const hostLeft = await call('leave', { roomCode, peerId: hostId });
  if (hostLeft.status !== 200 || hostLeft.data.roomClosed !== true) throw new Error(`host leave failed: ${JSON.stringify(hostLeft)}`);

  const afterAllLeave = await lookup();
  if (afterAllLeave.status !== 404 || afterAllLeave.data.active !== false) throw new Error(`room was not deleted: ${JSON.stringify(afterAllLeave)}`);

  console.log('database room registry ok');
} finally {
  await call('leave', { roomCode, peerId: guestId }).catch(() => {});
  await call('leave', { roomCode, peerId: hostId }).catch(() => {});
}
