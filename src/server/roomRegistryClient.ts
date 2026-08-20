const DEFAULT_REGISTRY_URL = 'https://qdsdjgfvimuvdujxouab.supabase.co/functions/v1/ultronchat-room-registry';
const DEFAULT_REGISTRY_KEY = 'sb_publishable_A7yz0fKFeFAS1ChBcF0TUg_pcPE_hh1';
const MAX_REGISTRY_BYTES = 64 * 1024;

export interface RegistryPeer {
  peer_id: string;
  peer_name: string;
  is_host: boolean;
  joined_at: string;
  last_seen_at: string;
  expires_at: string;
}

export interface RegistryRoom {
  active: boolean;
  room_code?: string;
  host_peer_id?: string;
  created_at?: string;
  last_seen_at?: string;
  expires_at?: string;
  peers?: RegistryPeer[];
  error?: string;
  code?: string;
  [key: string]: unknown;
}

const registryUrl = () => process.env.ULTRONCHAT_ROOM_REGISTRY_URL || DEFAULT_REGISTRY_URL;
const registryKey = () => process.env.ULTRONCHAT_ROOM_REGISTRY_KEY || DEFAULT_REGISTRY_KEY;

export async function roomRegistry(action: string, payload: Record<string, unknown>): Promise<RegistryRoom & { messages?: unknown[] }> {
  const body = JSON.stringify({ action, ...payload });
  if (body.length > MAX_REGISTRY_BYTES) throw new Error('Room registry payload is too large');

  const response = await fetch(registryUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: registryKey(),
    },
    body,
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
