-- Migration to store Web Push subscriptions per user device and deduplicate notifications
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for querying subscriptions by user
create index if not exists idx_push_subscriptions_user_id on push_subscriptions(user_id);

-- Push notification logs for strict deduplication
create table if not exists push_notification_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dedup_key text not null unique,
  type text not null, -- 'invoice' | 'recurrence'
  entity_id text,
  target_date date,
  stage text not null, -- '3_days_before' | 'due_day'
  title text not null,
  body text not null,
  sent_at timestamptz not null default now()
);

-- Index for dedup querying
create index if not exists idx_push_notification_logs_user_id on push_notification_logs(user_id);
create index if not exists idx_push_notification_logs_dedup on push_notification_logs(dedup_key);

-- Enable RLS
alter table push_subscriptions enable row level security;
alter table push_notification_logs enable row level security;

-- RLS policies for push_subscriptions
create policy "Users can view their own push subscriptions"
  on push_subscriptions for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can insert their own push subscriptions"
  on push_subscriptions for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can update their own push subscriptions"
  on push_subscriptions for update
  to authenticated
  using (user_id = auth.uid());

create policy "Users can delete their own push subscriptions"
  on push_subscriptions for delete
  to authenticated
  using (user_id = auth.uid());

-- RLS policies for push_notification_logs
create policy "Users can view their own push notification logs"
  on push_notification_logs for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can insert push notification logs"
  on push_notification_logs for insert
  to authenticated
  with check (user_id = auth.uid());
