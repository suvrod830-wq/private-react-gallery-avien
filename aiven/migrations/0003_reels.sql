-- ============================================================================
-- Personal Image Gallery — REELS module (short vertical videos)
-- ============================================================================
-- Videos (like images) are stored in Cloudinary; this table holds metadata
-- only. Reuse the same signed-upload flow with resource_type = 'video'.
--
-- How to run:
--   npm run migrate:aiven          (recommended — idempotent, tracked)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Reels (metadata only — the video file lives in Cloudinary)
-- ---------------------------------------------------------------------------
create table if not exists public.reels (
  id                   uuid primary key default gen_random_uuid(),
  title                text not null,
  slug                 text not null unique,
  description          text,
  caption              text,
  cloudinary_public_id text not null,          -- video asset
  secure_url           text not null,          -- video delivery URL
  thumbnail_public_id  text,                   -- optional dedicated poster image
  thumbnail_url        text,
  duration             numeric,                -- seconds (Cloudinary reports it)
  width                int,
  height               int,
  format               text,
  file_size            bigint,
  is_featured          boolean not null default false,
  is_published         boolean not null default false,
  view_count           int not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  published_at         timestamptz
);

-- ---------------------------------------------------------------------------
-- Reel views (dedupe: one view per session per reel)
-- ---------------------------------------------------------------------------
create table if not exists public.reel_views (
  reel_id     uuid not null references public.reels (id) on delete cascade,
  session_key text not null,
  viewed_at   timestamptz not null default now(),
  primary key (reel_id, session_key)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists reels_slug_idx on public.reels (slug);
create index if not exists reels_created_at_idx on public.reels (created_at desc);
create index if not exists reels_published_at_idx on public.reels (published_at desc);
create index if not exists reels_is_published_idx on public.reels (is_published);
create index if not exists reels_is_featured_idx on public.reels (is_featured);
create index if not exists reels_title_trgm_idx on public.reels using gin (title gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Listing: search + filters + sort + pagination (mirrors list_images)
-- ---------------------------------------------------------------------------
create or replace function public.list_reels(p_opts jsonb default '{}')
returns table (
  id uuid,
  title text,
  slug text,
  description text,
  caption text,
  cloudinary_public_id text,
  secure_url text,
  thumbnail_public_id text,
  thumbnail_url text,
  duration numeric,
  width int,
  height int,
  format text,
  file_size bigint,
  is_featured boolean,
  is_published boolean,
  view_count int,
  created_at timestamptz,
  updated_at timestamptz,
  published_at timestamptz,
  total bigint
)
language plpgsql
stable
set search_path = public
as $$
declare
  v_q              text    := lower(coalesce(p_opts ->> 'q', ''));
  v_featured       text    := coalesce(p_opts ->> 'featured', '');
  v_status         text    := coalesce(p_opts ->> 'status', '');
  v_sort           text    := coalesce(p_opts ->> 'sort', 'newest');
  v_page           int     := greatest(1, coalesce((p_opts ->> 'page')::int, 1));
  v_page_size      int     := least(100, greatest(1, coalesce((p_opts ->> 'page_size')::int, 20)));
  v_published_only boolean := coalesce((p_opts ->> 'published_only')::boolean, true);
begin
  return query
  with base as (
    select r.*
    from public.reels r
    where
      (not v_published_only or r.is_published)
      and (v_status = ''
           or (v_status = 'published' and r.is_published)
           or (v_status = 'draft' and not r.is_published))
      and (v_featured = '' or r.is_featured = (v_featured = 'true'))
      and (v_q = ''
           or r.title ilike '%' || v_q || '%'
           or coalesce(r.description, '') ilike '%' || v_q || '%'
           or coalesce(r.caption, '') ilike '%' || v_q || '%')
  )
  select
    b.id, b.title, b.slug, b.description, b.caption,
    b.cloudinary_public_id, b.secure_url,
    b.thumbnail_public_id, b.thumbnail_url,
    b.duration, b.width, b.height, b.format, b.file_size,
    b.is_featured, b.is_published, b.view_count,
    b.created_at, b.updated_at, b.published_at,
    (select count(*)::bigint from base) as total
  from base b
  order by
    case when v_sort = 'newest' then b.created_at end desc nulls last,
    case when v_sort = 'oldest' then b.created_at end asc nulls last,
    case when v_sort = 'most_viewed' then b.view_count end desc nulls last,
    case when v_sort = 'recently_updated' then b.updated_at end desc nulls last,
    case when v_sort = 'title_asc' then lower(b.title) end asc nulls last,
    case when v_sort = 'title_desc' then lower(b.title) end desc nulls last,
    b.created_at desc
  limit v_page_size
  offset (v_page - 1) * v_page_size;
end;
$$;

-- ---------------------------------------------------------------------------
-- Single reel by slug
--   p_include_drafts: the API layer passes true only for authenticated admins
-- ---------------------------------------------------------------------------
create or replace function public.get_reel_by_slug(p_slug text, p_include_drafts boolean default false)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', r.id,
    'title', r.title,
    'slug', r.slug,
    'description', r.description,
    'caption', r.caption,
    'cloudinary_public_id', r.cloudinary_public_id,
    'secure_url', r.secure_url,
    'thumbnail_public_id', r.thumbnail_public_id,
    'thumbnail_url', r.thumbnail_url,
    'duration', r.duration,
    'width', r.width,
    'height', r.height,
    'format', r.format,
    'file_size', r.file_size,
    'is_featured', r.is_featured,
    'is_published', r.is_published,
    'view_count', r.view_count,
    'created_at', r.created_at,
    'updated_at', r.updated_at,
    'published_at', r.published_at
  )
  from public.reels r
  where r.slug = p_slug
    and (p_include_drafts or r.is_published)
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Increment view count, deduped per session
-- ---------------------------------------------------------------------------
create or replace function public.record_reel_view(p_reel_id uuid, p_session_key text)
returns void
language plpgsql
set search_path = public
as $$
begin
  insert into public.reel_views (reel_id, session_key)
  values (p_reel_id, p_session_key)
  on conflict (reel_id, session_key) do nothing;

  if found then
    update public.reels
    set view_count = view_count + 1
    where id = p_reel_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
drop trigger if exists reels_updated_at on public.reels;
create trigger reels_updated_at before update on public.reels
  for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- Dashboard stats — extended with reel counters
--   (replaces the image-only version from 0001; same call site)
--   NOTE: PostgreSQL forbids changing an existing function's return type via
--   CREATE OR REPLACE, so we drop the old 9-column version first. This file
--   runs inside one transaction, so the drop+create is atomic.
-- ---------------------------------------------------------------------------
drop function if exists public.dashboard_stats();

create function public.dashboard_stats()
returns table (
  total_images bigint,
  published_images bigint,
  draft_images bigint,
  featured_images bigint,
  categories bigint,
  tags bigint,
  authors bigint,
  albums bigint,
  total_views bigint,
  total_reels bigint,
  published_reels bigint,
  reel_views bigint
)
language plpgsql
stable
set search_path = public
as $$
begin
  return query
  select
    (select count(*) from public.images),
    (select count(*) from public.images where is_published),
    (select count(*) from public.images where not is_published),
    (select count(*) from public.images where is_featured and is_published),
    (select count(*) from public.categories),
    (select count(*) from public.tags),
    (select count(*) from public.authors),
    (select count(*) from public.albums),
    coalesce((select sum(view_count) from public.images), 0),
    (select count(*) from public.reels),
    (select count(*) from public.reels where is_published),
    coalesce((select sum(view_count) from public.reels), 0);
end;
$$;
