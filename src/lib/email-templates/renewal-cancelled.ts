/** Cierre — cliente canceló su póliza */
export interface RenewalCancelledData {
  clientName: string
  policyNumber: string | null
  insurer: string
  endDate: string
  executiveName: string
  executivePhone: string | null
}

export function renewalCancelledHtml(d: RenewalCancelledData): string {
  const policyRef = d.policyNumber ? `póliza <strong>${d.policyNumber}</strong>` : 'su póliza'
  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><title>Confirmación de cancelación de póliza</title></head>
<body style="font-family:Arial,sans-serif;color:#1f2937;max-width:600px;margin:0 auto;padding:24px">
  <div style="background:#f8fafc;border-radius:8px;padding:32px">
    <p style="font-size:14px;color:#6b7280;margin:0 0 8px">Murguía Seguros</p>
    <h2 style="margin:0 0 24px;font-size:20px">Estimado/a ${d.clientName},</h2>
    <p>Confirmamos la cancelación de la ${policyRef} con <strong>${d.insurer}</strong>, vigente hasta el <strong>${d.endDate}</strong>, conforme a su solicitud.</p>
    <p>Su cobertura estará activa hasta la fecha de vencimiento indicada. A partir de esa fecha no habrá renovación automática.</p>
    <p>Si en el futuro desea reactivar su cobertura o explorar opciones, con gusto le atendemos.</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
    <p style="font-size:13px;color:#6b7280">
      ${d.executiveName}<br>
      Murguía Seguros${d.executivePhone ? `<br>${d.executivePhone}` : ''}
    </p>
  </div>
</body>
</html>`
}

export function renewalCancelledText(d: RenewalCancelledData): string {
  const policyRef = d.policyNumber ? `póliza ${d.policyNumber}` : 'su póliza'
  return `Estimado/a ${d.clientName},\n\nConfirmamos la cancelación de la ${policyRef} con ${d.insurer} (vigente hasta ${d.endDate}).\n\nSu cobertura estará activa hasta esa fecha.\n\n${d.executiveName}\nMurguía Seguros${d.executivePhone ? `\n${d.executivePhone}` : ''}`
}
