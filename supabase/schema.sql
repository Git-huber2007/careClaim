-- =========================================================
-- CareClaim AI :: Schema, RLS, and Mock Policy Seed
-- Run in the Supabase SQL Editor. Safe to re-run; re-running also upgrades
-- a database created by an earlier version of this file.
-- =========================================================

-- Policies Table (Mock Insurance Data)
CREATE TABLE IF NOT EXISTS policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id VARCHAR(255) NOT NULL,
    policy_number VARCHAR(255) UNIQUE NOT NULL,
    max_coverage_limit DECIMAL(10, 2) NOT NULL,
    copay_percentage DECIMAL(5, 2) NOT NULL,
    covered_treatments TEXT[] NOT NULL,
    excluded_treatments TEXT[] NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Profiles Table: one row per login, fixing the account's role.
-- A PATIENT profile is linked to the patient_id on their policy.
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL, -- HOSPITAL, PATIENT
    patient_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT profiles_role_check CHECK (role IN ('HOSPITAL', 'PATIENT')),
    CONSTRAINT profiles_patient_link_check CHECK ((role = 'PATIENT') = (patient_id IS NOT NULL))
);

-- A patient ID can be claimed by one account only.
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_patient_id ON profiles(patient_id) WHERE patient_id IS NOT NULL;

-- Claims Table
-- source = HOSPITAL: filed by hospital staff (hospital_user_id).
-- source = PATIENT:  a bill the patient checks themselves (patient_user_id).
CREATE TABLE IF NOT EXISTS claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    patient_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    source VARCHAR(20) NOT NULL DEFAULT 'HOSPITAL',
    policy_id UUID NOT NULL REFERENCES policies(id),
    patient_id VARCHAR(255) NOT NULL,
    diagnosis_code VARCHAR(100),
    raw_bill_data JSONB NOT NULL,
    total_billed DECIMAL(10, 2) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- PENDING, APPROVED, PARTIAL, DENIED
    approved_amount DECIMAL(10, 2) DEFAULT 0.00,
    ai_reasoning_log JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT claims_status_check CHECK (status IN ('PENDING', 'APPROVED', 'PARTIAL', 'DENIED'))
);

-- Upgrade a claims table created by an earlier version of this file.
ALTER TABLE claims ADD COLUMN IF NOT EXISTS patient_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'HOSPITAL';
ALTER TABLE claims ALTER COLUMN hospital_user_id DROP NOT NULL;

ALTER TABLE claims DROP CONSTRAINT IF EXISTS claims_source_check;
ALTER TABLE claims ADD CONSTRAINT claims_source_check CHECK (source IN ('HOSPITAL', 'PATIENT'));
ALTER TABLE claims DROP CONSTRAINT IF EXISTS claims_owner_check;
ALTER TABLE claims ADD CONSTRAINT claims_owner_check CHECK (
    (source = 'HOSPITAL' AND hospital_user_id IS NOT NULL) OR
    (source = 'PATIENT' AND patient_user_id IS NOT NULL)
);

-- Accounts that already filed claims were hospital staff.
INSERT INTO profiles (id, role)
SELECT DISTINCT hospital_user_id, 'HOSPITAL' FROM claims WHERE hospital_user_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- Disputes Table: a patient questions one bill line; the hospital responds.
CREATE TABLE IF NOT EXISTS disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    patient_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL,
    item_name TEXT NOT NULL,
    cost DECIMAL(10, 2) NOT NULL,
    flag VARCHAR(30), -- the flag on the line when the dispute was raised
    patient_note TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN', -- OPEN, ACCEPTED, REJECTED
    hospital_response TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT disputes_status_check CHECK (status IN ('OPEN', 'ACCEPTED', 'REJECTED')),
    CONSTRAINT disputes_claim_line_unique UNIQUE (claim_id, line_number)
);

-- Reference Prices Table: what the agent compares a charge against before
-- flagging it as overpriced.
CREATE TABLE IF NOT EXISTS reference_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_name VARCHAR(255) UNIQUE NOT NULL,
    typical_max_price DECIMAL(10, 2) NOT NULL,
    unit VARCHAR(50) NOT NULL DEFAULT 'per item',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_claims_hospital_user_id ON claims(hospital_user_id);
CREATE INDEX IF NOT EXISTS idx_claims_patient_id ON claims(patient_id);
CREATE INDEX IF NOT EXISTS idx_claims_created_at ON claims(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_policies_patient_id ON policies(patient_id);
CREATE INDEX IF NOT EXISTS idx_disputes_claim_id ON disputes(claim_id);
CREATE INDEX IF NOT EXISTS idx_disputes_patient_user_id ON disputes(patient_user_id);

-- Data API grants. Supabase no longer grants these automatically on new
-- tables, and without them even the backend's service-role client gets
-- "permission denied for table ...".
GRANT SELECT, INSERT, UPDATE, DELETE ON claims, policies, profiles, disputes, reference_prices TO service_role;

-- All reads and writes go through the backend, which checks the caller's role
-- and scopes every query. Logged-in users get no direct table access: with it,
-- a user could set their own claim to APPROVED or read another patient's policy.
REVOKE ALL ON claims, policies, profiles, disputes, reference_prices FROM authenticated, anon;

-- Row Level Security (no policies = no access for anyone but the service role)
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE reference_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own claims" ON claims;
DROP POLICY IF EXISTS "Users can insert their own claims" ON claims;
DROP POLICY IF EXISTS "Users can update their own claims" ON claims;
DROP POLICY IF EXISTS "Authenticated users can read policies" ON policies;

-- Seed: Mock Indian Health Insurance Policies (fixed UUIDs for testing)
INSERT INTO policies (id, patient_id, policy_number, max_coverage_limit, copay_percentage, covered_treatments, excluded_treatments)
VALUES
(
    '11111111-1111-4111-8111-111111111111', 'PAT-1001', 'STAR-402-GOLD', 500000.00, 10.00,
    ARRAY['Room Charges','ICU Charges','Surgery','Laparoscopic Appendectomy','Appendectomy','Anesthesia','Consultation','Lab Tests','Blood Test','X-Ray','MRI','CT Scan','Medications','IV Fluids','Nursing Care','Ambulance'],
    ARRAY['Cosmetic Surgery','Dental Whitening','Hair Transplant','Vitamins & Supplements','Personal Comfort Items','Experimental Treatment']
),
(
    '22222222-2222-4222-8222-222222222222', 'PAT-1002', 'HDFC-118-SILVER', 250000.00, 15.00,
    ARRAY['Room Charges','Pulmonology Consultation','Lab Tests','Blood Test','Chest X-Ray','Medications','IV Antibiotics','IV Fluids','Oxygen Therapy','Nursing Care','Physiotherapy'],
    ARRAY['ICU Charges','MRI','Cosmetic Surgery','Robotic Surgery','Private Deluxe Suite','Ambulance','Vitamins & Supplements']
),
(
    '33333333-3333-4333-8333-333333333333', 'PAT-1003', 'CARE-777-PLATINUM', 1500000.00, 0.00,
    ARRAY['Room Charges','Private Deluxe Suite','ICU Charges','Cardiac Surgery','Coronary Angioplasty','Drug-Eluting Stent','Cath Lab Facility','Anesthesia','Cardiology Consultation','Lab Tests','MRI','CT Scan','Medications','Nursing Care','Ambulance'],
    ARRAY['Cosmetic Surgery','Experimental Off-Label Drugs','Experimental Gene Therapy','Hair Transplant','Personal Grooming Items']
),
(
    '44444444-4444-4444-8444-444444444444', 'PAT-1004', 'ICICI-055-BASIC', 100000.00, 20.00,
    ARRAY['General Ward Bed','Consultation','Blood Test','Medications','X-Ray','Nursing Care'],
    ARRAY['Major Surgery','ICU Charges','MRI','CT Scan','Cosmetic Surgery','Ambulance','Physiotherapy','Private Deluxe Room']
),
(
    '55555555-5555-4555-8555-555555555555', 'PAT-1005', 'MAX-990-ONCOLOGY', 1200000.00, 5.00,
    ARRAY['Room Charges','ICU Charges','Oncology Consultation','Chemotherapy Infusion','Immunotherapy','Port-a-Cath Insertion','PET-CT Scan','CT Scan','Targeted Therapy','Anti-Emetics','Blood Transfusion','Lab Tests','Nursing Care'],
    ARRAY['Experimental Off-Label Peptides','Alternative Herbal Therapy','Ayurvedic Decoction','Acupuncture','Nutritional Supplements','Cosmetic Reconstruction']
),
(
    '66666666-6666-4666-8666-666666666666', 'PAT-1006', 'TATA-330-ORTHO', 600000.00, 10.00,
    ARRAY['Room Charges','Orthopedic Surgery','Total Knee Replacement','Hip Arthroplasty','Titanium Prosthesis Implant','Spinal Anesthesia','Post-Op Physical Therapy','Pre-Op Blood Work','Digital X-Ray','Crutches and Walker','Nursing Care'],
    ARRAY['Robotic-Assisted Surgery Surcharge','Private Deluxe Suite','Personal Massager Device','Non-CDSCO Bone Grafts','Hydrotherapy']
),
(
    '77777777-7777-4777-8777-777777777777', 'PAT-1007', 'SBI-205-MATERNITY', 150000.00, 10.00,
    ARRAY['Labor and Delivery','Cesarean Section','LSCS Cesarean','Obstetrician Consultation','Epidural Anesthesia','Neonatal Care','Newborn Blood Screening','Routine Nursery','Postpartum Care'],
    ARRAY['Private Water Birth Suite','Luxury Amenities Pack','Luxury Mother Hamper','Doula Services','Elective Cosmetic Scar Correction']
),
(
    '88888888-8888-4888-8888-888888888888', 'PAT-1008', 'BAJAJ-888-CRITICAL', 1000000.00, 5.00,
    ARRAY['Emergency Room Care','Emergency Trauma Care','ICU Charges','Critical Care Consultation','Continuous IV Insulin Infusion','Arterial Blood Gas Analysis','Electrolyte Monitoring','Cardiac Monitoring','IV Fluids and Resuscitation','Diagnostic Ultrasound','Nursing Care'],
    ARRAY['Cosmetic Procedures','Experimental Off-Label Drugs','Personal Comfort Items','Vitamins & Supplements']
),
(
    '99999999-9999-4999-8999-999999999999', 'PAT-1009', 'NEWINDIA-620-MED', 400000.00, 15.00,
    ARRAY['Room Charges','General Surgery','Laparoscopic Cholecystectomy','Anesthesia','Operation Theater Charges','Operating Room Facility','Pathology Exam','Pre-Op Lab Work','Antibiotics & Analgesics','Nursing Care'],
    ARRAY['Open Cholecystectomy Duplicate Billing','Unbundled Surgical Consumables','Cosmetic Keloid Treatment','Private Deluxe Room']
),
(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'PAT-1010', 'ORIENTAL-440-TRAUMA', 750000.00, 10.00,
    ARRAY['Emergency Trauma Resuscitation','High Dependency Unit (HDU)','Brain CT Scan with Contrast','Cervical Spine X-Ray','Neurotrauma Consultation','Osmotic Diuretics Infusion','Suture and Wound Debridement','Tetanus Prophylaxis','Nursing Care'],
    ARRAY['Experimental Neuroregenerative Therapy','Non-Certified Neck Braces','Personal Telephone and Attendant Charges']
),
(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'PAT-1011', 'NATIONAL-510-DENGUE', 180000.00, 10.00,
    ARRAY['Isolation Ward Bed','High Dependency Care','Platelet Transfusion','Single Donor Platelet Apheresis','Complete Blood Count Monitoring','NS1 Dengue Antigen & IgM Serology','IV Fluid Resuscitation','Infectious Disease Consultation','Nursing Care'],
    ARRAY['Caripill Herbal Papaya Extract Supplements','Luxury Suite Charges','Air Purifier Rental','Mosquito Repellent Sprays']
),
(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'PAT-1012', 'AYUSHMAN-101-PMJAY', 500000.00, 0.00,
    ARRAY['General Ward Hospitalization','Package Surgical Procedures','Kidney Stone Laser Lithotripsy','URS Laser Lithotripsy','Spinal Anesthesia','Ultrasound KUB','Post-Op Stent Removal','Prescribed Generic Medicines','Nursing Care'],
    ARRAY['Single Private Room','Flexible Ureteroscopy Extra Brand Premium','Unapproved Stent Brand Upcharges','Attendant Cot Rent']
)
ON CONFLICT (id) DO UPDATE SET
    patient_id = EXCLUDED.patient_id,
    policy_number = EXCLUDED.policy_number,
    max_coverage_limit = EXCLUDED.max_coverage_limit,
    copay_percentage = EXCLUDED.copay_percentage,
    covered_treatments = EXCLUDED.covered_treatments,
    excluded_treatments = EXCLUDED.excluded_treatments;

-- Seed: Mock reference prices in INR. Illustrative demo values only, NOT
-- official CGHS / PM-JAY rates; replace with a real rate card before relying
-- on "overpriced" flags.
INSERT INTO reference_prices (item_name, typical_max_price, unit)
VALUES
    ('Room Charges', 10000.00, 'per day'),
    ('Isolation Ward Bed', 10000.00, 'per day'),
    ('High Dependency Unit (HDU)', 30000.00, 'per day'),
    ('ICU Charges', 35000.00, 'per day'),
    ('Anesthesia', 30000.00, 'per procedure'),
    ('Specialist Consultation', 25000.00, 'per admission'),
    ('Lab Tests / Blood Work', 12000.00, 'per admission'),
    ('X-Ray', 8000.00, 'per scan'),
    ('Ultrasound', 6000.00, 'per scan'),
    ('CT Scan', 18000.00, 'per scan'),
    ('MRI', 20000.00, 'per scan'),
    ('PET-CT Scan', 35000.00, 'per scan'),
    ('Tetanus Prophylaxis', 1500.00, 'per dose'),
    ('Ambulance', 5000.00, 'per trip')
ON CONFLICT (item_name) DO UPDATE SET
    typical_max_price = EXCLUDED.typical_max_price,
    unit = EXCLUDED.unit;
