-- Migration 036: User online status
-- Adds status + status_updated_at to profiles table for presence tracking

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'offline'
    CONSTRAINT profiles_status_check CHECK (status IN ('online', 'busy', 'offline')),
  ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ DEFAULT NOW();

COMMENT ON COLUMN profiles.status            IS 'User presence: online | busy | offline';
COMMENT ON COLUMN profiles.status_updated_at IS 'Timestamp of last status change';

-- Index for team presence queries
CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status) WHERE status != 'offline';
