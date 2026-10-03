-- Business Village: contact requests, email logs, booking messages

create table public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 200),
  email text not null check (length(email) between 3 and 254),
  company text,
  phone text,
  message text not null check (length(message) between 1 and 5000),
  status text not null default 'new' check (status in ('new', 'in_progress', 'resolved')),
  admin_notes text not null default '',
  locale text not null default 'de' check (locale in ('de', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contact_requests_created_idx on public.contact_requests (created_at desc);
create trigger contact_requests_touch before update on public.contact_requests
  for each row execute function private.touch_updated_at();

create table public.email_logs (
  id uuid primary key default gen_random_uuid(),
  recipient text not null,
  email_type text not null,
  subject text not null,
  locale text check (locale in ('de', 'en')),
  related_booking_id uuid references public.bookings (id) on delete set null,
  related_contact_request_id uuid references public.contact_requests (id) on delete set null,
  provider text not null default 'resend',
  provider_message_id text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error_message text,
  body_html text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index email_logs_created_idx on public.email_logs (created_at desc);
create index email_logs_booking_idx on public.email_logs (related_booking_id);
create trigger email_logs_touch before update on public.email_logs
  for each row execute function private.touch_updated_at();

create table public.booking_messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings (id) on delete cascade,
  sender_email text not null,
  sender_name text,
  subject text not null default '',
  message text not null default '',
  direction text not null check (direction in ('inbound', 'outbound')),
  provider_message_id text unique,
  created_at timestamptz not null default now()
);
create index booking_messages_booking_idx on public.booking_messages (booking_id, created_at);

alter table public.contact_requests enable row level security;
alter table public.email_logs enable row level security;
alter table public.booking_messages enable row level security;

-- Inquiries are submitted only through the server-side form endpoint
-- (service role); the API roles can never read them unless admin.
create policy "contact: admin read" on public.contact_requests for select to authenticated
  using ((select public.is_admin()));
create policy "contact: admin update" on public.contact_requests for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "contact: admin delete" on public.contact_requests for delete to authenticated
  using ((select public.is_admin()));
revoke insert on public.contact_requests from anon, authenticated;

create policy "email_logs: admin read" on public.email_logs for select to authenticated
  using ((select public.is_admin()));
revoke insert, update, delete on public.email_logs from anon, authenticated;

create policy "booking_messages: admin read" on public.booking_messages for select to authenticated
  using ((select public.is_admin()));
revoke insert, update, delete on public.booking_messages from anon, authenticated;
