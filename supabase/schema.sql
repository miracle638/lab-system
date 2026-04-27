create table if not exists public.profiles (
  id uuid primary key,
  email text unique not null,
  role text not null check (role in ('admin', 'viewer')) default 'viewer',
  created_at timestamptz not null default now()
);

create table if not exists public.labs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  college text not null,
  room_code text not null,
  value numeric(14,2) not null default 0 check (value >= 0),
  manager text not null,
  seat_count int not null check (seat_count >= 0),
  usage_area numeric(10,2) not null default 0 check (usage_area >= 0),
  building_area numeric(10,2) not null default 0 check (building_area >= 0),
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.computers (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  asset_code text not null unique,
  purchase_date date,
  cpu text not null,
  ram text not null,
  storage text not null,
  monitor text not null default '',
  c_drive_size text not null default '',
  os text not null,
  status text not null check (status in ('running', 'idle', 'fault', 'offline')),
  created_at timestamptz not null default now()
);

alter table public.labs
  add column if not exists value numeric(14,2) not null default 0;

alter table public.labs
  add column if not exists lab_number text;

alter table public.labs
  add column if not exists usage_area numeric(10,2) not null default 0;

alter table public.labs
  add column if not exists building_area numeric(10,2) not null default 0;

alter table public.computers
  add column if not exists c_drive_size text not null default '';

alter table public.computers
  add column if not exists monitor text not null default '';

alter table public.computers
  add column if not exists gpu text not null default '';

alter table public.computers
  add column if not exists other text not null default '';

alter table public.computers
  add column if not exists purchase_date date;

create table if not exists public.maintenance_records (
  id uuid primary key default gen_random_uuid(),
  computer_id uuid not null references public.computers(id) on delete cascade,
  computer_position text not null default '',
  issue_type text not null check (issue_type in ('blue_screen','black_screen','monitor_no_display','monitor_artifact','reboot_loop','stuck_logo','cannot_boot','slow_performance','network_issue','audio_issue','cannot_power_on','other')) default 'other',
  fault_nature text not null check (fault_nature in ('hardware','software','other')) default 'other',
  fault_cause text not null check (fault_cause in ('ssd','hdd','memory','mainboard','fan','monitor','power_switch','os','other')) default 'other',
  issue text not null,
  handling_method text not null default '',
  status text not null check (status in ('pending', 'in_progress', 'done')) default 'pending',
  reporter text not null,
  report_date date not null,
  resolved_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.monthly_reports (
  id uuid primary key default gen_random_uuid(),
  college text not null,
  month date not null,
  equipment_units int not null check (equipment_units >= 0),
  equipment_value numeric(14,2) not null check (equipment_value >= 0),
  usage_minutes int not null check (usage_minutes >= 0),
  active_minutes int not null check (active_minutes >= 0),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique(college, month)
);

create table if not exists public.monthly_room_reports (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  college text not null,
  room_code text not null,
  usage_minutes int not null check (usage_minutes >= 0),
  active_minutes int not null check (active_minutes >= 0),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique(month, room_code)
);

alter table public.maintenance_records
  add column if not exists computer_position text not null default '';

alter table public.maintenance_records
  add column if not exists handling_method text not null default '';

alter table public.maintenance_records
  add column if not exists issue_type text not null default 'other';

alter table public.maintenance_records
  add column if not exists fault_nature text not null default 'other';

alter table public.maintenance_records
  add column if not exists fault_cause text not null default 'other';

alter table public.maintenance_records
  drop constraint if exists maintenance_records_issue_type_check;

alter table public.maintenance_records
  add constraint maintenance_records_issue_type_check
  check (issue_type in ('blue_screen','black_screen','monitor_no_display','monitor_artifact','reboot_loop','stuck_logo','cannot_boot','slow_performance','network_issue','audio_issue','cannot_power_on','other'));

alter table public.maintenance_records
  drop constraint if exists maintenance_records_fault_cause_check;

alter table public.maintenance_records
  add constraint maintenance_records_fault_cause_check
  check (fault_cause in ('ssd','hdd','memory','mainboard','fan','monitor','power_switch','os','other'));

alter table public.profiles enable row level security;
alter table public.labs enable row level security;
alter table public.computers enable row level security;
alter table public.maintenance_records enable row level security;
alter table public.monthly_reports enable row level security;
alter table public.monthly_room_reports enable row level security;

drop policy if exists "viewer_can_read_profiles" on public.profiles;
create policy "viewer_can_read_profiles" on public.profiles
  for select using (true);

drop policy if exists "viewer_can_read_labs" on public.labs;
create policy "viewer_can_read_labs" on public.labs
  for select using (true);

drop policy if exists "viewer_can_read_computers" on public.computers;
create policy "viewer_can_read_computers" on public.computers
  for select using (true);

drop policy if exists "viewer_can_read_maintenance" on public.maintenance_records;
create policy "viewer_can_read_maintenance" on public.maintenance_records
  for select using (true);

drop policy if exists "viewer_can_read_reports" on public.monthly_reports;
create policy "viewer_can_read_reports" on public.monthly_reports
  for select using (true);

drop policy if exists "viewer_can_read_room_reports" on public.monthly_room_reports;
create policy "viewer_can_read_room_reports" on public.monthly_room_reports
  for select using (true);

drop policy if exists "admin_can_modify_labs" on public.labs;
create policy "admin_can_modify_labs" on public.labs
  for all using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  )) with check (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

drop policy if exists "admin_can_modify_computers" on public.computers;
create policy "admin_can_modify_computers" on public.computers
  for all using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  )) with check (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

drop policy if exists "admin_can_modify_maintenance" on public.maintenance_records;
create policy "admin_can_modify_maintenance" on public.maintenance_records
  for all using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  )) with check (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

drop policy if exists "admin_can_modify_reports" on public.monthly_reports;
create policy "admin_can_modify_reports" on public.monthly_reports
  for all using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  )) with check (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

drop policy if exists "admin_can_modify_room_reports" on public.monthly_room_reports;
create policy "admin_can_modify_room_reports" on public.monthly_room_reports
  for all using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  )) with check (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));
