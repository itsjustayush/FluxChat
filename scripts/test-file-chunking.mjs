import { createHash, randomBytes } from 'node:crypto';

const CHUNK_SIZE = 8 * 1024;
const file = randomBytes(20 * 1024 * 1024 + 137);
const originalHash = createHash('sha256').update(file).digest('hex');
const packets = [];
let maxPacketBytes = 0;

for (let offset = 0, index = 0; offset < file.length; offset += CHUNK_SIZE, index += 1) {
  const payload = file.subarray(offset, Math.min(offset + CHUNK_SIZE, file.length)).toString('base64');
  const packet = JSON.stringify({ type: 'FILE_CHUNK', fileId: 'chunk-test', index, totalChunks: Math.ceil(file.length / CHUNK_SIZE), payload });
  packets.push({ index, payload });
  maxPacketBytes = Math.max(maxPacketBytes, Buffer.byteLength(packet));
}

const reassembled = Buffer.concat(packets.sort((a, b) => a.index - b.index).map(({ payload }) => Buffer.from(payload, 'base64')));
const reassembledHash = createHash('sha256').update(reassembled).digest('hex');
if (reassembled.length !== file.length || originalHash !== reassembledHash) {
  throw new Error('chunk reassembly hash or size mismatch');
}
if (maxPacketBytes >= 16 * 1024) {
  throw new Error(`chunk packet exceeds conservative RTCDataChannel limit: ${maxPacketBytes} bytes`);
}
console.log(JSON.stringify({ ok: true, fileBytes: file.length, chunks: packets.length, maxPacketBytes, sha256: reassembledHash }));
