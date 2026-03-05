/** Stage 2 — 30 días antes: nueva póliza lista + comparativo */
export interface RenewalPolicyData {
  clientName: string
  insurer: string
  // Póliza anterior
  prevPolicyNumber: string | null
  prevEndDate: string
  prevPremium: number | null
  // Nueva póliza
  newPolicyNumber: string | null
  newStartDate: string
  newEndDate: string
  newPremium: number | null
  // Ejecutivo
  executiveName: string
  executivePhone: string | null
}

function formatMXN(amount: number | null): string {
  if (amount === null) return 'N/D'
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount)
}

function premiumDiff(prev: number | null, next: number | null): string {
  if (prev === null || next === null) return ''
  const diff = next - prev
  const pct  = prev > 0 ? ((diff / prev) * 100).toFixed(1) : '0'
  if (diff > 0) return ` <span style="color:#dc2626">(+${formatMXN(diff)} / +${pct}%)</span>`
  if (diff < 0) return ` <span style="color:#16a34a">(${formatMXN(diff)} / ${pct}%)</span>`
  return ' <span style="color:#6b7280">(sin cambio)</span>'
}

export function renewalPolicyHtml(d: RenewalPolicyData): string {
  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><title>Su nueva póliza está lista</title></head>
<body style="font-family:Arial,sans-serif;color:#1f2937;max-width:600px;margin:0 auto;padding:24px">
  <div style="background:#f8fafc;border-radius:8px;padding:32px">
    <p style="font-size:14px;color:#6b7280;margin:0 0 8px">Murguía Seguros</p>
    <h2 style="margin:0 0 24px;font-size:20px">Estimado/a ${d.clientName},</h2>
    <p>Su nueva póliza con <strong>${d.insurer}</strong> está lista para su revisión.</p>

    <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:13px">
      <thead>
        <tr style="background:#f1f5f9">
          <th style="text-align:left;padding:8px 12px;border:1px solid #e2e8f0"></th>
          <th style="text-align:right;padding:8px 12px;border:1px solid #e2e8f0">Póliza anterior</th>
          <th style="text-align:right;padding:8px 12px;border:1px solid #e2e8f0">Nueva póliza</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="padding:8px 12px;border:1px solid #e2e8f0">Número</td>
          <td style="text-align:right;padding:8px 12px;border:1px solid #e2e8f0">${d.prevPolicyNumber ?? 'N/D'}</td>
          <td style="text-align:right;padding:8px 12px;border:1px solid #e2e8f0">${d.newPolicyNumber ?? 'N/D'}</td>
        </tr>
        <tr style="background:#fafafa">
          <td style="padding:8px 12px;border:1px solid #e2e8f0">Vigencia</td>
          <td style="text-align:right;padding:8px 12px;border:1px solid #e2e8f0">hasta ${d.prevEndDate}</td>
          <td style="text-align:right;padding:8px 12px;border:1px solid #e2e8f0">${d.newStartDate} – ${d.newEndDate}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;border:1px solid #e2e8f0">Prima anual</td>
          <td style="text-align:right;padding:8px 12px;border:1px solid #e2e8f0">${formatMXN(d.prevPremium)}</td>
          <td style="text-align:right;padding:8px 12px;border:1px solid #e2e8f0">${formatMXN(d.newPremium)}${premiumDiff(d.prevPremium, d.newPremium)}</td>
        </tr>
      </tbody>
    </table>

    <p>Por favor confirme la recepción de esta información respondiendo a este correo o al WhatsApp que le enviamos.</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
    <p style="font-size:13px;color:#6b7280">
      ${d.executiveName}<br>
      Murguía Seguros${d.executivePhone ? `<br>${d.executivePhone}` : ''}
    </p>
  </div>
</body>
</html>`
}

export function renewalPolicyText(d: RenewalPolicyData): string {
  return `Estimado/a ${d.clientName},\n\nSu nueva póliza con ${d.insurer} está lista.\n\nPóliza anterior: ${d.prevPolicyNumber ?? 'N/D'} — prima ${formatMXN(d.prevPremium)}\nNueva póliza: ${d.newPolicyNumber ?? 'N/D'} — prima ${formatMXN(d.newPremium)}\nVigencia: ${d.newStartDate} al ${d.newEndDate}\n\nPor favor confirme la recepción respondiendo este mensaje.\n\n${d.executiveName}\nMurguía Seguros${d.executivePhone ? `\n${d.executivePhone}` : ''}`
}
