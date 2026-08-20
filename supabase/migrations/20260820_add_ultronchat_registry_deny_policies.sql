drop policy if exists ultronchat_rooms_no_direct_access on public.ultronchat_rooms;
create policy ultronchat_rooms_no_direct_access
  on public.ultronchat_rooms
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists ultronchat_room_peers_no_direct_access on public.ultronchat_room_peers;
create policy ultronchat_room_peers_no_direct_access
  on public.ultronchat_room_peers
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists ultronchat_room_events_no_direct_access on public.ultronchat_room_events;
create policy ultronchat_room_events_no_direct_access
  on public.ultronchat_room_events
  for all
  to anon, authenticated
  using (false)
  with check (false);
