create table if not exists public.ultronchat_rooms (
  room_code text primary key,
  host_peer_id text not null,
  created_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null default (timezone('utc', now()) + interval '90 seconds'),
  constraint ultronchat_rooms_code_format check (room_code ~ '^[A-Z0-9]{6}$'),
  constraint ultronchat_rooms_host_format check (char_length(host_peer_id) between 3 and 80)
);

create table if not exists public.ultronchat_room_peers (
  room_code text not null references public.ultronchat_rooms(room_code) on delete cascade,
  peer_id text not null,
  peer_name text not null default 'Guest',
  is_host boolean not null default false,
  joined_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null default (timezone('utc', now()) + interval '90 seconds'),
  primary key (room_code, peer_id),
  constraint ultronchat_peers_id_format check (char_length(peer_id) between 3 and 80),
  constraint ultronchat_peers_name_length check (char_length(peer_name) between 1 and 32)
);

create index if not exists ultronchat_rooms_expires_at_idx
  on public.ultronchat_rooms (expires_at);

create index if not exists ultronchat_room_peers_expires_at_idx
  on public.ultronchat_room_peers (expires_at);

create index if not exists ultronchat_room_peers_room_code_idx
  on public.ultronchat_room_peers (room_code);

alter table public.ultronchat_rooms enable row level security;
alter table public.ultronchat_room_peers enable row level security;

revoke all on table public.ultronchat_rooms from anon, authenticated;
revoke all on table public.ultronchat_room_peers from anon, authenticated;
