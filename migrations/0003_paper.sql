create table if not exists paper_fills (
  id text primary key,
  ts timestamptz not null default now(),
  symbol text not null,
  side text not null,
  qty double precision not null,
  price double precision not null,
  reason text not null,
  meta_prob double precision,
  pnl double precision
);

create index if not exists paper_fills_ts on paper_fills (ts desc);

create table if not exists paper_samples (
  id text primary key,
  ts_open timestamptz not null,
  ts_close timestamptz not null,
  symbol text not null,
  side text not null,
  qty double precision not null,
  entry double precision not null,
  exit double precision not null,
  pnl double precision not null,
  hold_sec double precision not null,
  fwd_ret double precision not null,
  reason_open text not null,
  reason_close text not null,
  meta_prob double precision not null,
  confidence double precision,
  confluence double precision,
  p_success double precision,
  atr_pct double precision,
  score double precision,
  features jsonb
);

create index if not exists paper_samples_ts on paper_samples (ts_close desc);
