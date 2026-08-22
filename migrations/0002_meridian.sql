create table if not exists holdings (
  id            serial primary key,
  user_id       text not null,
  symbol        text not null,
  company_name  text not null default '',
  qty           double precision not null default 0,
  avg_cost      double precision not null default 0,
  last_price    double precision not null default 0,
  instrument    text not null default 'equity',
  account_name  text not null default 'Core',
  created_at    timestamptz not null default now()
);
create index if not exists holdings_user_id_idx on holdings (user_id);

create table if not exists paper_positions (
  id                serial primary key,
  user_id           text not null,
  symbol            text not null,
  qty               double precision not null,
  entry_price       double precision not null,
  entry_ts          timestamptz not null default now(),
  stop_pct          double precision not null,
  size_pct          double precision not null,
  meta_prob         double precision not null,
  high_since_entry  double precision not null,
  status            text not null default 'open',
  exit_price        double precision,
  exit_reason       text,
  pnl               double precision not null default 0,
  updated_at        timestamptz not null default now()
);
create index if not exists paper_positions_user_idx on paper_positions (user_id, status);

create table if not exists research_runs (
  id          serial primary key,
  user_id     text not null,
  query       text not null,
  result_json text not null,
  created_at  timestamptz not null default now()
);
create index if not exists research_runs_user_idx on research_runs (user_id, created_at desc);

create table if not exists desk_state (
  user_id    text primary key,
  mode       text not null default 'advisory',
  killed     boolean not null default false,
  daily_pnl  double precision not null default 0,
  updated_at timestamptz not null default now()
);
