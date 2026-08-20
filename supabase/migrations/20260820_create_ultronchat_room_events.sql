create table if not exists public.ultronchat_room_events (
  id bigint generated always as identity primary key,
  room_code text not null references public.ultronchat_rooms(room_code) on delete cascade,
  target_peer_id text not null,
  sender_peer_id text not null,
  message_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null default (timezone('utc', now()) + interval '30 seconds'),
  constraint ultronchat_events_target_format check (char_length(target_peer_id) between 3 and 80),
  constraint ultronchat_events_sender_format check (char_length(sender_peer_id) between 3 and 80),
  constraint ultronchat_events_type_length check (char_length(message_type) between 1 and 32)
);

create index if not exists ultronchat_room_events_target_idx
  on public.ultronchat_room_events (target_peer_id, created_at);

create index if not exists ultronchat_room_events_expires_idx
  on public.ultronchat_room_events (expires_at);

alter table public.ultronchat_room_events enable row level security;
revoke all on table public.ultronchat_room_events from anon, authenticated;
