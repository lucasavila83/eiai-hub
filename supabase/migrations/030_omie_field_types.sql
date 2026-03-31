-- Migration 030: Add OMIE field types (omie_category, omie_department) to bpm_fields
-- Also adds 'checklist' which was added in code but missing from the constraint

-- Drop the old CHECK constraint and add the expanded one
ALTER TABLE bpm_fields DROP CONSTRAINT IF EXISTS bpm_fields_field_type_check;
ALTER TABLE bpm_fields ADD CONSTRAINT bpm_fields_field_type_check CHECK (field_type IN (
  'text', 'textarea', 'number', 'currency', 'date',
  'select', 'multiselect', 'checkbox', 'email', 'phone',
  'file', 'user', 'checklist',
  'omie_category', 'omie_department'
));
