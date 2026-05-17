-- Run this in Supabase SQL Editor
-- Adds server-side AI query quota tracking to the profiles table

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS query_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS query_month text DEFAULT '';
