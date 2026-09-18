-- Suivi matériel RBF - Schéma Supabase complet
-- À exécuter une seule fois dans Supabase > SQL Editor > New query.

create extension if not exists pgcrypto;

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('depot', 'chantier')),
  address text not null default '',
  manager text not null default '',
  status text not null default 'active' check (status in ('active', 'archive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  tracking_group_id uuid not null default gen_random_uuid(),
  name text not null,
  category text not null default 'Autre',
  description text not null default '',
  serial_number text not null default '',
  quantity integer not null default 1 check (quantity > 0),
  unit text not null default 'pièce',
  status text not null default 'disponible'
    check (status in ('disponible', 'chantier', 'reparation', 'controle')),
  location_id uuid not null references public.locations(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.movements (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null,
  tracking_group_id uuid not null,
  material_name text not null,
  from_location_id uuid references public.locations(id),
  to_location_id uuid not null references public.locations(id),
  quantity integer not null check (quantity > 0),
  movement_type text not null
    check (movement_type in ('ajout', 'transfert', 'retour', 'reparation')),
  note text not null default '',
  actor text not null default 'Utilisateur',
  moved_at timestamptz not null default now()
);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null,
  tracking_group_id uuid not null,
  document_type text not null
    check (document_type in ('facture_achat', 'facture_reparation', 'fiche_suivi', 'autre')),
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0,
  uploaded_at timestamptz not null default now()
);

create index if not exists idx_locations_status_type on public.locations(status, type);
create index if not exists idx_materials_location on public.materials(location_id);
create index if not exists idx_materials_tracking_group on public.materials(tracking_group_id);
create index if not exists idx_materials_category on public.materials(category);
create index if not exists idx_movements_tracking_date on public.movements(tracking_group_id, moved_at desc);
create index if not exists idx_movements_date on public.movements(moved_at desc);
create index if not exists idx_attachments_tracking on public.attachments(tracking_group_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists locations_set_updated_at on public.locations;
create trigger locations_set_updated_at
before update on public.locations
for each row execute function public.set_updated_at();

drop trigger if exists materials_set_updated_at on public.materials;
create trigger materials_set_updated_at
before update on public.materials
for each row execute function public.set_updated_at();

-- Transfert atomique : protège les quantités et enregistre toujours le mouvement.
create or replace function public.transfer_material(
  p_material_id uuid,
  p_destination_id uuid,
  p_quantity integer,
  p_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_material public.materials%rowtype;
  v_destination public.locations%rowtype;
  v_destination_material_id uuid;
  v_status text;
  v_type text;
  v_actor text;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;

  select * into v_material from public.materials where id = p_material_id for update;
  if not found then raise exception 'Matériel introuvable'; end if;

  select * into v_destination from public.locations
  where id = p_destination_id and status = 'active';
  if not found then raise exception 'Destination introuvable ou archivée'; end if;

  if v_material.location_id = p_destination_id then
    raise exception 'Le matériel se trouve déjà à cet emplacement';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > v_material.quantity then
    raise exception 'Quantité de transfert incorrecte';
  end if;

  v_status := case when v_destination.type = 'chantier' then 'chantier' else 'disponible' end;
  v_type := case when v_destination.type = 'depot' then 'retour' else 'transfert' end;
  v_actor := coalesce(auth.jwt() ->> 'email', 'Utilisateur');

  if p_quantity = v_material.quantity then
    update public.materials
    set location_id = p_destination_id, status = v_status
    where id = v_material.id;
    v_destination_material_id := v_material.id;
  else
    update public.materials
    set quantity = quantity - p_quantity
    where id = v_material.id;

    insert into public.materials (
      tracking_group_id, name, category, description, serial_number,
      quantity, unit, status, location_id
    ) values (
      v_material.tracking_group_id, v_material.name, v_material.category,
      v_material.description, v_material.serial_number, p_quantity,
      v_material.unit, v_status, p_destination_id
    ) returning id into v_destination_material_id;
  end if;

  insert into public.movements (
    material_id, tracking_group_id, material_name, from_location_id,
    to_location_id, quantity, movement_type, note, actor
  ) values (
    v_destination_material_id, v_material.tracking_group_id, v_material.name,
    v_material.location_id, p_destination_id, p_quantity, v_type,
    coalesce(p_note, ''), v_actor
  );

  return v_destination_material_id;
end;
$$;

revoke all on function public.transfer_material(uuid, uuid, integer, text) from public;
grant execute on function public.transfer_material(uuid, uuid, integer, text) to authenticated;

alter table public.locations enable row level security;
alter table public.materials enable row level security;
alter table public.movements enable row level security;
alter table public.attachments enable row level security;

drop policy if exists "authenticated_locations" on public.locations;
create policy "authenticated_locations" on public.locations
for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_materials" on public.materials;
create policy "authenticated_materials" on public.materials
for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_movements" on public.movements;
create policy "authenticated_movements" on public.movements
for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_attachments" on public.attachments;
create policy "authenticated_attachments" on public.attachments
for all to authenticated using (true) with check (true);

insert into storage.buckets (id, name, public, file_size_limit)
values ('materiel-documents', 'materiel-documents', false, 15728640)
on conflict (id) do update set public = false, file_size_limit = 15728640;

drop policy if exists "authenticated_documents_select" on storage.objects;
create policy "authenticated_documents_select" on storage.objects
for select to authenticated using (bucket_id = 'materiel-documents');

drop policy if exists "authenticated_documents_insert" on storage.objects;
create policy "authenticated_documents_insert" on storage.objects
for insert to authenticated with check (bucket_id = 'materiel-documents');

drop policy if exists "authenticated_documents_update" on storage.objects;
create policy "authenticated_documents_update" on storage.objects
for update to authenticated using (bucket_id = 'materiel-documents')
with check (bucket_id = 'materiel-documents');

drop policy if exists "authenticated_documents_delete" on storage.objects;
create policy "authenticated_documents_delete" on storage.objects
for delete to authenticated using (bucket_id = 'materiel-documents');

-- Emplacements de départ. Ils restent modifiables dans l'application.
insert into public.locations (id, name, type, address, manager, status)
values
  ('00000000-0000-4000-8000-000000000001', 'Dépôt principal', 'depot', '', '', 'active'),
  ('00000000-0000-4000-8000-000000000002', 'Chantier Saskya', 'chantier', '351 route du Grand Massif, 74340 Samoëns', '', 'active')
on conflict (id) do nothing;

analyze public.locations;
analyze public.materials;
analyze public.movements;
analyze public.attachments;
