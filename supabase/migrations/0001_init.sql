-- Core tables (normalized schema) matching app expectations
create extension if not exists pgcrypto;

create table if not exists company_details (
  company_id uuid primary key default gen_random_uuid(),
  company_name text,
  company_description text,
  website_url text,
  posts_per_week int,
  inserted_at timestamptz default now()
);

create table if not exists subreddits (
  subreddit_id uuid primary key default gen_random_uuid(),
  company_id uuid references company_details(company_id) on delete cascade,
  subreddit_name text not null
);

create table if not exists personas (
  persona_username text primary key,
  company_id uuid references company_details(company_id) on delete cascade,
  persona_description text,
  created_at timestamptz default now()
);

create table if not exists chatgpt_queries (
  keyword_id text primary key,
  company_id uuid references company_details(company_id) on delete cascade,
  keyword_phrase text,
  embedding_vector vector(384),
  created_at timestamptz default now()
);

create table if not exists calendar_posts (
  post_id uuid primary key default gen_random_uuid(),
  company_id uuid references company_details(company_id),
  subreddit_id uuid references subreddits(subreddit_id),
  persona_username text references personas(persona_username),
  title text,
  body text,
  timestamp timestamptz,
  keyword_ids jsonb,
  created_at timestamptz default now()
);

create table if not exists calendar_comments (
  comment_id uuid primary key default gen_random_uuid(),
  post_id uuid references calendar_posts(post_id),
  parent_comment_id uuid null references calendar_comments(comment_id),
  persona_username text references personas(persona_username),
  comment_text text,
  timestamp timestamptz,
  created_at timestamptz default now()
);

-- NOTE: seed/demo inserts were removed. Manage demo data directly in Supabase UI or via separate seed scripts.
