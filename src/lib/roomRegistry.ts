export interface RoomRegistryPeer {
  peer_id: string;
  peer_name: string;
  is_host: boolean;
}

export interface RoomRegistryState {
  active: boolean;
  created?: boolean;
  joined?: boolean;
  room_code?: string;
  host_peer_id?: string;
  peers?: RoomRegistryPeer[];
  messages?: Array<{ type: string; peerId?: string; data?: unknown; timestamp?: number }>;
  error?: string;
}

export async function callRoomRegistry(action: string, payload: Record<string, unknown> = {}): Promise<RoomRegistryState> {
  const response = await fetch('/api/signal/registry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(typeof data?.error === 'string' ? data.error : 'Room registry request failed') as Error & { status?: number; code?: string };
    error.status = response.status;
    error.code = data?.code;
    throw error;
  }
  return data;
}
