-- =========================================================
-- CareClaim AI :: Schema, RLS, and Mock Policy Seed
-- Run in the Supabase SQL Editor. Safe to re-run.
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

-- Claims Table
CREATE TABLE IF NOT EXISTS claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_claims_hospital_user_id ON claims(hospital_user_id);
CREATE INDEX IF NOT EXISTS idx_claims_created_at ON claims(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_policies_patient_id ON policies(patient_id);

-- Data API grants. Supabase no longer grants these automatically on new
-- tables, and without them even the backend's service-role client gets
-- "permission denied for table ...".
GRANT SELECT, INSERT, UPDATE, DELETE ON claims, policies TO service_role;
GRANT SELECT, INSERT, UPDATE ON claims TO authenticated;
GRANT SELECT ON policies TO authenticated;

-- Row Level Security
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own claims" ON claims;
CREATE POLICY "Users can view their own claims" ON claims
    FOR SELECT TO authenticated USING (auth.uid() = hospital_user_id);

DROP POLICY IF EXISTS "Users can insert their own claims" ON claims;
CREATE POLICY "Users can insert their own claims" ON claims
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = hospital_user_id);

DROP POLICY IF EXISTS "Users can update their own claims" ON claims;
CREATE POLICY "Users can update their own claims" ON claims
    FOR UPDATE TO authenticated USING (auth.uid() = hospital_user_id) WITH CHECK (auth.uid() = hospital_user_id);

DROP POLICY IF EXISTS "Authenticated users can read policies" ON policies;
CREATE POLICY "Authenticated users can read policies" ON policies
    FOR SELECT TO authenticated USING (true);

-- Seed: Mock Policies (fixed UUIDs for easy testing)
INSERT INTO policies (id, patient_id, policy_number, max_coverage_limit, copay_percentage, covered_treatments, excluded_treatments)
VALUES
(
    '11111111-1111-4111-8111-111111111111', 'PAT-1001', 'POL-402-GOLD', 500000.00, 10.00,
    ARRAY['Room Charges','ICU Charges','Surgery','Appendectomy','Anesthesia','Consultation','Lab Tests','Blood Test','X-Ray','MRI','CT Scan','Medications','IV Fluids','Nursing Care','Ambulance'],
    ARRAY['Cosmetic Surgery','Dental Whitening','Hair Transplant','Vitamins & Supplements','Personal Comfort Items','Experimental Treatment']
),
(
    '22222222-2222-4222-8222-222222222222', 'PAT-1002', 'POL-118-SILVER', 150000.00, 20.00,
    ARRAY['Room Charges','Consultation','Lab Tests','Blood Test','X-Ray','Medications','IV Fluids','Nursing Care','Physiotherapy'],
    ARRAY['ICU Charges','MRI','Cosmetic Surgery','Robotic Surgery','Private Deluxe Room','Ambulance','Vitamins & Supplements']
),
(
    '33333333-3333-4333-8333-333333333333', 'PAT-1003', 'POL-777-PLATINUM', 1000000.00, 0.00,
    ARRAY['Room Charges','Private Deluxe Room','ICU Charges','Surgery','Cardiac Surgery','Angioplasty','Stent','Anesthesia','Consultation','Lab Tests','MRI','CT Scan','Medications','Nursing Care','Ambulance','Physiotherapy'],
    ARRAY['Cosmetic Surgery','Experimental Treatment','Hair Transplant']
),
(
    '44444444-4444-4444-8444-444444444444', 'PAT-1004', 'POL-055-BASIC', 50000.00, 30.00,
    ARRAY['Room Charges','Consultation','Blood Test','Medications'],
    ARRAY['Surgery','ICU Charges','MRI','CT Scan','Cosmetic Surgery','Ambulance','Physiotherapy','Private Deluxe Room']
),
(
    '55555555-5555-4555-8555-555555555555', 'PAT-1005', 'POL-990-ONCOLOGY', 800000.00, 5.00,
    ARRAY['Room Charges','ICU Charges','Oncology Consultation','Chemotherapy Infusion','Immunotherapy','Port-a-Cath Insertion','PET Scan','CT Scan','Anti-Emetics','Blood Transfusion','Lab Tests','Nursing Care'],
    ARRAY['Experimental Off-Label Drugs','Alternative Herbal Therapy','Acupuncture','Nutritional Supplements','Cosmetic Reconstruction']
),
(
    '66666666-6666-4666-8666-666666666666', 'PAT-1006', 'POL-330-ORTHO-PLUS', 350000.00, 15.00,
    ARRAY['Room Charges','Orthopedic Surgery','Total Knee Replacement','Hip Arthroplasty','Titanium Prosthesis Implant','Spinal Anesthesia','Post-Op Physical Therapy','Pre-Op Blood Work','X-Ray','Crutches and Walker','Nursing Care'],
    ARRAY['Robotic-Assisted Surgery Surcharge','Private Deluxe Suite','Personal Massager Device','Non-FDA Bone Grafts','Acupuncture']
),
(
    '77777777-7777-4777-8777-777777777777', 'PAT-1007', 'POL-205-MATERNITY-BRONZE', 60000.00, 10.00,
    ARRAY['Labor and Delivery','Cesarean Section','Obstetrician Consultation','Epidural Anesthesia','Neonatal Care','Newborn Blood Screening','Routine Nursery','Postpartum Care'],
    ARRAY['Private Water Birth Suite','Luxury Amenities Pack','Doula Services','Elective Cosmetic Scar Correction']
),
(
    '88888888-8888-4888-8888-888888888888', 'PAT-1008', 'POL-888-COMPREHENSIVE', 600000.00, 10.00,
    ARRAY['Emergency Room Care','ICU Charges','Critical Care Consultation','Continuous IV Insulin Infusion','Arterial Blood Gas Analysis','Electrolyte Panel','Cardiac Monitoring','IV Fluids and Resuscitation','Diagnostic Ultrasound','Nursing Care'],
    ARRAY['Cosmetic Surgery','Experimental Off-Label Drugs','Personal Comfort Items','Vitamins & Supplements']
),
(
    '99999999-9999-4999-8999-999999999999', 'PAT-1009', 'POL-620-STANDARD', 200000.00, 20.00,
    ARRAY['Room Charges','General Surgery','Laparoscopic Cholecystectomy','Anesthesia','Operating Room Facility','Pathology Exam','Pre-Op Lab Work','Antibiotics & Analgesics','Nursing Care'],
    ARRAY['Open Cholecystectomy Duplicate Billing','Unbundled Surgical Trays','Cosmetic Keloid Treatment','Private Deluxe Room']
),
(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'PAT-1010', 'POL-440-TRAUMA', 400000.00, 10.00,
    ARRAY['Emergency Trauma Resuscitation','High Dependency Unit (HDU)','Brain CT Scan with Contrast','Cervical Spine X-Ray','Neurotrauma Consultation','Osmotic Diuretics Infusion','Suture and Wound Debridement','Tetanus Prophylaxis','Nursing Care'],
    ARRAY['Experimental Neuroregenerative Therapy','Non-Certified Neck Braces','Personal Telephone and TV Charges']
)
ON CONFLICT (policy_number) DO NOTHING;
