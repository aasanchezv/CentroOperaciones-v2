/** Stage 3 — 15 días antes: alerta — sin confirmación */
export interface RenewalAlertData {
  clientName: string
  policyNumber: string | null
  insurer: string
  endDate: string
  executiveName: string
  executivePhone: string | null
}

export function renewalAlertHtml(d: RenewalAlertData): string {
  const policyRef = d.policyNumber ? `póliza <strong>${d.policyNumber}</strong>` : 'su póliza'
  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><title>Recordatorio importante: renovación de su póliza</title></head>
<body style="font-family:Arial,sans-serif;color:#1f2937;max-width:600px;margin:0 auto;padding:24px">
  <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:32px">
    <p style="font-size:14px;color:#6b7280;margin:0 0 8px">Murguía Seguros — Aviso importante</p>
    <h2 style="margin:0 0 24px;font-size:20px;color:#c2410c">Estimado/a ${d.clientName},</h2>
    <p>Le recordamos que la ${policyRef} con <strong>${d.insurer}</strong> vence el <strong>${d.endDate}</strong> — faltan menos de 15 días.</p>
    <p>Ya enviamos los detalles de su nueva póliza. Por favor confirme la recepción y aprobación a la brevedad para evitar cualquier interrupción en su cobertura.</p>
    <p>Puede responder directamente a este correo o al WhatsApp que le enviamos.</p>
    <hr style="border:none;border-top:1px solid #fdba74;margin:24px 0">
    <p style="font-size:13px;color:#6b7280">
      ${d.executiveName}<br>
      Murguía Seguros${d.executivePhone ? `<br>${d.executivePhone}` : ''}
    </p>
  </div>
</body>
</html>`
}

export function renewalAlertText(d: RenewalAlertData): string {
  const policyRef = d.policyNumber ? `póliza ${d.policyNumber}` : 'su póliza'
  return `AVISO IMPORTANTE — Estimado/a ${d.clientName},\n\nLa ${policyRef} con ${d.insurer} vence el ${d.endDate}. Faltan menos de 15 días.\n\nPor favor confirme la recepción y aprobación de su nueva póliza.\n\n${d.executiveName}\nMurguía Seguros${d.executivePhone ? `\n${d.executivePhone}` : ''}`
}
