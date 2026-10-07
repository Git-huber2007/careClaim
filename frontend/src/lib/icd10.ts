/**
 * Common inpatient ICD-10 diagnosis codes, offered as suggestions in the
 * diagnosis field. This is a short list for convenience, not the full
 * classification: any code can still be typed.
 */
export const ICD10_CODES: Record<string, string> = {
  'A01.0': 'Typhoid fever',
  'A09': 'Infectious gastroenteritis and colitis',
  'A41.9': 'Sepsis, unspecified organism',
  'A90': 'Dengue fever',
  'B54': 'Malaria, unspecified',
  'C34.90': 'Malignant neoplasm of lung, unspecified',
  'C50.911': 'Malignant neoplasm of right breast',
  'D64.9': 'Anaemia, unspecified',
  'E11.9': 'Type 2 diabetes mellitus without complications',
  'E86.0': 'Dehydration',
  'H25.9': 'Age-related cataract, unspecified',
  'I10': 'Essential (primary) hypertension',
  'I20.0': 'Unstable angina',
  'I21.9': 'Acute myocardial infarction, unspecified',
  'I25.10': 'Coronary artery disease without angina',
  'I50.9': 'Heart failure, unspecified',
  'I63.9': 'Cerebral infarction (stroke), unspecified',
  'J06.9': 'Acute upper respiratory infection, unspecified',
  'J18.9': 'Pneumonia, unspecified organism',
  'J44.1': 'COPD with acute exacerbation',
  'J45.901': 'Asthma with acute exacerbation',
  'K29.70': 'Gastritis, unspecified',
  'K35.80': 'Acute appendicitis, unspecified',
  'K40.90': 'Inguinal hernia without obstruction',
  'K56.60': 'Intestinal obstruction, unspecified',
  'K80.20': 'Gallstones without cholecystitis',
  'M17.11': 'Primary osteoarthritis, right knee',
  'M54.50': 'Low back pain, unspecified',
  'N18.6': 'End-stage renal disease',
  'N20.0': 'Kidney stone',
  'N39.0': 'Urinary tract infection, site not specified',
  'O80': 'Normal delivery',
  'O82': 'Caesarean delivery',
  'R50.9': 'Fever, unspecified',
  'S06.0X0A': 'Concussion without loss of consciousness',
  'S72.001A': 'Fracture of neck of right femur',
  'S82.201A': 'Fracture of shaft of right tibia',
  'U07.1': 'COVID-19'
};

/** A letter, two characters, then optionally a dot and up to four more. */
const ICD10_SHAPE = /^[A-Z][0-9][0-9A-Z](\.[0-9A-Z]{1,4})?$/i;

export const looksLikeIcd10 = (code: string) => ICD10_SHAPE.test(code.trim());

/** The description for a code on the list, whatever case it was typed in. */
export const describeIcd10 = (code: string) => ICD10_CODES[code.trim().toUpperCase()] ?? null;
