import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../supabase/functions/ultronchat-room-registry/', import.meta.url);
const files = ['index.ts', 'deno.json'].map((name) => ({
  name,
  content: readFileSync(new URL(name, root), 'utf8'),
}));
writeFileSync(new URL('../supabase/deploy-room-registry.json', import.meta.url), JSON.stringify({
  project_id: 'qdsdjgfvimuvdujxouab',
  name: 'ultronchat-room-registry',
  entrypoint_path: 'index.ts',
  verify_jwt: false,
  files,
}));
