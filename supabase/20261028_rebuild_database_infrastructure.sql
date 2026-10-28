-- ============================================================================
-- FULL DATABASE INFRASTRUCTURE REBUILD
-- Project: https://yvlnnnuwkbxtpzlaoxko.supabase.co
-- Covers: Iris Desktop App (Releases & Telemetry) + Aether Deck Storefront
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. RELEASES (Iris GitHub Releases & VirusTotal Verification)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.releases (
    id text PRIMARY KEY,
    app_name text DEFAULT 'Iris',
    version text UNIQUE NOT NULL,
    tag_name text NOT NULL,
    release_title text,
    release_notes text,
    file_name text NOT NULL,
    file_size int8,
    sha256 text,
    md5 text,
    download_url text NOT NULL,
    virustotal_analysis_id text,
    virustotal_permalink text,
    harmless_count int4 DEFAULT 0,
    malicious_count int4 DEFAULT 0,
    suspicious_count int4 DEFAULT 0,
    undetected_count int4 DEFAULT 0,
    total_engines int4 DEFAULT 0,
    scan_verdict text DEFAULT 'CLEAN',
    scanned_at timestamptz,
    published_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.releases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read releases" ON public.releases;
CREATE POLICY "Public read releases" ON public.releases
    FOR SELECT TO anon, authenticated, public
    USING (true);

DROP POLICY IF EXISTS "Service role full access releases" ON public.releases;
CREATE POLICY "Service role full access releases" ON public.releases
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- Writes restricted to service_role only (policy above). Drop any legacy public write policy:
DROP POLICY IF EXISTS "Public write releases" ON public.releases;

CREATE INDEX IF NOT EXISTS idx_releases_published_at ON public.releases (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_releases_version ON public.releases (version);

-- ============================================================================
-- 2. IRIS TELEMETRY (Desktop App Anonymous HUD Telemetry)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.iris_telemetry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id TEXT NOT NULL,
    app_version TEXT NOT NULL DEFAULT 'unknown',
    event TEXT NOT NULL,
    game_category TEXT,
    element_type TEXT,
    resolution TEXT,
    last_seen TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.iris_telemetry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public insert iris_telemetry" ON public.iris_telemetry;
CREATE POLICY "Allow public insert iris_telemetry" ON public.iris_telemetry
    FOR INSERT TO anon, authenticated, public
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read iris_telemetry" ON public.iris_telemetry;
CREATE POLICY "Allow public read iris_telemetry" ON public.iris_telemetry
    FOR SELECT TO anon, authenticated, public
    USING (true);

DROP POLICY IF EXISTS "Service role full access iris_telemetry" ON public.iris_telemetry;
CREATE POLICY "Service role full access iris_telemetry" ON public.iris_telemetry
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_iris_telemetry_last_seen ON public.iris_telemetry (last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_iris_telemetry_client_id ON public.iris_telemetry (client_id);
