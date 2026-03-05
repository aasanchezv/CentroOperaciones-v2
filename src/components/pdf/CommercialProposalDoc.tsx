// Server-only PDF component — only imported from API route (generate-pdf)
// Uses @react-pdf/renderer which renders to bytes, NOT to DOM

import React from 'react'
import {
  Document, Page, Text, View, StyleSheet, Image, Font,
} from '@react-pdf/renderer'

// ─── Types ────────────────────────────────────────────────────

export interface ProposalDocData {
  process_title:  string
  branch:         string
  client_name:    string
  fecha:          string
  asesor:         string
  slip: {
    suma_asegurada:       string
    coberturas_requeridas: string
    vigencia_from:        string
    vigencia_to:          string
    deducible:            string
    condiciones:          string
  }
  proposals: {
    insurer_name:  string
    prima:         number | null
    suma_asegurada: string
    coberturas:    string
    exclusiones:   string
    deducible:     string
    vigencia:      string
    condiciones:   string
  }[]
  recommendation: string
}

// ─── Brand colors ─────────────────────────────────────────────

const NAVY  = '#0A2F6B'
const GREEN = '#16A34A'
const GRAY  = '#6B7280'
const LIGHT = '#F9FAFB'
const BORDER = '#E5E7EB'

// ─── Styles ───────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#111827',
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 48,
  },
  // Cover
  coverPage: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#fff',
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    backgroundColor: NAVY,
  },
  coverBg: {
    flex: 1,
    backgroundColor: NAVY,
    padding: 56,
    justifyContent: 'space-between',
  },
  coverLogo: {
    width: 120,
    height: 40,
    objectFit: 'contain',
    marginBottom: 48,
  },
  coverTitle: {
    fontSize: 28,
    fontFamily: 'Helvetica-Bold',
    color: '#fff',
    letterSpacing: 1,
    marginBottom: 8,
  },
  coverSubtitle: {
    fontSize: 13,
    color: '#93C5FD',
    marginBottom: 48,
  },
  coverClient: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#fff',
    marginBottom: 6,
  },
  coverBranch: {
    fontSize: 11,
    color: '#BBF7D0',
    backgroundColor: GREEN,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: 48,
  },
  coverMeta: {
    fontSize: 9,
    color: '#93C5FD',
    marginBottom: 3,
  },
  coverLine: {
    height: 2,
    backgroundColor: GREEN,
    marginBottom: 12,
  },
  // Section headers
  sectionHeader: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
    borderBottomWidth: 2,
    borderBottomColor: GREEN,
    paddingBottom: 4,
    marginBottom: 12,
    marginTop: 20,
  },
  // Info rows
  row: { flexDirection: 'row', marginBottom: 5 },
  label: { width: 130, color: GRAY, fontSize: 8 },
  value: { flex: 1, fontSize: 9 },
  // Table
  table: { marginTop: 8 },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: NAVY,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  tableHeaderCell: {
    color: '#fff',
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingVertical: 5,
    paddingHorizontal: 6,
    minHeight: 24,
  },
  tableRowAlt: {
    backgroundColor: LIGHT,
  },
  tableCell: {
    fontSize: 8,
    paddingRight: 4,
  },
  tableCellBold: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
  },
  bestBadge: {
    backgroundColor: GREEN,
    color: '#fff',
    fontSize: 7,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    marginTop: 1,
  },
  // Recommendation
  recBox: {
    backgroundColor: '#EFF6FF',
    borderLeftWidth: 3,
    borderLeftColor: NAVY,
    padding: 12,
    marginTop: 8,
    borderRadius: 4,
  },
  recText: {
    fontSize: 9,
    lineHeight: 1.6,
    color: '#1e3a5f',
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 48,
    right: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 6,
  },
  footerText: { fontSize: 7, color: GRAY },
  pageNumber: { fontSize: 7, color: GRAY },
})

// ─── Column widths for comparison table ──────────────────────

const COL = {
  insurer:  '18%',
  prima:    '12%',
  suma:     '13%',
  cobs:     '22%',
  excl:     '16%',
  ded:      '10%',
  vig:      '9%',
}

// ─── Cover Page ───────────────────────────────────────────────

function CoverPage({ data }: { data: ProposalDocData }) {
  return (
    <Page size="A4" style={s.coverPage}>
      <View style={s.coverBg}>
        {/* Logo */}
        <Image src="/logo.png" style={s.coverLogo} />

        {/* Main title */}
        <View>
          <Text style={s.coverTitle}>PROPUESTA COMERCIAL</Text>
          <Text style={s.coverSubtitle}>DE SEGUROS</Text>
          <View style={s.coverLine} />
        </View>

        {/* Client info */}
        <View>
          {data.client_name ? (
            <>
              <Text style={{ fontSize: 9, color: '#93C5FD', marginBottom: 4 }}>PREPARADO PARA</Text>
              <Text style={s.coverClient}>{data.client_name}</Text>
            </>
          ) : null}
          {data.branch ? (
            <View style={{ marginBottom: 24 }}>
              <Text style={s.coverBranch}>{data.branch.toUpperCase()}</Text>
            </View>
          ) : null}
          <Text style={{ fontSize: 11, color: '#fff', fontFamily: 'Helvetica-Bold', marginBottom: 8 }}>
            {data.process_title}
          </Text>
        </View>

        {/* Meta */}
        <View>
          <Text style={s.coverMeta}>Fecha: {data.fecha}</Text>
          {data.asesor ? <Text style={s.coverMeta}>Asesor: {data.asesor}</Text> : null}
          <Text style={{ ...s.coverMeta, marginTop: 8, fontSize: 7 }}>CONFIDENCIAL — USO EXCLUSIVO DEL CLIENTE</Text>
        </View>
      </View>
    </Page>
  )
}

// ─── Slip Summary Page ────────────────────────────────────────

function SlipPage({ data }: { data: ProposalDocData }) {
  const { slip } = data
  return (
    <Page size="A4" style={s.page}>
      <Text style={s.sectionHeader}>RESUMEN DEL RIESGO</Text>

      <Text style={{ fontSize: 8, color: GRAY, marginBottom: 12 }}>
        Datos del riesgo solicitado según slip de cotización
      </Text>

      {slip.suma_asegurada ? (
        <View style={s.row}>
          <Text style={s.label}>Suma asegurada:</Text>
          <Text style={s.value}>{slip.suma_asegurada}</Text>
        </View>
      ) : null}
      {data.branch ? (
        <View style={s.row}>
          <Text style={s.label}>Ramo:</Text>
          <Text style={s.value}>{data.branch}</Text>
        </View>
      ) : null}
      {slip.vigencia_from ? (
        <View style={s.row}>
          <Text style={s.label}>Vigencia:</Text>
          <Text style={s.value}>
            {slip.vigencia_from}{slip.vigencia_to ? ` al ${slip.vigencia_to}` : ''}
          </Text>
        </View>
      ) : null}
      {slip.deducible ? (
        <View style={s.row}>
          <Text style={s.label}>Deducible solicitado:</Text>
          <Text style={s.value}>{slip.deducible}</Text>
        </View>
      ) : null}
      {slip.coberturas_requeridas ? (
        <View style={s.row}>
          <Text style={s.label}>Coberturas requeridas:</Text>
          <Text style={s.value}>{slip.coberturas_requeridas}</Text>
        </View>
      ) : null}
      {slip.condiciones ? (
        <View style={s.row}>
          <Text style={s.label}>Condiciones especiales:</Text>
          <Text style={s.value}>{slip.condiciones}</Text>
        </View>
      ) : null}

      <Footer />
    </Page>
  )
}

// ─── Comparison Table Page ────────────────────────────────────

function ComparisonPage({ data }: { data: ProposalDocData }) {
  const { proposals } = data
  if (!proposals.length) return null

  // Find lowest prima for highlighting
  const primas = proposals.map(p => p.prima ?? Infinity).filter(p => p < Infinity)
  const lowestPrima = primas.length > 0 ? Math.min(...primas) : null

  return (
    <Page size="A4" style={s.page} orientation="landscape">
      <Text style={s.sectionHeader}>TABLA COMPARATIVA DE PROPUESTAS</Text>

      <View style={s.table}>
        {/* Header */}
        <View style={s.tableHeader}>
          <Text style={{ ...s.tableHeaderCell, width: COL.insurer }}>Aseguradora</Text>
          <Text style={{ ...s.tableHeaderCell, width: COL.prima }}>Prima Anual</Text>
          <Text style={{ ...s.tableHeaderCell, width: COL.suma }}>Suma Aseg.</Text>
          <Text style={{ ...s.tableHeaderCell, width: COL.cobs }}>Coberturas</Text>
          <Text style={{ ...s.tableHeaderCell, width: COL.excl }}>Exclusiones</Text>
          <Text style={{ ...s.tableHeaderCell, width: COL.ded }}>Deducible</Text>
          <Text style={{ ...s.tableHeaderCell, width: COL.vig }}>Vigencia</Text>
        </View>

        {proposals.map((p, i) => {
          const isBest = lowestPrima !== null && p.prima === lowestPrima
          return (
            <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]} wrap={false}>
              <View style={{ width: COL.insurer }}>
                <Text style={isBest ? s.tableCellBold : s.tableCell}>{p.insurer_name}</Text>
                {isBest ? <Text style={s.bestBadge}>★ Mejor precio</Text> : null}
              </View>
              <Text style={{ ...s.tableCell, width: COL.prima, fontFamily: isBest ? 'Helvetica-Bold' : 'Helvetica', color: isBest ? GREEN : '#111827' }}>
                {p.prima != null ? `$${p.prima.toLocaleString('es-MX')}` : '—'}
              </Text>
              <Text style={{ ...s.tableCell, width: COL.suma }}>{p.suma_asegurada || '—'}</Text>
              <Text style={{ ...s.tableCell, width: COL.cobs }}>{p.coberturas || '—'}</Text>
              <Text style={{ ...s.tableCell, width: COL.excl }}>{p.exclusiones || '—'}</Text>
              <Text style={{ ...s.tableCell, width: COL.ded }}>{p.deducible || '—'}</Text>
              <Text style={{ ...s.tableCell, width: COL.vig }}>{p.vigencia || '—'}</Text>
            </View>
          )
        })}
      </View>

      <Footer />
    </Page>
  )
}

// ─── Recommendation Page ──────────────────────────────────────

function RecommendationPage({ data }: { data: ProposalDocData }) {
  return (
    <Page size="A4" style={s.page}>
      <Text style={s.sectionHeader}>RECOMENDACIÓN DEL ASESOR</Text>

      <View style={s.recBox}>
        <Text style={s.recText}>{data.recommendation}</Text>
      </View>

      <View style={{ marginTop: 40, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 16 }}>
        <Text style={{ fontSize: 8, color: GRAY, marginBottom: 4 }}>Preparado por:</Text>
        <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: NAVY }}>
          {data.asesor}
        </Text>
        <Text style={{ fontSize: 8, color: GRAY, marginTop: 2 }}>Murguía Seguros</Text>
      </View>

      <Footer />
    </Page>
  )
}

// ─── Footer ───────────────────────────────────────────────────

function Footer() {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>Murguía Seguros — Propuesta Comercial Confidencial</Text>
      <Text style={s.pageNumber} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  )
}

// ─── Main Document ────────────────────────────────────────────

export function CommercialProposalDoc({ data }: { data: ProposalDocData }) {
  return (
    <Document
      title={`Propuesta Comercial — ${data.client_name || data.process_title}`}
      author="Murguía Seguros"
      subject={`${data.branch} — ${data.process_title}`}
    >
      <CoverPage data={data} />
      <SlipPage data={data} />
      <ComparisonPage data={data} />
      <RecommendationPage data={data} />
    </Document>
  )
}
