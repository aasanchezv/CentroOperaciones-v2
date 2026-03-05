/** Stage 1 — 45 días antes: aviso inicial de renovación */
export interface RenewalNoticeData {
  clientName: string
  policyNumber: string | null
  insurer: string
  endDate: string       // formatted: "15 de marzo de 2025"
  executiveName: string
  executivePhone: string | null
}

export function renewalNoticeHtml(d: RenewalNoticeData): string {
  const policyRef = d.policyNumber ? `Póliza <strong>${d.policyNumber}</strong>` : 'su póliza'
  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><title>Renovación de su póliza</title></head>
<body style="font-family:Arial,sans-serif;color:#1f2937;max-width:600px;margin:0 auto;padding:24px">
  <div style="background:#f8fafc;border-radius:8px;padding:32px">
    <p style="font-size:14px;color:#6b7280;margin:0 0 8px">Murguía Seguros</p>
    <h2 style="margin:0 0 24px;font-size:20px">Estimado/a ${d.clientName},</h2>
    <p>Nos comunicamos para informarle que ya estamos trabajando en la renovación de ${policyRef} con <strong>${d.insurer}</strong>, cuya vigencia vence el <strong>${d.endDate}</strong>.</p>
    <p>En los próximos días le enviaremos los detalles de su nueva póliza para su revisión y aprobación.</p>
    <p>Si tiene alguna pregunta, no dude en contactarnos.</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
    <p style="font-size:13px;color:#6b7280">
      ${d.executiveName}<br>
      Murguía Seguros${d.executivePhone ? `<br>${d.executivePhone}` : ''}
    </p>
  </div>
</body>
</html>`
}

export function renewalNoticeText(d: RenewalNoticeData): string {
  const policyRef = d.policyNumber ? `Póliza ${d.policyNumber}` : 'su póliza'
  return `Estimado/a ${d.clientName},\n\nYa estamos trabajando en la renovación de ${policyRef} con ${d.insurer} (vence ${d.endDate}).\n\nEn los próximos días le enviaremos los detalles.\n\n${d.executiveName}\nMurguía Seguros${d.executivePhone ? `\n${d.executivePhone}` : ''}`
}
