-- =========================================================
-- CareClaim AI :: Schema, RLS, and Mock Policy Seed
-- Run in the Supabase SQL Editor.
-- =========================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Policies Table (Mock Insurance Data)
CREATE TABLE IF NOT EXISTS policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hospital_user_id UUID REFERENCES auth.users(id),
    policy_id UUID REFERENCES policies(id),
    patient_id VARCHAR(255) NOT NULL,
    diagnosis_code VARCHAR(100),
    raw_bill_data JSONB NOT NULL,
    total_billed DECIMAL(10, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, APPROVED, PARTIAL, DENIED
    approved_amount DECIMAL(10, 2) DEFAULT 0.00,
    ai_reasoning_log JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT claims_status_check CHECK (status IN ('PENDING', 'APPROVED', 'PARTIAL', 'DENIED'))
);

CREATE INDEX IF NOT EXISTS idx_claims_hospital_user_id ON claims(hospital_user_id);
CREATE INDEX IF NOT EXISTS idx_claims_created_at ON claims(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_policies_patient_id ON policies(patient_id);

-- Row Level Security
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own claims" ON claims
    FOR SELECT USING (auth.uid() = hospital_user_id);

CREATE POLICY "Users can insert their own claims" ON claims
    FOR INSERT WITH CHECK (auth.uid() = hospital_user_id);

CREATE POLICY "Users can update their own claims" ON claims
    FOR UPDATE USING (auth.uid() = hospital_user_id);

CREATE POLICY "Authenticated users can read policies" ON policies
    FOR SELECT USING (auth.role() = 'authenticated');

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
)
ON CONFLICT (policy_number) DO NOTHING;
