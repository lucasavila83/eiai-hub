-- Migration 032: Add public_form_fields column to bpm_pipes
-- Stores array of field IDs that should be shown in the public form
ALTER TABLE bpm_pipes ADD COLUMN IF NOT EXISTS public_form_fields UUID[] DEFAULT '{}';
