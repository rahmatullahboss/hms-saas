import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import {
  callAIJson,
  checkAIRateLimit,
  AIError,
  SYSTEM_PROMPTS,
  type ChatMessage,
} from '../../lib/ai';
import {
  prescriptionAssistSchema,
  diagnosisSuggestSchema,
  billingFromNotesSchema,
  triageChatSchema,
  noteSummarySchema,
  labInterpretSchema,
  dashboardInsightsSchema,
} from '../../schemas/ai';
import type { Env, Variables } from '../../types';
import { requireTenantId, requireUserId } from '../../lib/context-helpers';

const aiRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── Middleware: check API key + rate limit ──────────────────────────────────

aiRoutes.use('*', async (c, next) => {
  if (!c.env.OPENROUTER_API_KEY) {
    throw new HTTPException(503, { message: 'AI service not configured. Contact your administrator.' });
  }

  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  if (!tenantId || !userId) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const allowed = await checkAIRateLimit(c.env.KV, tenantId, userId);
  if (!allowed) {
    throw new HTTPException(429, { message: 'AI rate limit exceeded. Please wait a moment.' });
  }

  await next();
});

// ─── Helper: get API key and model ──────────────────────────────────────────

function getConfig(env: Env) {
  return {
    apiKey: env.OPENROUTER_API_KEY!,
    model: env.AI_MODEL ?? 'openrouter/healer-alpha',
  };
}

// ─── Helper: wrap AI errors ─────────────────────────────────────────────────

function handleAIError(err: unknown): never {
  if (err instanceof HTTPException) throw err;
  if (err instanceof AIError) {
    const code = (err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500) as 400 | 401 | 403 | 404 | 408 | 429 | 500 | 502 | 503;
    throw new HTTPException(code, { message: err.message });
  }
  console.error('[AI] Unexpected error:', err);
  throw new HTTPException(500, { message: 'AI service temporarily unavailable' });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Feature 1: Prescription AI Assistant
// ═══════════════════════════════════════════════════════════════════════════════

aiRoutes.post('/prescription-assist', zValidator('json', prescriptionAssistSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const data = c.req.valid('json');
  const { apiKey, model } = getConfig(c.env);

  try {
    // Fetch patient info if patientId is provided
    let patientContext = '';
    if (data.patientId) {
      const patient = await c.env.DB.prepare(
        `SELECT name, date_of_birth, gender, blood_group FROM patients WHERE id = ? AND tenant_id = ?`,
      ).bind(data.patientId, tenantId).first<{
        name: string; date_of_birth?: string; gender?: string; blood_group?: string;
      }>();

      if (patient) {
        const age = patient.date_of_birth
          ? Math.floor((Date.now() - new Date(patient.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
          : data.patientAge;
        patientContext = `\nPatient: ${patient.name}, Age: ${age ?? 'unknown'}, Gender: ${patient.gender ?? data.patientGender ?? 'unknown'}, Blood Group: ${patient.blood_group ?? 'unknown'}`;
      }
    }

    const userMessage = `Medications being prescribed:
${data.medications.map((m, i) => `${i + 1}. ${m.name}${m.dosage ? ` ${m.dosage}` : ''}${m.frequency ? ` ${m.frequency}` : ''}${m.duration ? ` for ${m.duration}` : ''}`).join('\n')}
${patientContext}
${data.knownAllergies?.length ? `Known allergies: ${data.knownAllergies.join(', ')}` : ''}
${data.patientAge ? `Age: ${data.patientAge}` : ''}
${data.patientWeight ? `Weight: ${data.patientWeight}kg` : ''}`;

    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPTS.prescriptionAssist },
      { role: 'user', content: userMessage },
    ];

    const aiResult = await callAIJson<Record<string, unknown>>(apiKey, messages, { model });
    return c.json({ ...aiResult.data, usage: aiResult.usage });
  } catch (err) {
    handleAIError(err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Feature 2: Smart Diagnosis Suggestions
// ═══════════════════════════════════════════════════════════════════════════════

aiRoutes.post('/diagnosis-suggest', zValidator('json', diagnosisSuggestSchema), async (c) => {
  const data = c.req.valid('json');
  const { apiKey, model } = getConfig(c.env);

  try {
    const vitalsStr = data.vitals
      ? Object.entries(data.vitals)
          .filter(([, v]) => v)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ')
      : 'Not provided';

    const userMessage = `Patient Symptoms: ${data.symptoms}
Vitals: ${vitalsStr}
Age: ${data.patientAge ?? 'unknown'}, Gender: ${data.patientGender ?? 'unknown'}
${data.medicalHistory ? `Medical History: ${data.medicalHistory}` : ''}`;

    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPTS.diagnosisSuggest },
      { role: 'user', content: userMessage },
    ];

    const aiResult = await callAIJson<Record<string, unknown>>(apiKey, messages, { model });
    return c.json({ ...aiResult.data, usage: aiResult.usage });
  } catch (err) {
    handleAIError(err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Feature 3: Auto-generate Billing from Consultation Notes
// ═══════════════════════════════════════════════════════════════════════════════

aiRoutes.post('/billing-from-notes', zValidator('json', billingFromNotesSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const data = c.req.valid('json');
  const { apiKey, model } = getConfig(c.env);

  try {
    // Fetch available test/service prices for context
    const { results: tests } = await c.env.DB.prepare(
      `SELECT name, price FROM tests WHERE tenant_id = ? ORDER BY name LIMIT 50`,
    ).bind(tenantId).all<{ name: string; price: number }>();

    const priceContext = tests.length
      ? `\nAvailable services and their prices:\n${tests.map((t) => `- ${t.name}: ৳${t.price}`).join('\n')}`
      : '';

    const userMessage = `Consultation Notes:\n${data.consultationNotes}${priceContext}`;

    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPTS.billingFromNotes },
      { role: 'user', content: userMessage },
    ];

    const aiResult = await callAIJson<Record<string, unknown>>(apiKey, messages, { model });
    return c.json({ ...aiResult.data, usage: aiResult.usage });
  } catch (err) {
    handleAIError(err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Feature 4: Patient Symptom Triage Chatbot
// ═══════════════════════════════════════════════════════════════════════════════

aiRoutes.post('/triage', zValidator('json', triageChatSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const data = c.req.valid('json');
  const { apiKey, model } = getConfig(c.env);

  try {
    // Get available doctor specialties for this hospital
    const { results: specialties } = await c.env.DB.prepare(
      `SELECT DISTINCT specialty FROM doctors WHERE tenant_id = ? AND status = 'active' ORDER BY specialty`,
    ).bind(tenantId).all<{ specialty: string }>();

    const deptList = specialties.length
      ? specialties.map((s) => s.specialty).filter(Boolean).join(', ')
      : 'General Medicine, Surgery, Pediatrics, Obstetrics & Gynecology, Orthopedics, ENT, Ophthalmology, Dermatology, Cardiology, Neurology';

    const systemPrompt = SYSTEM_PROMPTS.triage.replace(
      'Available departments: General Medicine, Surgery, Pediatrics, Obstetrics & Gynecology,\nOrthopedics, ENT, Ophthalmology, Dermatology, Cardiology, Neurology, Urology,\nPsychiatry, Emergency, Dental.',
      `Available departments at this hospital: ${deptList}.`,
    );

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...data.conversationHistory.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: data.message },
    ];

    const aiResult = await callAIJson<Record<string, unknown>>(apiKey, messages, { model, temperature: 0.5 });
    return c.json({ ...aiResult.data, usage: aiResult.usage });
  } catch (err) {
    handleAIError(err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Feature 5: Clinical Note Summarization
// ═══════════════════════════════════════════════════════════════════════════════

aiRoutes.post('/summarize-note', zValidator('json', noteSummarySchema), async (c) => {
  const data = c.req.valid('json');
  const { apiKey, model } = getConfig(c.env);

  try {
    const userMessage = `Format: ${data.format.toUpperCase()}\n\nClinical Note:\n${data.note}`;

    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPTS.summarizeNote },
      { role: 'user', content: userMessage },
    ];

    const aiResult = await callAIJson<Record<string, unknown>>(apiKey, messages, { model });
    return c.json({ ...aiResult.data, usage: aiResult.usage });
  } catch (err) {
    handleAIError(err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Feature 6: Lab Report Interpretation
// ═══════════════════════════════════════════════════════════════════════════════

aiRoutes.post('/interpret-lab', zValidator('json', labInterpretSchema), async (c) => {
  const data = c.req.valid('json');
  const { apiKey, model } = getConfig(c.env);

  try {
    const userMessage = `Lab Results:
${data.results.map((r, i) => `${i + 1}. ${r.testName}: ${r.value}${r.unit ? ` ${r.unit}` : ''}${r.normalRange ? ` (ref: ${r.normalRange})` : ''}`).join('\n')}
${data.patientAge ? `Patient Age: ${data.patientAge}` : ''}
${data.patientGender ? `Patient Gender: ${data.patientGender}` : ''}`;

    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPTS.interpretLab },
      { role: 'user', content: userMessage },
    ];

    const aiResult = await callAIJson<Record<string, unknown>>(apiKey, messages, { model });
    return c.json({ ...aiResult.data, usage: aiResult.usage });
  } catch (err) {
    handleAIError(err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Feature 7: Dashboard Predictive Analytics / Insights
// ═══════════════════════════════════════════════════════════════════════════════

aiRoutes.post('/dashboard-insights', zValidator('json', dashboardInsightsSchema), async (c) => {
  const tenantId = requireTenantId(c);
  const data = c.req.valid('json');
  const { apiKey, model } = getConfig(c.env);

  try {
    // Fetch aggregate data from D1
    const [revenueData, patientData, visitData, expenseData] = await Promise.all([
      c.env.DB.prepare(`
        SELECT strftime('%Y-%m', created_at) AS month,
               SUM(total_amount) AS revenue,
               COUNT(*) AS bill_count
        FROM bills WHERE tenant_id = ? AND date(created_at) BETWEEN ? AND ?
        GROUP BY month ORDER BY month
      `).bind(tenantId, data.dateRange.from, data.dateRange.to).all(),

      c.env.DB.prepare(`
        SELECT COUNT(*) AS total_patients,
               SUM(CASE WHEN date(created_at) BETWEEN ? AND ? THEN 1 ELSE 0 END) AS new_patients
        FROM patients WHERE tenant_id = ?
      `).bind(data.dateRange.from, data.dateRange.to, tenantId).first(),

      c.env.DB.prepare(`
        SELECT strftime('%Y-%m', visit_date) AS month,
               COUNT(*) AS visit_count
        FROM visits WHERE tenant_id = ? AND date(visit_date) BETWEEN ? AND ?
        GROUP BY month ORDER BY month
      `).bind(tenantId, data.dateRange.from, data.dateRange.to).all(),

      c.env.DB.prepare(`
        SELECT SUM(amount) AS total_expenses
        FROM expenses WHERE tenant_id = ? AND date(date) BETWEEN ? AND ?
      `).bind(tenantId, data.dateRange.from, data.dateRange.to).first(),
    ]);

    const userMessage = `Hospital Operational Data (${data.dateRange.from} to ${data.dateRange.to}):

Revenue by Month:
${revenueData.results.map((r: Record<string, unknown>) => `${r.month}: ৳${r.revenue} (${r.bill_count} bills)`).join('\n') || 'No data'}

Patients: Total ${(patientData as Record<string, unknown>)?.total_patients ?? 0}, New in period: ${(patientData as Record<string, unknown>)?.new_patients ?? 0}

Visits by Month:
${visitData.results.map((r: Record<string, unknown>) => `${r.month}: ${r.visit_count} visits`).join('\n') || 'No data'}

Total Expenses: ৳${(expenseData as Record<string, unknown>)?.total_expenses ?? 0}`;

    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPTS.dashboardInsights },
      { role: 'user', content: userMessage },
    ];

    const aiResult = await callAIJson<Record<string, unknown>>(apiKey, messages, { model, temperature: 0.4 });
    return c.json({ ...aiResult.data, usage: aiResult.usage });
  } catch (err) {
    handleAIError(err);
  }
});

export default aiRoutes;
