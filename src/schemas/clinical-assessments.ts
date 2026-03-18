import { z } from 'zod';

// ─── PHQ-9 ─────────────────────────────────────────────────────────────────
const phq9ItemScore = z.number().int().min(0).max(3);

export const createPHQ9Schema = z.object({
  PatientId: z.number().int().positive(),
  EncounterId: z.number().int().positive().optional(),
  InterestScore: phq9ItemScore.default(0),
  HopelessScore: phq9ItemScore.default(0),
  SleepScore: phq9ItemScore.default(0),
  FatigueScore: phq9ItemScore.default(0),
  AppetiteScore: phq9ItemScore.default(0),
  FailureScore: phq9ItemScore.default(0),
  FocusScore: phq9ItemScore.default(0),
  PsychomotorScore: phq9ItemScore.default(0),
  SuicideScore: phq9ItemScore.default(0),
  Difficulty: z.string().optional(),
});

// ─── GAD-7 ─────────────────────────────────────────────────────────────────
const gad7ItemScore = z.number().int().min(0).max(3);

export const createGAD7Schema = z.object({
  PatientId: z.number().int().positive(),
  EncounterId: z.number().int().positive().optional(),
  NervousScore: gad7ItemScore.default(0),
  ControlWorryScore: gad7ItemScore.default(0),
  WorryScore: gad7ItemScore.default(0),
  RelaxScore: gad7ItemScore.default(0),
  RestlessScore: gad7ItemScore.default(0),
  IrritableScore: gad7ItemScore.default(0),
  FearScore: gad7ItemScore.default(0),
  Difficulty: z.string().optional(),
});

// ─── SOAP Notes ────────────────────────────────────────────────────────────
export const createSOAPSchema = z.object({
  PatientId: z.number().int().positive(),
  EncounterId: z.number().int().positive().optional(),
  ChiefComplaint: z.string().optional(),
  Subjective: z.string().optional(),
  Objective: z.string().optional(),
  Assessment: z.string().optional(),
  Plan: z.string().optional(),
});

// ─── Treatment Plan ────────────────────────────────────────────────────────
export const createTreatmentPlanSchema = z.object({
  PatientId: z.number().int().positive(),
  EncounterId: z.number().int().positive().optional(),
  ClientName: z.string().optional(),
  ClientNumber: z.number().int().optional(),
  Provider: z.string().optional(),
  AdmitDate: z.string().optional(),
  PresentingIssues: z.string().optional(),
  PatientHistory: z.string().optional(),
  Medications: z.string().optional(),
  AnyOtherRelevantInformation: z.string().optional(),
  Diagnosis: z.string().optional(),
  TreatmentReceived: z.string().optional(),
  RecommendationForFollowUp: z.string().optional(),
});

// ─── Social History (Enhanced) ─────────────────────────────────────────────
export const createSocialHistorySchema = z.object({
  PatientId: z.number().int().positive(),
  EncounterId: z.number().int().positive().optional(),
  SmokingStatus: z.string().optional(),
  SmokingPacksPerDay: z.number().optional(),
  SmokingQuitDate: z.string().optional(),
  TobaccoType: z.string().optional(),
  AlcoholUse: z.string().optional(),
  AlcoholUnitsPerWeek: z.number().optional(),
  RecreationalDrugs: z.string().optional(),
  DrugTypes: z.string().optional(),
  ExercisePatterns: z.string().optional(),
  SleepPatterns: z.string().optional(),
  CaffeineUse: z.string().optional(),
  SeatbeltUse: z.string().optional(),
  HazardousActivities: z.string().optional(),
  FamilyHistoryMother: z.string().optional(),
  FamilyHistoryFather: z.string().optional(),
  FamilyHistorySiblings: z.string().optional(),
  FamilyHistoryOffspring: z.string().optional(),
  Notes: z.string().optional(),
});

// ─── Problem List ──────────────────────────────────────────────────────────
export const createProblemSchema = z.object({
  PatientId: z.number().int().positive(),
  EncounterId: z.number().int().positive().optional(),
  ICD10Code: z.string().optional(),
  Description: z.string().min(1),
  Subtype: z.string().optional(),
  BegDate: z.string().optional(),
  EndDate: z.string().optional(),
  Severity: z.enum(['mild', 'moderate', 'severe']).default('moderate'),
  Comments: z.string().optional(),
  Status: z.enum(['active', 'inactive', 'resolved', 'deleted']).default('active'),
});

export const updateProblemSchema = createProblemSchema.partial().omit({ PatientId: true });

// ─── Family History ────────────────────────────────────────────────────────
export const createFamilyHistorySchema = z.object({
  PatientId: z.number().int().positive(),
  ICD10Code: z.string().optional(),
  ICD10Description: z.string().optional(),
  Relationship: z.string().optional(),
  Note: z.string().optional(),
});

// ─── Social History (Basic) ───────────────────────────────────────────────
export const createBasicSocialHistorySchema = z.object({
  PatientId: z.number().int().positive(),
  SmokingHistory: z.string().optional(),
  AlcoholHistory: z.string().optional(),
  DrugHistory: z.string().optional(),
  Occupation: z.string().optional(),
  FamilySupport: z.string().optional(),
  Note: z.string().optional(),
});

// ─── Surgical History ──────────────────────────────────────────────────────
export const createSurgicalHistorySchema = z.object({
  PatientId: z.number().int().positive(),
  ICD10Code: z.string().optional(),
  ICD10Description: z.string().optional(),
  SurgeryType: z.string().optional(),
  Note: z.string().optional(),
  SurgeryDate: z.string().optional(),
});

// ─── Diagnosis ─────────────────────────────────────────────────────────────
export const createDiagnosisSchema = z.object({
  PatientId: z.number().int().positive(),
  PatientVisitId: z.number().int().positive().optional(),
  ICD10ID: z.number().int().positive().optional(),
  ICD10Code: z.string().optional(),
  ICD10Description: z.string().min(1),
  DiagnosisType: z.enum(['primary', 'secondary', 'admitting', 'discharge']).default('primary'),
  Notes: z.string().optional(),
});

// ─── Diet ──────────────────────────────────────────────────────────────────
export const createDietSchema = z.object({
  PatientId: z.number().int().positive(),
  PatientVisitId: z.number().int().positive().optional(),
  DietTypeId: z.number().int().optional(),
  DietTypeName: z.string().optional(),
  DietName: z.string().optional(),
  Quantity: z.number().optional(),
  Unit: z.string().optional(),
  FeedingTime: z.string().optional(),
  Remarks: z.string().optional(),
});

export const updateDietSchema = createDietSchema.partial().omit({ PatientId: true });

// ─── Glucose ───────────────────────────────────────────────────────────────
export const createGlucoseSchema = z.object({
  PatientId: z.number().int().positive(),
  PatientVisitId: z.number().int().positive().optional(),
  SugarValue: z.number().positive(),
  Unit: z.string().default('mg/dL'),
  BSLType: z.enum(['Random', 'Fasting', 'PP']).optional(),
  MeasurementTime: z.string().optional(),
  Remarks: z.string().optional(),
});

export const updateGlucoseSchema = createGlucoseSchema.partial().omit({ PatientId: true });

// ─── Scoring Helpers ────────────────────────────────────────────────────────

export function scorePHQ9(data: z.infer<typeof createPHQ9Schema>) {
  const total =
    data.InterestScore + data.HopelessScore + data.SleepScore +
    data.FatigueScore + data.AppetiteScore + data.FailureScore +
    data.FocusScore + data.PsychomotorScore + data.SuicideScore;

  let severity: string;
  if (total <= 4) severity = 'Minimal';
  else if (total <= 9) severity = 'Mild';
  else if (total <= 14) severity = 'Moderate';
  else if (total <= 19) severity = 'Moderately Severe';
  else severity = 'Severe';

  const isFlagged = data.SuicideScore > 0 ? 1 : 0;

  return { total, severity, isFlagged };
}

export function scoreGAD7(data: z.infer<typeof createGAD7Schema>) {
  const total =
    data.NervousScore + data.ControlWorryScore + data.WorryScore +
    data.RelaxScore + data.RestlessScore + data.IrritableScore +
    data.FearScore;

  let severity: string;
  if (total <= 4) severity = 'Minimal';
  else if (total <= 9) severity = 'Mild';
  else if (total <= 14) severity = 'Moderate';
  else severity = 'Severe';

  const isFlagged = total >= 10 ? 1 : 0;

  return { total, severity, isFlagged };
}
