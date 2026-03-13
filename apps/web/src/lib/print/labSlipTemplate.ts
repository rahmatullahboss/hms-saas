import { printHtml, formatMoney, formatDate } from './printUtils';

function escapeHtml(str: string | undefined | null): string {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export interface LabOrderPrintData {
  orderNo: string;
  orderDate: string;
  specimenType?: string;
  fastingRequired?: boolean;
  diagnosis?: string;
  patient: { name: string; patientCode?: string; mobile?: string; age?: number; gender?: string };
  tests: Array<{
    testName: string;
    code?: string;
    category?: string;
    unitPrice: number;
    result?: string;
    resultNumeric?: number;
    status: string;
    unit?: string;
    normalRange?: string;
    abnormalFlag?: string;
    priority?: string;
  }>;
  hospital?: { name: string; address?: string; phone?: string };
}

function getAbnormalBadge(flag?: string): string {
  if (!flag || flag === 'pending') return '';
  const badges: Record<string, string> = {
    normal: '<span style="color:#16a34a;font-weight:600">Normal</span>',
    high: '<span style="color:#ea580c;font-weight:600">⬆ High</span>',
    low: '<span style="color:#2563eb;font-weight:600">⬇ Low</span>',
    critical: '<span style="background:#dc2626;color:white;padding:1px 6px;border-radius:3px;font-weight:700">⚠ CRITICAL</span>',
  };
  return badges[flag] ?? '';
}

export function printLabSlip(data: LabOrderPrintData): void {
  const testRows = data.tests.map((t) => `
    <tr${t.abnormalFlag === 'critical' ? ' style="background:#fef2f2"' : ''}>
      <td>
        ${escapeHtml(t.testName)}${t.code ? ` <span style="font-size:10px;color:#94a3b8">[${escapeHtml(t.code)}]</span>` : ''}
        ${t.priority === 'stat' ? '<span style="color:#dc2626;font-size:10px;font-weight:700"> STAT</span>' : ''}
        ${t.priority === 'urgent' ? '<span style="color:#ea580c;font-size:10px;font-weight:700"> URGENT</span>' : ''}
      </td>
      <td>${t.result
        ? `<strong>${escapeHtml(t.result)}</strong>${t.unit ? ` <span style="font-size:10px;color:#64748b">${escapeHtml(t.unit)}</span>` : ''}`
        : '<span style="color:#94a3b8">Pending</span>'
      }</td>
      <td style="font-size:11px;color:#64748b">${escapeHtml(t.normalRange) || '—'}</td>
      <td>${getAbnormalBadge(t.abnormalFlag)}</td>
    </tr>`).join('');

  const totalAmount = data.tests.reduce((sum, t) => sum + t.unitPrice, 0);

  const html = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <h1 style="margin:0;font-size:20px">${escapeHtml(data.hospital?.name) || 'HMS Laboratory'}</h1>
        ${data.hospital?.address ? `<div style="font-size:12px;color:#64748b;margin-top:2px">${escapeHtml(data.hospital.address)}</div>` : ''}
        ${data.hospital?.phone ? `<div style="font-size:12px;color:#64748b">📞 ${escapeHtml(data.hospital.phone)}</div>` : ''}
      </div>
      <div style="text-align:right">
        <h2 style="margin:0;font-size:16px;color:#1e40af">LAB TEST REPORT</h2>
        <div style="font-size:12px">Order: <strong>${escapeHtml(data.orderNo)}</strong></div>
        <div style="font-size:11px;color:#64748b">Date: ${formatDate(data.orderDate)}</div>
      </div>
    </div>
    <hr style="border:1px solid #e2e8f0;margin:12px 0" />

    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px">
      <tr>
        <td style="padding:4px 0"><strong>Patient:</strong> ${escapeHtml(data.patient.name)}</td>
        <td style="padding:4px 0">${data.patient.patientCode ? `<strong>ID:</strong> ${escapeHtml(data.patient.patientCode)}` : ''}</td>
      </tr>
      <tr>
        <td style="padding:4px 0">${data.patient.mobile ? `<strong>Mobile:</strong> ${escapeHtml(data.patient.mobile)}` : ''}</td>
        <td style="padding:4px 0">
          ${data.patient.age ? `<strong>Age:</strong> ${data.patient.age} yrs` : ''}
          ${data.patient.gender ? ` | <strong>Gender:</strong> ${escapeHtml(data.patient.gender)}` : ''}
        </td>
      </tr>
      ${data.specimenType ? `<tr><td style="padding:4px 0"><strong>Specimen:</strong> ${escapeHtml(data.specimenType)}</td><td>${data.fastingRequired ? '⚠️ <strong>Fasting Required</strong>' : ''}</td></tr>` : ''}
      ${data.diagnosis ? `<tr><td colspan="2" style="padding:4px 0"><strong>Diagnosis:</strong> ${escapeHtml(data.diagnosis)}</td></tr>` : ''}
    </table>

    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0">
          <th style="padding:8px;text-align:left">Test Name</th>
          <th style="padding:8px;text-align:left">Result</th>
          <th style="padding:8px;text-align:left">Normal Range</th>
          <th style="padding:8px;text-align:center">Status</th>
        </tr>
      </thead>
      <tbody>${testRows}</tbody>
    </table>

    <div style="display:flex;justify-content:flex-end;margin-top:12px;padding:8px;background:#f8fafc;border-radius:4px">
      <div style="font-size:13px"><strong>Total:</strong> ${formatMoney(totalAmount)}</div>
    </div>

    <div style="border-top:2px solid #e2e8f0;margin-top:40px;padding-top:8px;display:flex;justify-content:space-between">
      <div style="text-align:center;min-width:140px">
        <hr style="margin-bottom:4px;border-color:#cbd5e1"/>
        <span style="font-size:11px;color:#64748b">Lab Technician</span>
      </div>
      <div style="text-align:center;min-width:140px">
        <hr style="margin-bottom:4px;border-color:#cbd5e1"/>
        <span style="font-size:11px;color:#64748b">Pathologist / Doctor</span>
      </div>
    </div>`;

  printHtml(html, `Lab Report ${data.orderNo}`);
}
