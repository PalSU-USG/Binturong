'use client'

import React, { useEffect, useRef, useState } from 'react'
import {
  Button,
  Drawer,
  FieldLabel,
  ReactSelect,
  useAuth,
  useConfig,
  useModal,
} from '@payloadcms/ui'
import { Upload } from 'tus-js-client'
import { hasRole } from '@/access/roles'
import { MAX_DOCUMENT_BYTES, TUS_CHUNK_BYTES } from '@/storage/documentLimits'
import type {
  BeginDocumentUploadResult,
  ReadyDocumentMetadata,
} from '@/storage/documentUploads'

type OrgOption = { id: number; name: string }
type DocOption = { id: number; organization: number | { id: number }; state: string; title: string; verifiedAt?: string | null }

const DRAWER_SLUG = 'official-document-upload'

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback
  const record = payload as {
    errors?: { message?: string }[]
    message?: string
  }
  if (record.errors?.[0]?.message) return record.errors[0].message
  if (typeof record.message === 'string' && record.message) return record.message
  return fallback
}

export default function DocumentUpload() {
  const { user } = useAuth()
  const { config } = useConfig()
  const { isModalOpen, openModal, closeModal } = useModal()

  const [organizations, setOrganizations] = useState<OrgOption[]>([])
  const [readyDocs, setReadyDocs] = useState<DocOption[]>([])
  const [title, setTitle] = useState('')
  const [organizationID, setOrganizationID] = useState('')
  const [previousVersionID, setPreviousVersionID] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [requestId, setRequestId] = useState<string>(() => crypto.randomUUID())
  const [session, setSession] = useState<Extract<BeginDocumentUploadResult, { state: 'pending' }> | null>(null)
  const [status, setStatus] = useState<
    'idle' | 'initializing' | 'uploading' | 'paused' | 'verifying' | 'ready' | 'failed'
  >('idle')
  const [progress, setProgress] = useState<{ loaded: number; total: number }>({
    loaded: 0,
    total: 0,
  })
  const [transferComplete, setTransferComplete] = useState(false)
  const [verifiedDoc, setVerifiedDoc] = useState<ReadyDocumentMetadata | null>(null)
  const [error, setError] = useState('')
  const uploadRef = useRef<Upload | null>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)

  const canUpload = Boolean(user && hasRole(user.role, 'editor'))
  const isOpen = isModalOpen(DRAWER_SLUG)
  const apiRoute = config.routes.api

  useEffect(() => {
    if (error) errorRef.current?.focus()
  }, [error])

  useEffect(() => {
    if (!isOpen || !canUpload) return
    let active = true
    async function loadOptions() {
      try {
        const [orgsRes, docsRes] = await Promise.all([
          fetch(`${apiRoute}/organizations?limit=200&depth=0&draft=true`, {
            cache: 'no-store',
            credentials: 'include',
          }),
          fetch(`${apiRoute}/documents?where[state][equals]=ready&limit=200&depth=0`, {
            cache: 'no-store',
            credentials: 'include',
          }),
        ])
        if (!active) return
        if (orgsRes.ok) {
          const orgData = (await orgsRes.json()) as { docs?: OrgOption[] }
          setOrganizations(orgData.docs ?? [])
        }
        if (docsRes.ok) {
          const docData = (await docsRes.json()) as { docs?: DocOption[] }
          setReadyDocs(
            (docData.docs ?? []).filter((doc) => doc.state === 'ready' && Boolean(doc.verifiedAt)),
          )
        }
      } catch {
        // Keep form interactive even if background option prefetch fails
      }
    }
    void loadOptions()
    return () => {
      active = false
    }
  }, [apiRoute, canUpload, isOpen])

  if (!canUpload) return null

  const orgOptions = organizations.map((org) => ({
    label: `${org.name} (#${org.id})`,
    value: String(org.id),
  }))

  const filteredPreviousOptions = readyDocs
    .filter((doc) => {
      if (!organizationID) return false
      const docOrg =
        typeof doc.organization === 'object' && doc.organization !== null
          ? doc.organization.id
          : doc.organization
      return String(docOrg) === organizationID
    })
    .map((doc) => ({
      label: `${doc.title} (#${doc.id})`,
      value: String(doc.id),
    }))

  function resetSessionForMetadataEdit() {
    uploadRef.current = null
    setSession(null)
    setTransferComplete(false)
    setVerifiedDoc(null)
    setRequestId(crypto.randomUUID())
    if (status === 'failed' || status === 'ready') {
      setStatus('idle')
    }
  }

  async function finalizeSession(documentID: number) {
    setStatus('verifying')
    setError('')
    const response = await fetch(`${apiRoute}/documents/${documentID}/finalize`, {
      method: 'POST',
      credentials: 'include',
    })
    const result = (await response.json()) as ReadyDocumentMetadata
    if (!response.ok) {
      if (response.status === 413 || response.status === 422 || response.status === 409) {
        setStatus('failed')
        setRequestId(crypto.randomUUID())
        setSession(null)
        setTransferComplete(false)
      } else {
        setStatus('paused')
      }
      throw new Error(
        extractErrorMessage(result, 'Official PDF verification could not be completed.'),
      )
    }
    setVerifiedDoc(result)
    setStatus('ready')
  }

  async function runTusTransfer(
    pendingSession: Extract<BeginDocumentUploadResult, { state: 'pending' }>,
    selectedFile: File,
  ) {
    setStatus('uploading')
    setError('')
    await new Promise<void>((resolve, reject) => {
      const upload = new Upload(selectedFile, {
        endpoint: pendingSession.upload.endpoint,
        retryDelays: [0, 1000, 3000],
        headers: {
          'x-signature': pendingSession.upload.token,
          'x-upsert': 'false',
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        metadata: {
          bucketName: pendingSession.upload.bucket,
          objectName: pendingSession.upload.path,
          contentType: 'application/pdf',
          cacheControl: '3600',
        },
        chunkSize: TUS_CHUNK_BYTES,
        onProgress(bytesUploaded, bytesTotal) {
          setProgress({ loaded: bytesUploaded, total: bytesTotal })
        },
        onError(uploadError) {
          reject(uploadError)
        },
        onSuccess() {
          resolve()
        },
      })
      uploadRef.current = upload
      void upload
        .findPreviousUploads()
        .then((previousUploads) => {
          if (previousUploads.length > 0) {
            upload.resumeFromPreviousUpload(previousUploads[0]!)
          }
          upload.start()
        })
        .catch(reject)
    })
    setTransferComplete(true)
    await finalizeSession(pendingSession.documentID)
  }

  async function handleStartOrResume() {
    setError('')
    if (!file) {
      setError('Choose a PDF file to upload.')
      return
    }
    if (file.size <= 0 || file.size > MAX_DOCUMENT_BYTES) {
      setError(`Official PDF files must be between 1 byte and ${MAX_DOCUMENT_BYTES.toLocaleString()} bytes.`)
      return
    }
    const orgID = Number(organizationID)
    if (!Number.isInteger(orgID) || orgID < 1) {
      setError('Choose an organization for this official document.')
      return
    }
    if (!title.trim()) {
      setError('Enter a document title.')
      return
    }

    try {
      let activeSession = session
      if (!activeSession) {
        setStatus('initializing')
        const beginRes = await fetch(`${apiRoute}/documents/begin-upload`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim(),
            organization: orgID,
            originalFilename: file.name,
            ...(previousVersionID ? { previousVersion: Number(previousVersionID) } : {}),
            requestId,
          }),
        })
        const beginBody = (await beginRes.json()) as BeginDocumentUploadResult
        if (!beginRes.ok) {
          setStatus('idle')
          throw new Error(
            extractErrorMessage(beginBody, 'Could not initialize the official document upload.'),
          )
        }
        if (beginBody.state === 'ready') {
          await finalizeSession(beginBody.documentID)
          return
        }
        activeSession = beginBody
        setSession(activeSession)
      }

      if (transferComplete) {
        await finalizeSession(activeSession.documentID)
        return
      }

      await runTusTransfer(activeSession, file)
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The document upload was interrupted. You can resume or retry.',
      )
      setStatus((current) => (current === 'failed' || current === 'ready' ? current : 'paused'))
    }
  }

  async function handlePause() {
    if (uploadRef.current && status === 'uploading') {
      await uploadRef.current.abort()
      setStatus('paused')
    }
  }

  const busy = status === 'initializing' || status === 'uploading' || status === 'verifying'
  const percent =
    progress.total > 0 ? Math.min(100, Math.round((progress.loaded / progress.total) * 100)) : 0

  return (
    <div className="document-upload-toolbar">
      <Button
        buttonStyle="secondary"
        onClick={() => {
          setError('')
          openModal(DRAWER_SLUG)
        }}
      >
        Upload official PDF
      </Button>
      <Drawer slug={DRAWER_SLUG} title="Upload official PDF">
        {isOpen && (
          <div className="document-upload" data-testid="document-upload-drawer">
            {error && (
              <p role="alert" ref={errorRef} tabIndex={-1}>
                {error}
              </p>
            )}
            <div className="field-type text">
              <FieldLabel htmlFor="official-doc-title" label="Document title" required />
              <input
                id="official-doc-title"
                type="text"
                value={title}
                disabled={busy}
                onChange={(event) => {
                  setTitle(event.target.value)
                  resetSessionForMetadataEdit()
                }}
              />
            </div>

            <div className="field-type select">
              <FieldLabel htmlFor="official-doc-organization" label="Organization" required />
              <ReactSelect
                inputId="official-doc-organization"
                disabled={busy}
                options={orgOptions}
                value={orgOptions.find((option) => option.value === organizationID)}
                onChange={(option) => {
                  const nextOrg = option && !Array.isArray(option) ? String(option.value) : ''
                  setOrganizationID(nextOrg)
                  setPreviousVersionID('')
                  resetSessionForMetadataEdit()
                }}
              />
            </div>

            <div className="field-type select">
              <FieldLabel
                htmlFor="official-doc-previous-version"
                label="Replaces ready document (optional)"
              />
              <ReactSelect
                inputId="official-doc-previous-version"
                disabled={busy || !organizationID}
                isClearable
                options={filteredPreviousOptions}
                value={filteredPreviousOptions.find(
                  (option) => option.value === previousVersionID,
                )}
                onChange={(option) => {
                  const nextPrev = option && !Array.isArray(option) ? String(option.value) : ''
                  setPreviousVersionID(nextPrev)
                  resetSessionForMetadataEdit()
                }}
              />
            </div>

            <div className="field-type text">
              <FieldLabel htmlFor="official-doc-file" label="Official PDF file" required />
              <input
                id="official-doc-file"
                type="file"
                accept="application/pdf,.pdf"
                disabled={busy}
                onChange={(event) => {
                  const selected = event.target.files?.[0] ?? null
                  setFile(selected)
                  setProgress({ loaded: 0, total: selected?.size ?? 0 })
                  resetSessionForMetadataEdit()
                }}
              />
            </div>

            {status !== 'idle' && (
              <p role="status" data-testid="document-upload-status">
                {status === 'initializing' && 'Allocating upload session…'}
                {status === 'uploading' &&
                  `Uploading PDF: ${percent}% (${progress.loaded.toLocaleString()} / ${progress.total.toLocaleString()} bytes)`}
                {status === 'paused' &&
                  `Upload paused at ${percent}% (${progress.loaded.toLocaleString()} / ${progress.total.toLocaleString()} bytes).`}
                {status === 'verifying' && 'Verifying uploaded PDF on the server…'}
                {status === 'ready' &&
                  verifiedDoc &&
                  `Verified ready document #${verifiedDoc.id} (${verifiedDoc.size.toLocaleString()} bytes, SHA-256: ${verifiedDoc.sha256}).`}
                {status === 'failed' &&
                  'Verification failed. Choose a valid PDF file to start a new upload request.'}
              </p>
            )}

            <div className="document-upload__actions">
              {status !== 'uploading' && status !== 'ready' && (
                <Button disabled={busy} onClick={() => void handleStartOrResume()}>
                  {status === 'paused' ? 'Resume upload' : 'Upload and verify PDF'}
                </Button>
              )}
              {status === 'uploading' && (
                <Button buttonStyle="secondary" onClick={() => void handlePause()}>
                  Pause upload
                </Button>
              )}
              {status === 'ready' && verifiedDoc && (
                <>
                  <a
                    href={`${apiRoute}/documents/${verifiedDoc.id}/file`}
                    data-testid="verified-document-download-link"
                  >
                    Download verified PDF (#{verifiedDoc.id})
                  </a>
                  <Button
                    buttonStyle="secondary"
                    onClick={() => {
                      window.location.reload()
                    }}
                  >
                    Refresh document list
                  </Button>
                </>
              )}
              <Button
                buttonStyle="secondary"
                disabled={busy}
                onClick={() => closeModal(DRAWER_SLUG)}
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  )
}
