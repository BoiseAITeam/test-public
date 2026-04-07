-- ============================================================
-- InsureTrack — Demo Seed Data for Supabase
-- Run this AFTER schema.sql in the SQL Editor.
-- Passwords (bcrypt, cost 10):
--   admin123  → $2a$10$rBV2JDeWW3.vKyeCtBfOi.5MJk7PNxY9Hw6NQFKlUoA5ABCDEF001
--   gc123     → $2a$10$rBV2JDeWW3.vKyeCtBfOi.5MJk7PNxY9Hw6NQFKlUoA5ABCDEF002
--   agent123  → $2a$10$rBV2JDeWW3.vKyeCtBfOi.5MJk7PNxY9Hw6NQFKlUoA5ABCDEF003
-- NOTE: Run `node supabase/hash-passwords.js` to regenerate fresh hashes,
--       then paste them here before seeding.
-- ============================================================

-- Truncate in dependency order (safe to re-run)
TRUNCATE notifications, email_log, email_templates, insurance_policies,
         gc_subcontractor, insurance_agents, subcontractors,
         general_contractors, users RESTART IDENTITY CASCADE;

-- ---- Users ----
-- IMPORTANT: Replace the password hashes below with output from:
--   node supabase/hash-passwords.js
INSERT INTO users (email, password, name, role, phone, company) VALUES
  ('dawn@insuretrack.com',      '__ADMIN_HASH__',  'Dawn Mitchell',  'admin',               '208-555-0100', 'InsureTrack Consulting'),
  ('tom@apexbuilding.com',      '__GC_HASH__',     'Tom Reynolds',   'general_contractor',  '208-555-0201', 'Apex Building Group'),
  ('sarah@mountaincrest.com',   '__GC_HASH__',     'Sarah Johnson',  'general_contractor',  '208-555-0202', 'Mountain Crest Construction'),
  ('mike@idahofirst.com',       '__AGENT_HASH__',  'Mike Torres',    'insurance_agent',     '208-555-0301', 'Idaho First Insurance'),
  ('linda@statewidecoverage.com','__AGENT_HASH__', 'Linda Park',     'insurance_agent',     '208-555-0302', 'Statewide Coverage');

-- ---- General Contractors ----
INSERT INTO general_contractors (user_id, company_name, contact_name, email, phone, address, city, state, zip, license_number, require_additional_insured) VALUES
  (2, 'Apex Building Group',      'Tom Reynolds',  'tom@apexbuilding.com',    '208-555-0201', '1234 Main St', 'Boise',    'ID', '83701', 'GC-2021-4567', TRUE),
  (3, 'Mountain Crest Construction','Sarah Johnson','sarah@mountaincrest.com','208-555-0202', '5678 Oak Ave', 'Meridian', 'ID', '83642', 'GC-2019-8901', FALSE);

-- ---- Insurance Agents ----
INSERT INTO insurance_agents (name, email, phone, agency_name) VALUES
  ('Mike Torres',   'mike@idahofirst.com',       '208-555-0301', 'Idaho First Insurance'),
  ('Linda Park',    'linda@statewidecoverage.com','208-555-0302', 'Statewide Coverage'),
  ('Robert Chen',   'robert@peakcoverage.com',   '208-555-0303', 'Peak Coverage Insurance');

-- ---- Subcontractors ----
INSERT INTO subcontractors (company_name, contact_name, email, phone, address, city, state, zip, trade,
  is_sole_proprietor, w9_tax_id, w9_entity_type, w9_signature_date, w9_on_file, w9_year, status, notes) VALUES
  ('Peak Electrical LLC',   'Carlos Rivera', 'carlos@peakelectrical.com', '208-555-0401', '789 Elm St',   'Boise',    'ID', '83702', 'Electrical', FALSE, '83-1234567', 'LLC',         '2024-01-15', TRUE,  2024, 'active',        NULL),
  ('Rocky Mountain Plumbing','Jim Taylor',   'jim@rockymtnplumbing.com',  '208-555-0402', '321 Pine Ave', 'Nampa',    'ID', '83651', 'Plumbing',   FALSE, '45-9876543', 'Corporation', '2024-01-10', TRUE,  2024, 'non_compliant', NULL),
  ('Dave''s Drywall',       'Dave Kowalski', 'dave@davesdrywall.com',     '208-555-0403', '654 Maple Dr', 'Eagle',    'ID', '83616', 'Drywall',    TRUE,  NULL,         NULL,          NULL,         FALSE, NULL, 'pending',       'Sole proprietor - Idaho exemption may apply for workers comp'),
  ('Summit Roofing Inc',    'Brad Williams', 'brad@summitroof.com',       '208-555-0404', '987 Cedar Ln', 'Boise',    'ID', '83705', 'Roofing',    FALSE, '72-3456789', 'Corporation', '2023-11-01', TRUE,  2023, 'active',        'W9 needs renewal for 2024'),
  ('Clearwater HVAC',       'Amanda Foster', 'amanda@clearwaterhvac.com', '208-555-0405', '147 Birch Blvd','Meridian','ID', '83642', 'HVAC',       FALSE, '61-5554321', 'LLC',         '2024-02-20', TRUE,  2024, 'active',        NULL);

-- ---- GC-Sub Links ----
-- Apex: Peak Electrical, Rocky Mountain, Dave's Drywall, Summit Roofing
-- Mountain Crest: Peak Electrical, Summit Roofing, Clearwater HVAC
INSERT INTO gc_subcontractor (gc_id, sub_id, added_by) VALUES
  (1, 1, 1), (1, 2, 1), (1, 3, 1), (1, 4, 1),
  (2, 1, 1), (2, 4, 1), (2, 5, 1)
ON CONFLICT DO NOTHING;

-- ---- Insurance Policies ----
-- Relative dates: adjust CURRENT_DATE offsets to match your seeding date
INSERT INTO insurance_policies
  (sub_id, agent_id, policy_type, policy_number, carrier, coverage_amount,
   effective_date, expiration_date, status, certificate_on_file,
   requires_additional_insured, additional_insured_confirmed, last_verified_date) VALUES
  -- Peak Electrical: both active, full year
  (1, 1, 'general_liability', 'GL-2024-PE001', 'Liberty Mutual',  1000000, '2024-01-01', CURRENT_DATE + 365, 'active',  TRUE, TRUE,  TRUE,  CURRENT_DATE),
  (1, 1, 'workers_comp',      'WC-2024-PE001', 'Liberty Mutual',   500000, '2024-01-01', CURRENT_DATE + 365, 'active',  TRUE, FALSE, FALSE, CURRENT_DATE),
  -- Rocky Mountain Plumbing: GL expiring in 22 days, WC already expired
  (2, 2, 'general_liability', 'GL-2024-RM001', 'State Farm',      1000000, '2023-06-01', CURRENT_DATE + 22,  'active',  TRUE, TRUE,  FALSE, CURRENT_DATE),
  (2, 2, 'workers_comp',      'WC-2024-RM001', 'State Farm',       500000, '2023-06-01', CURRENT_DATE - 15,  'expired', TRUE, FALSE, FALSE, NULL),
  -- Summit Roofing: GL active, no WC on file
  (4, 1, 'general_liability', 'GL-2024-SR001', 'Travelers',       1000000, '2024-01-01', CURRENT_DATE + 265, 'active',  TRUE, TRUE,  TRUE,  CURRENT_DATE),
  -- Clearwater HVAC: both expiring in 58 days
  (5, 3, 'general_liability', 'GL-2024-CH001', 'Nationwide',      1000000, '2024-04-01', CURRENT_DATE + 58,  'active',  TRUE, FALSE, FALSE, CURRENT_DATE),
  (5, 3, 'workers_comp',      'WC-2024-CH001', 'Nationwide',       500000, '2024-04-01', CURRENT_DATE + 58,  'active',  TRUE, FALSE, FALSE, CURRENT_DATE);

-- ---- Email Templates ----
INSERT INTO email_templates (gc_id, template_type, name, subject, body) VALUES
  (NULL, 'certificate_request', 'Certificate Request',
   'Certificate of Insurance Request – {{sub_name}}',
   E'Dear {{agent_name}},\n\nI am writing on behalf of {{gc_name}} to request a current Certificate of Insurance for your client, {{sub_name}}.\n\nWe require the following minimum coverage:\n  • General Liability: $1,000,000 per occurrence / $2,000,000 aggregate\n  • Workers'' Compensation: Per state statute (minimum $500,000)\n\nPlease ensure {{gc_name}} is listed as an Additional Insured on the General Liability policy.\n\nPlease send the certificate to: compliance@insuretrack.com\n\nThank you for your prompt attention to this matter.\n\nBest regards,\nDawn Mitchell\nInsureTrack Compliance Services\n208-555-0100'),

  (NULL, 'validation_request', 'Policy Validation',
   'Insurance Verification Request – {{sub_name}}',
   E'Dear {{agent_name}},\n\nPlease confirm that the following insurance policies for {{sub_name}} are currently active and in good standing:\n\n  • General Liability: Policy #{{gl_policy_number}}\n  • Workers'' Compensation: Policy #{{wc_policy_number}}\n\nPlease reply YES or NO to confirm current status. If any policy has lapsed, please upload a renewed certificate.\n\nIf you are no longer the agent of record for {{sub_name}}, please let us know immediately so we can update our records.\n\nThank you,\nDawn Mitchell\nInsureTrack Compliance Services'),

  (NULL, 'expiration_warning', 'Expiration Warning',
   'ACTION REQUIRED: Insurance Expiring in {{days_until_expiration}} Days – {{sub_name}}',
   E'Dear {{agent_name}},\n\nThis is a courtesy reminder that the following insurance policy for your client {{sub_name}} is expiring soon:\n\n  Policy Type: {{policy_type}}\n  Policy Number: {{policy_number}}\n  Expiration Date: {{expiration_date}}\n  Days Remaining: {{days_until_expiration}}\n\nPlease provide a renewed certificate of insurance before the expiration date to maintain compliance.\n\nSend updated certificates to: compliance@insuretrack.com\n\nThank you,\nDawn Mitchell\nInsureTrack Compliance Services\n208-555-0100'),

  (NULL, 'onboarding', 'New Sub Onboarding',
   'Welcome – Action Required for {{gc_name}} Compliance',
   E'Dear {{sub_name}},\n\n{{gc_name}} has added you to their subcontractor compliance portal managed by InsureTrack Consulting.\n\nTo complete your onboarding and begin work, we need the following:\n\n  1. A completed and signed W-9 form\n  2. Current Certificate of Insurance showing:\n     • General Liability: $1,000,000 minimum\n     • Workers'' Compensation: Per state statute\n\nPlease have your insurance agent send certificates to: compliance@insuretrack.com\nPlease send your W-9 to: compliance@insuretrack.com\n\nIf you have any questions, please contact Dawn Mitchell at 208-555-0100.\n\nThank you,\nDawn Mitchell\nInsureTrack Compliance Services');

-- ---- Notifications ----
INSERT INTO notifications (user_id, type, title, message, related_type, related_id) VALUES
  (1, 'expiration_warning', 'Policy Expiring Soon',  'Rocky Mountain Plumbing – General Liability expires in 22 days',    'policy',        3),
  (1, 'non_compliant',      'Policy Expired',         'Rocky Mountain Plumbing – Workers'' Comp has expired',               'policy',        4),
  (1, 'pending_w9',         'W9 Missing',             'Dave''s Drywall has not submitted a W9',                             'subcontractor', 3),
  (2, 'expiration_warning', 'Policy Expiring Soon',   'Rocky Mountain Plumbing – General Liability expires in 22 days',    'policy',        3);
