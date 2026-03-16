-- Newsletter subscribers + async email queue
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    email_normalized TEXT NOT NULL,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    subscribed BOOLEAN NOT NULL DEFAULT true,
    source TEXT NOT NULL DEFAULT 'website',
    unsubscribed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT newsletter_subscribers_email_format_chk
        CHECK (email ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_subscribers_email_normalized_unique
    ON public.newsletter_subscribers(email_normalized);

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_subscribed
    ON public.newsletter_subscribers(subscribed)
    WHERE subscribed = true;

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_user_id
    ON public.newsletter_subscribers(user_id);

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_updated_at
    ON public.newsletter_subscribers(updated_at DESC);

CREATE TABLE IF NOT EXISTS public.newsletter_email_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscriber_id UUID REFERENCES public.newsletter_subscribers(id) ON DELETE SET NULL,
    to_email TEXT NOT NULL,
    event_key TEXT,
    subject TEXT NOT NULL,
    html_content TEXT NOT NULL,
    text_content TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processing_started_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    provider_message_id TEXT,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.newsletter_email_queue
    ADD COLUMN IF NOT EXISTS event_key TEXT,
    ADD COLUMN IF NOT EXISTS provider_message_id TEXT;

CREATE INDEX IF NOT EXISTS idx_newsletter_email_queue_status_scheduled
    ON public.newsletter_email_queue(status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_newsletter_email_queue_created_at
    ON public.newsletter_email_queue(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_newsletter_email_queue_to_email
    ON public.newsletter_email_queue(to_email);

CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_email_queue_event_email_unique
    ON public.newsletter_email_queue(event_key, to_email)
    WHERE event_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_newsletter_email_queue_processing_started
    ON public.newsletter_email_queue(processing_started_at)
    WHERE status = 'processing';

CREATE TABLE IF NOT EXISTS public.newsletter_event_dispatches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_key TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    queued_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_newsletter_event_dispatches_event_type_created
    ON public.newsletter_event_dispatches(event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS public.newsletter_queue_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_id UUID REFERENCES public.newsletter_email_queue(id) ON DELETE SET NULL,
    event TEXT NOT NULL,
    level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
    message TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_newsletter_queue_logs_queue_id_created
    ON public.newsletter_queue_logs(queue_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_newsletter_queue_logs_event_created
    ON public.newsletter_queue_logs(event, created_at DESC);

CREATE OR REPLACE FUNCTION public.newsletter_set_normalized_email()
RETURNS TRIGGER AS $$
BEGIN
    NEW.email := lower(trim(NEW.email));
    NEW.email_normalized := lower(trim(NEW.email));
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trg_newsletter_subscribers_normalize'
    ) THEN
        CREATE TRIGGER trg_newsletter_subscribers_normalize
            BEFORE INSERT OR UPDATE ON public.newsletter_subscribers
            FOR EACH ROW
            EXECUTE FUNCTION public.newsletter_set_normalized_email();
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.newsletter_set_queue_timestamps()
RETURNS TRIGGER AS $$
BEGIN
    NEW.to_email := lower(trim(NEW.to_email));
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trg_newsletter_queue_timestamps'
    ) THEN
        CREATE TRIGGER trg_newsletter_queue_timestamps
            BEFORE INSERT OR UPDATE ON public.newsletter_email_queue
            FOR EACH ROW
            EXECUTE FUNCTION public.newsletter_set_queue_timestamps();
    END IF;
END $$;

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_email_queue ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'newsletter_subscribers'
          AND policyname = 'newsletter_subscribers_owner_read'
    ) THEN
        CREATE POLICY newsletter_subscribers_owner_read
            ON public.newsletter_subscribers
            FOR SELECT
            TO authenticated
            USING (auth.uid() = user_id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'newsletter_subscribers'
          AND policyname = 'newsletter_subscribers_owner_update'
    ) THEN
        CREATE POLICY newsletter_subscribers_owner_update
            ON public.newsletter_subscribers
            FOR UPDATE
            TO authenticated
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;
