'use client'

import { useState, useRef } from 'react'

interface InsurerUploadProps {
  token:            string
  insurerName:      string
  processTitle:     string
  branch:           string
  clientName:       string
  sumaAsegurada:    string
  vigenciaFrom:     string
  vigenciaTo:       string
  alreadyReceived:  boolean
  receivedAt:       string | null
  proposalFilename: string | null
}

export function InsurerUpload({
  token, insurerName, processTitle, branch,
  clientName, sumaAsegurada, vigenciaFrom, vigenciaTo,
  alreadyReceived, receivedAt, proposalFilename,
}: InsurerUploadProps) {
  const [file,         setFile]         = useState<File | null>(null)
  const [dragging,     setDragging]     = useState(false)
  const [uploading,    setUploading]    = useState(false)
  const [success,      setSuccess]      = useState(alreadyReceived)
  const [successFile,  setSuccessFile]  = useState(proposalFilename)
  const [successDate,  setSuccessDate]  = useState(receivedAt)
  const [error,        setError]        = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFileSelect(selected: File | null) {
    if (!selected) return
    const allowed = ['application/pdf', 'image/jpeg', 'image/png']
    if (!allowed.includes(selected.type) && !selected.name.endsWith('.pdf')) {
      setError('Solo se aceptan archivos PDF, JPG o PNG')
      return
    }
    if (selected.size > 20 * 1024 * 1024) {
      setError('El archivo no puede superar 20 MB')
      return
    }
    setError(null)
    setFile(selected)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const dropped = e.dataTransfer.files[0]
    handleFileSelect(dropped ?? null)
  }

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/gtm/upload/${token}`, {
        method: 'POST',
        body:   form,
      })
      const json = await res.json() as { ok?: boolean; message?: string; error?: string }
      if (!res.ok || json.error) {
        setError(json.error ?? 'Error al subir el archivo')
        return
      }
      setSuccess(true)
      setSuccessFile(file.name)
      setSuccessDate(new Date().toISOString())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#0A2F6B] px-6 py-4 flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Murguía Seguros" className="h-10 w-auto" />
        <div className="border-l border-blue-400 pl-4">
          <p className="text-white text-sm font-semibold">Portal de Cotizaciones</p>
          <p className="text-blue-300 text-xs">Murguía Seguros</p>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-6 py-10 space-y-6">

        {/* Welcome card */}
        <div className="bg-white rounded-xl border shadow-sm p-6">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Solicitud de cotización</p>
          <h1 className="text-lg font-semibold text-gray-900 mb-1">{processTitle}</h1>
          {insurerName && (
            <p className="text-sm text-gray-600">Dirigido a: <strong>{insurerName}</strong></p>
          )}
        </div>

        {/* Process info */}
        {(clientName || branch || sumaAsegurada || vigenciaFrom) && (
          <div className="bg-white rounded-xl border shadow-sm p-6">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Datos del riesgo</h2>
            <div className="space-y-2">
              {clientName && (
                <div className="flex gap-3 text-sm">
                  <span className="text-gray-400 w-28 shrink-0">Cliente</span>
                  <span className="text-gray-700 font-medium">{clientName}</span>
                </div>
              )}
              {branch && (
                <div className="flex gap-3 text-sm">
                  <span className="text-gray-400 w-28 shrink-0">Ramo</span>
                  <span className="text-gray-700">{branch}</span>
                </div>
              )}
              {sumaAsegurada && (
                <div className="flex gap-3 text-sm">
                  <span className="text-gray-400 w-28 shrink-0">Suma asegurada</span>
                  <span className="text-gray-700">{sumaAsegurada}</span>
                </div>
              )}
              {vigenciaFrom && (
                <div className="flex gap-3 text-sm">
                  <span className="text-gray-400 w-28 shrink-0">Vigencia</span>
                  <span className="text-gray-700">{vigenciaFrom}{vigenciaTo ? ` — ${vigenciaTo}` : ''}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Upload area */}
        {success ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-green-800 mb-1">¡Propuesta recibida!</h3>
            {successFile && (
              <p className="text-sm text-green-700 mb-1">Archivo: <strong>{successFile}</strong></p>
            )}
            {successDate && (
              <p className="text-xs text-green-600">
                Recibido el {new Date(successDate).toLocaleDateString('es-MX', {
                  day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
                })}
              </p>
            )}
            <p className="text-xs text-green-600 mt-3">
              Si desea actualizar su propuesta, puede subir un nuevo archivo abajo.
            </p>
            {/* Allow re-upload */}
            <button
              onClick={() => { setSuccess(false); setFile(null) }}
              className="mt-4 text-xs text-green-700 underline hover:text-green-900"
            >
              Subir nueva versión
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-xl border shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Suba su propuesta de cotización</h2>
            <p className="text-xs text-gray-500 mb-5">
              Aceptamos archivos PDF, JPG o PNG (máximo 20 MB).
              Su propuesta será procesada de forma segura y confidencial.
            </p>

            {/* Drop zone */}
            <div
              className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragging
                  ? 'border-blue-400 bg-blue-50'
                  : file
                  ? 'border-green-400 bg-green-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={e => handleFileSelect(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <div>
                  <svg className="w-8 h-8 text-green-500 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-sm font-medium text-green-700">{file.name}</p>
                  <p className="text-xs text-green-600 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  <button
                    onClick={e => { e.stopPropagation(); setFile(null) }}
                    className="mt-2 text-xs text-gray-500 underline hover:text-gray-700"
                  >
                    Cambiar archivo
                  </button>
                </div>
              ) : (
                <div>
                  <svg className="w-8 h-8 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-sm text-gray-600 font-medium">Arrastra tu archivo aquí</p>
                  <p className="text-xs text-gray-400 mt-1">o haz clic para seleccionarlo</p>
                </div>
              )}
            </div>

            {error && (
              <p className="mt-3 text-xs text-red-600 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </p>
            )}

            <button
              disabled={!file || uploading}
              onClick={handleUpload}
              className="mt-5 w-full flex items-center justify-center gap-2 rounded-lg bg-[#16A34A] px-4 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {uploading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Subiendo…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Enviar propuesta
                </>
              )}
            </button>
          </div>
        )}

        <p className="text-center text-xs text-gray-400">
          Este enlace es exclusivo para {insurerName || 'su organización'}.
          Por favor no lo comparta. Para soporte, contacte a Murguía Seguros.
        </p>
      </div>
    </main>
  )
}
