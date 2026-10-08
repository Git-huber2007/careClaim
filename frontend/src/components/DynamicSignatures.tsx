interface DoctorProfile {
  name: string;
  role: string;
  regNo: string;
  department: string;
  paths: { d: string; strokeWidth?: number; opacity?: number }[];
}

interface PatientProfile {
  name: string;
  relation: string;
  paths: { d: string; strokeWidth?: number; opacity?: number }[];
  dot?: { cx: number; cy: number };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

const DOCTORS: DoctorProfile[] = [
  // 0: General & GI Surgery (Dr. Rajesh Varma)
  {
    name: 'Dr. Rajesh Varma, MS, DNB',
    role: 'Sr. Consultant GI Surgeon',
    regNo: 'Reg: KMC-58291',
    department: 'General & Laparoscopic Surgery',
    paths: [
      { d: 'M 10 36 C 18 16, 26 8, 34 10 C 40 12, 36 34, 46 32 C 52 30, 56 16, 66 18 C 74 20, 68 38, 78 35 C 88 32, 98 14, 110 18 C 118 20, 114 34, 126 30 C 138 26, 146 14, 158 20 C 166 24, 170 32, 176 30', strokeWidth: 1.8 },
      { d: 'M 24 26 Q 50 14, 82 22', strokeWidth: 1.3, opacity: 0.85 },
      { d: 'M 75 38 C 100 40, 132 36, 166 28', strokeWidth: 1.5 },
      { d: 'M 140 10 C 146 22, 152 34, 158 40', strokeWidth: 1.3, opacity: 0.8 },
    ],
  },
  // 1: Cardiology (Dr. Priya Sundaram)
  {
    name: 'Dr. Priya Sundaram, MD, DM',
    role: 'Chief Interventional Cardiologist',
    regNo: 'Reg: MMC-39102',
    department: 'Department of Cardiology',
    paths: [
      { d: 'M 14 40 C 22 18, 20 8, 30 12 C 38 15, 32 38, 42 34 C 50 30, 62 12, 70 16 C 78 20, 72 36, 84 32 C 96 28, 108 10, 120 14 C 130 18, 124 36, 136 30 C 148 24, 160 16, 172 26', strokeWidth: 1.7 },
      { d: 'M 20 22 C 45 10, 75 25, 110 18', strokeWidth: 1.4, opacity: 0.9 },
      { d: 'M 40 44 C 75 42, 125 44, 168 38', strokeWidth: 1.6 },
    ],
  },
  // 2: Orthopedics (Dr. Ananya Sen)
  {
    name: 'Dr. Ananya Sen, MS (Ortho)',
    role: 'Sr. Orthopedic & Joint Surgeon',
    regNo: 'Reg: DMC-41094',
    department: 'Orthopedics & Traumatology',
    paths: [
      { d: 'M 16 38 C 22 22, 28 10, 36 12 C 44 14, 40 36, 54 32 C 64 28, 72 16, 82 20 C 92 24, 88 40, 102 34 C 114 28, 126 14, 138 20 C 150 26, 162 22, 174 18', strokeWidth: 1.9 },
      { d: 'M 30 18 Q 70 30, 120 22', strokeWidth: 1.3, opacity: 0.8 },
      { d: 'M 15 45 C 55 42, 115 44, 175 40', strokeWidth: 1.8 },
      { d: 'M 162 14 L 170 34', strokeWidth: 1.5 },
    ],
  },
  // 3: Pulmonology (Dr. Vikram Malhotra)
  {
    name: 'Dr. Vikram Malhotra, MD',
    role: 'Consultant Pulmonologist & Critical Care',
    regNo: 'Reg: TMC-71934',
    department: 'Pulmonology & Respiratory Medicine',
    paths: [
      { d: 'M 12 28 C 18 12, 26 8, 32 16 C 38 24, 44 38, 52 30 C 60 22, 68 14, 76 18 C 84 22, 88 36, 98 28 C 108 20, 118 12, 128 16 C 138 20, 148 34, 160 26 C 168 20, 174 24, 178 30', strokeWidth: 1.8 },
      { d: 'M 25 38 C 65 32, 120 34, 172 32', strokeWidth: 1.4 },
      { d: 'M 130 10 C 138 22, 146 36, 154 44', strokeWidth: 1.3, opacity: 0.8 },
    ],
  },
  // 4: Obstetrics & Gynecology (Dr. Sunita Kulkarni)
  {
    name: 'Dr. Sunita Kulkarni, MD, DGO',
    role: 'Sr. Consultant Obstetrician',
    regNo: 'Reg: KMC-49201',
    department: 'Obstetrics & Women Health',
    paths: [
      { d: 'M 16 34 C 22 18, 30 10, 38 14 C 44 18, 42 36, 52 30 C 60 24, 68 16, 76 22 C 84 28, 88 38, 98 32 C 108 26, 120 18, 130 22 C 140 26, 152 36, 164 28 C 172 22, 176 28, 178 32', strokeWidth: 1.7 },
      { d: 'M 32 14 C 55 24, 95 18, 140 24', strokeWidth: 1.2, opacity: 0.85 },
      { d: 'M 25 44 C 70 40, 125 42, 170 38', strokeWidth: 1.5 },
    ],
  },
  // 5: Urology & Nephrology (Dr. Farhan Ahmed)
  {
    name: 'Dr. Farhan Ahmed, MCh',
    role: 'Consultant Urologist & Transplant Surgeon',
    regNo: 'Reg: WBC-83921',
    department: 'Urology & Renal Sciences',
    paths: [
      { d: 'M 14 36 C 20 14, 28 10, 36 14 C 42 18, 38 34, 50 30 C 60 26, 70 12, 80 18 C 90 24, 88 38, 100 32 C 112 26, 122 16, 134 22 C 144 28, 156 36, 168 28', strokeWidth: 1.8 },
      { d: 'M 22 28 Q 65 16, 115 24', strokeWidth: 1.3, opacity: 0.85 },
      { d: 'M 35 44 C 75 42, 125 44, 174 36', strokeWidth: 1.6 },
    ],
  },
  // 6: Internal Medicine & Diabetology (Dr. Sneha Roy)
  {
    name: 'Dr. Sneha Roy, MD',
    role: 'Sr. Physician & Internal Medicine Head',
    regNo: 'Reg: PMC-61028',
    department: 'Department of Internal Medicine',
    paths: [
      { d: 'M 12 36 C 20 18, 28 12, 34 16 C 40 20, 36 38, 48 32 C 58 26, 68 14, 78 18 C 88 22, 92 36, 102 30 C 114 24, 126 16, 138 20 C 148 24, 160 36, 172 28', strokeWidth: 1.8 },
      { d: 'M 28 22 C 60 14, 105 20, 150 18', strokeWidth: 1.3, opacity: 0.8 },
      { d: 'M 20 44 C 65 42, 120 44, 168 38', strokeWidth: 1.5 },
    ],
  },
  // 7: Medical Superintendent / TPA Desk (Dr. Arindam Das)
  {
    name: 'Dr. Arindam Das, MD, MHA',
    role: 'Medical Superintendent & TPA Officer',
    regNo: 'Reg: IMC-92044',
    department: 'Hospital Administration & TPA Cell',
    paths: [
      { d: 'M 10 32 C 18 16, 26 8, 34 12 C 42 16, 38 34, 48 30 C 58 26, 66 14, 76 18 C 86 22, 88 38, 100 32 C 112 26, 124 12, 136 18 C 148 24, 158 36, 170 30', strokeWidth: 1.9 },
      { d: 'M 20 20 Q 70 12, 130 22', strokeWidth: 1.4, opacity: 0.9 },
      { d: 'M 15 42 C 65 44, 120 42, 175 36', strokeWidth: 1.6 },
      { d: 'M 152 12 L 160 32', strokeWidth: 1.4 },
    ],
  },
];

const PATIENTS: PatientProfile[] = [
  // 0: R. Kumar
  {
    name: 'R. Kumar',
    relation: 'Beneficiary (Self)',
    paths: [
      { d: 'M 12 32 C 20 18, 26 12, 34 16 C 40 20, 36 38, 48 32 C 56 26, 62 18, 70 20 C 78 22, 82 36, 94 30 C 104 24, 114 16, 124 19 C 134 22, 138 36, 150 32 C 160 28, 168 18, 176 24', strokeWidth: 1.8 },
      { d: 'M 18 42 C 55 38, 110 40, 162 36', strokeWidth: 1.4, opacity: 0.9 },
    ],
    dot: { cx: 166, cy: 18 },
  },
  // 1: Sunita Verma
  {
    name: 'Sunita Verma',
    relation: 'Beneficiary (Self)',
    paths: [
      { d: 'M 14 36 C 22 20, 28 14, 36 18 C 42 22, 40 38, 50 32 C 58 26, 68 18, 78 22 C 86 26, 92 38, 102 32 C 112 26, 122 18, 134 22 C 144 26, 156 36, 168 28', strokeWidth: 1.7 },
      { d: 'M 24 24 Q 60 16, 110 22', strokeWidth: 1.3, opacity: 0.8 },
      { d: 'M 20 44 C 65 42, 120 44, 168 40', strokeWidth: 1.5 },
    ],
    dot: { cx: 172, cy: 22 },
  },
  // 2: Amitabh Sen
  {
    name: 'Amitabh Sen',
    relation: 'Beneficiary (Self)',
    paths: [
      { d: 'M 10 30 C 18 12, 28 8, 36 16 C 42 22, 46 36, 56 30 C 64 24, 72 16, 82 20 C 90 24, 96 38, 106 30 C 116 22, 126 14, 138 18 C 148 22, 158 34, 170 28', strokeWidth: 1.9 },
      { d: 'M 15 42 C 60 40, 115 42, 170 36', strokeWidth: 1.6 },
    ],
  },
  // 3: Meenakshi Iyer
  {
    name: 'Meenakshi Iyer',
    relation: 'Beneficiary (Self)',
    paths: [
      { d: 'M 15 34 C 20 18, 28 10, 36 14 C 42 18, 44 34, 52 28 C 60 22, 68 14, 76 18 C 84 22, 90 34, 100 28 C 110 22, 120 14, 130 18 C 140 22, 150 34, 162 26 C 170 20, 174 26, 176 30', strokeWidth: 1.7 },
      { d: 'M 30 16 Q 70 24, 120 20', strokeWidth: 1.3, opacity: 0.8 },
      { d: 'M 22 42 C 65 38, 120 40, 165 36', strokeWidth: 1.4 },
    ],
    dot: { cx: 168, cy: 16 },
  },
  // 4: Deepak Joshi
  {
    name: 'Deepak Joshi',
    relation: 'Beneficiary (Self)',
    paths: [
      { d: 'M 12 38 C 18 20, 26 12, 36 16 C 44 20, 42 38, 54 32 C 64 26, 72 16, 82 20 C 92 24, 94 38, 106 32 C 116 26, 128 16, 140 20 C 150 24, 162 34, 174 26', strokeWidth: 1.8 },
      { d: 'M 18 44 C 60 42, 115 44, 170 38', strokeWidth: 1.6 },
    ],
    dot: { cx: 160, cy: 18 },
  },
  // 5: Pooja Nair
  {
    name: 'Pooja Nair',
    relation: 'Beneficiary (Self)',
    paths: [
      { d: 'M 16 32 C 22 16, 30 10, 38 14 C 44 18, 42 36, 52 30 C 60 24, 70 16, 80 20 C 90 24, 94 36, 104 30 C 114 24, 126 16, 136 20 C 146 24, 158 36, 168 28', strokeWidth: 1.7 },
      { d: 'M 28 20 Q 65 12, 115 18', strokeWidth: 1.2, opacity: 0.8 },
      { d: 'M 22 42 C 65 40, 120 42, 168 38', strokeWidth: 1.5 },
    ],
    dot: { cx: 172, cy: 20 },
  },
  // 6: Kavita Reddy
  {
    name: 'Kavita Reddy',
    relation: 'Beneficiary (Self)',
    paths: [
      { d: 'M 14 36 C 20 18, 28 10, 36 14 C 44 18, 42 36, 54 30 C 62 24, 72 14, 82 18 C 92 22, 94 38, 106 32 C 118 26, 128 16, 140 22 C 150 26, 162 36, 174 28', strokeWidth: 1.8 },
      { d: 'M 20 44 C 65 40, 120 42, 172 38', strokeWidth: 1.6 },
    ],
  },
  // 7: Rohan Deshmukh
  {
    name: 'Rohan Deshmukh',
    relation: 'Beneficiary (Self)',
    paths: [
      { d: 'M 10 34 C 18 16, 26 10, 34 14 C 40 18, 38 36, 48 30 C 58 24, 66 14, 76 18 C 86 22, 90 36, 100 30 C 112 24, 124 14, 136 18 C 146 22, 158 36, 170 28', strokeWidth: 1.9 },
      { d: 'M 24 24 Q 65 14, 120 20', strokeWidth: 1.3, opacity: 0.85 },
      { d: 'M 16 44 C 60 42, 115 44, 170 38', strokeWidth: 1.6 },
    ],
    dot: { cx: 165, cy: 20 },
  },
];

/** Selects an authentic medical doctor based on the diagnosis specialty and hospital. */
export function getDoctorForClaim(claim: any): DoctorProfile {
  const diagnosis = String(claim?.diagnosis_code || '').trim().toUpperCase();

  // Clinical specialty mapping by ICD-10 chapter prefix
  if (diagnosis.startsWith('K')) return DOCTORS[0]; // GI / Abdomen / Surgery
  if (diagnosis.startsWith('I')) return DOCTORS[1]; // Cardiovascular / Cardiology
  if (diagnosis.startsWith('M') || diagnosis.startsWith('S')) return DOCTORS[2]; // Ortho & Trauma
  if (diagnosis.startsWith('J')) return DOCTORS[3]; // Respiratory / Pulmonology
  if (diagnosis.startsWith('O')) return DOCTORS[4]; // Maternity & OBG
  if (diagnosis.startsWith('N')) return DOCTORS[5]; // Renal & Urology
  if (diagnosis.startsWith('E') || diagnosis.startsWith('A') || diagnosis.startsWith('B')) return DOCTORS[6]; // Internal Medicine

  // Fallback to deterministic hash over claim ID / diagnosis
  const seed = hashString(diagnosis + (claim?.hospital_org || '') + (claim?.id || ''));
  return DOCTORS[seed % DOCTORS.length];
}

/** Selects a unique patient profile and signature based on the patient ID. */
export function getPatientForClaim(claim: any): PatientProfile {
  const pid = String(claim?.patient_id || '').trim();
  const seed = hashString(pid || claim?.id || 'PAT-1002');
  const base = PATIENTS[seed % PATIENTS.length];

  // If patient ID has digits (e.g., PAT-1002), customize the display title
  return {
    ...base,
    name: pid.includes('PAT-') ? `${base.name}` : (pid || base.name),
  };
}

export function DoctorSignatureSvg({ doctor }: { doctor: DoctorProfile }) {
  return (
    <svg
      viewBox="0 0 180 50"
      className="h-11 w-44 text-pine overflow-visible select-none"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label={`${doctor.name} signature`}
    >
      {doctor.paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          strokeWidth={p.strokeWidth ?? 1.8}
          opacity={p.opacity ?? 1}
        />
      ))}
    </svg>
  );
}

export function PatientSignatureSvg({ patient }: { patient: PatientProfile }) {
  return (
    <svg
      viewBox="0 0 180 50"
      className="h-11 w-44 text-ink overflow-visible select-none"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label={`${patient.name} signature`}
    >
      {patient.paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          strokeWidth={p.strokeWidth ?? 1.8}
          opacity={p.opacity ?? 1}
        />
      ))}
      {patient.dot && (
        <circle
          cx={patient.dot.cx}
          cy={patient.dot.cy}
          r={1.5}
          fill="currentColor"
          stroke="none"
        />
      )}
    </svg>
  );
}
