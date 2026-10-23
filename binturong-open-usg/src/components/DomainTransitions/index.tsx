'use client'

import React, { useEffect, useRef, useState } from 'react'
import {
  Button,
  Drawer,
  FieldLabel,
  ReactSelect,
  useAuth,
  useConfig,
  useDocumentInfo,
  useField,
  useFormFields,
  useFormInitializing,
  useFormModified,
  useFormProcessing,
  useModal,
  useServerFunctions,
} from '@payloadcms/ui'
import { RichText } from '@payloadcms/richtext-lexical/react'
import type { DefaultTypedEditorState } from '@payloadcms/richtext-lexical'
import type { ClientField } from 'payload'
import { hasRole } from '@/access/roles'
import { isDomainCollection } from '@/collections/shared/domainCollections'
import type { RevisionProof } from '@/jobs/publicationRevision'
import './index.scss'

type Review = {
  candidate: Record<string, unknown>
  withdrawalCandidate: Record<string, unknown>
  expected: RevisionProof
  reviewed: RevisionProof
  published: boolean
  versions: { id: number; updatedAt: string }[]
}
type Upcoming = { id: number | string; input: { type: string }; waitUntil: string | Date }
const label = (name: string) =>
  name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .replace(/^./, (letter) => letter.toUpperCase())

function ReviewFields({ fields, data }: { fields: ClientField[]; data: Record<string, unknown> }) {
  return (
    <dl>
      {fields.map((field, index) => {
        if ('admin' in field && field.admin?.hidden) return null
        if (!('name' in field))
          return 'fields' in field ? (
            <ReviewFields key={index} fields={field.fields} data={data} />
          ) : null
        if (['publishedAt', 'lastTransition', 'normalizedNumber', '_status'].includes(field.name))
          return null
        const value = data[field.name]
        let content: React.ReactNode =
          value == null || value === '' ? 'Not supplied' : String(value)
        if (field.type === 'checkbox') content = value ? 'Yes' : 'No'
        if (field.type === 'select' && typeof value === 'string') {
          const option = field.options.find(
            (option) => (typeof option === 'string' ? option : option.value) === value,
          )
          content =
            typeof option === 'object' && typeof option.label === 'string'
              ? option.label
              : label(value)
        }
        if (field.type === 'richText' && value && typeof value === 'object')
          content = <RichText data={value as DefaultTypedEditorState} />
        if (field.type === 'array' && Array.isArray(value))
          content = value.length ? (
            <ol>
              {value.map((row, index) => (
                <li key={index}>
                  <ReviewFields fields={field.fields} data={row} />
                </li>
              ))}
            </ol>
          ) : (
            'None supplied'
          )
        if (field.type === 'group' && value && typeof value === 'object')
          content = <ReviewFields fields={field.fields} data={value as Record<string, unknown>} />
        if (field.type === 'relationship') {
          const entries = Array.isArray(value) ? value : value == null ? [] : [value]
          content = entries.length ? (
            <ul>
              {entries.map((entry, index) => {
                const relation =
                  Array.isArray(field.relationTo) && typeof entry === 'object'
                    ? entry.relationTo
                    : field.relationTo
                const id = typeof entry === 'object' ? (entry.value ?? entry.id) : entry
                return (
                  <li key={index}>
                    {label(String(relation))}: record {String(id)}
                  </li>
                )
              })}
            </ul>
          ) : (
            'Not supplied'
          )
        }
        return (
          <React.Fragment key={field.name}>
            <dt>{typeof field.label === 'string' ? field.label : label(field.name)}</dt>
            <dd>{content}</dd>
          </React.Fragment>
        )
      })}
    </dl>
  )
}

function errorMessage(result: unknown): string {
  if (!result || typeof result !== 'object')
    return 'The change could not be confirmed. Check the record before trying again.'
  const record = result as {
    message?: string
    error?: unknown
    errors?: { message?: string; data?: { errors?: { path: string; message: string }[] } }[]
  }
  const errors = record.errors?.flatMap((error) => error.data?.errors ?? [])
  if (errors?.length)
    return errors.map(({ path, message }) => `${label(path)}: ${message}`).join(' ')
  if (record.errors?.[0]?.message) return record.errors[0].message
  if (record.error) return errorMessage(record.error)
  return (
    record.message ?? 'The change could not be confirmed. Check the record before trying again.'
  )
}

export function NativeTransitionButton() {
  return null
}

function ProtectedAuditValue({ path }: { path: string }) {
  const field = useFormFields(([fields]) => fields[path])
  const dispatch = useFormFields(([, dispatch]) => dispatch)
  const initializing = useFormInitializing()
  useEffect(() => {
    if (!initializing && field && !field.disableFormData) {
      dispatch({ type: 'UPDATE', path, disableFormData: true })
    }
  }, [dispatch, field, initializing, path])
  return null
}

function ProtectedAuditFields({ field, path }: { field: ClientField; path: string }) {
  return field.type === 'group' ? (
    <>
      <ProtectedAuditValue path={path} />
      {field.fields.map((child) =>
        'name' in child ? (
          <ProtectedAuditFields key={child.name} field={child} path={`${path}.${child.name}`} />
        ) : null,
      )}
    </>
  ) : (
    <ProtectedAuditValue path={path} />
  )
}

export function ProtectedAuditField({
  field,
  path: pathFromProps,
}: {
  field: ClientField
  path: string
}) {
  const { path } = useField({ potentiallyStalePath: pathFromProps })
  return <ProtectedAuditFields field={field} path={path} />
}

export default function DomainTransitions() {
  const { id, collectionSlug, data, docConfig, documentIsLocked } = useDocumentInfo()
  const { user } = useAuth()
  const { config } = useConfig()
  const modified = useFormModified()
  const processing = useFormProcessing()
  const { openModal, closeModal } = useModal()
  const { serverFunction, getUpcomingScheduledPublish } = useServerFunctions()
  const [review, setReview] = useState<Review>()
  const [savedAt, setSavedAt] = useState<unknown>()
  const [mode, setMode] = useState<'publish' | 'withdraw' | 'restore'>('publish')
  const [selected, setSelected] = useState('')
  const [date, setDate] = useState('')
  const [upcoming, setUpcoming] = useState<Upcoming[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const errorRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (error) errorRef.current?.focus()
  }, [error])
  if (!isDomainCollection(collectionSlug)) return null
  const slug = `domain-review-${collectionSlug}-${id}`
  const url = `${config.routes.api}/${collectionSlug}/${id}`
  const canPublish = hasRole(user?.role, 'publisher')
  const unchanged = !modified && !processing && !documentIsLocked
  const ready = unchanged && !busy && !!review && data?.updatedAt === savedAt

  async function load(versionID?: string) {
    if (!unchanged || !id) return
    setBusy(true)
    setError('')
    setMessage('')
    openModal(slug)
    try {
      const response = await fetch(`${url}/review${versionID ? `?versionID=${versionID}` : ''}`, {
        cache: 'no-store',
        credentials: 'include',
      })
      const result = await response.json()
      if (!response.ok) throw new Error(errorMessage(result))
      setReview(result)
      setSavedAt(data?.updatedAt)
      setMode(versionID ? 'restore' : 'publish')
      setSelected(versionID ?? '')
      const jobs = await getUpcomingScheduledPublish({ collectionSlug, id })
      if (Array.isArray(jobs)) setUpcoming(jobs)
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'The saved revision could not be loaded. Try reviewing it again.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function apply() {
    if (!ready || !review || !canPublish) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`${url}/transition`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: mode,
          expected: review.expected,
          ...(mode === 'restore' ? { restore: review.reviewed } : {}),
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(errorMessage(result))
      window.location.reload()
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'The change could not be confirmed. Check the record before trying again.',
      )
      setBusy(false)
    }
  }

  async function schedule(deleteID?: number | string) {
    if (!canPublish || busy || (!deleteID && (!ready || !review || mode === 'restore' || !date)))
      return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await serverFunction({
        name: 'schedule-publish',
        args: {
          doc: { relationTo: collectionSlug, value: String(id) },
          type: mode === 'withdraw' ? 'unpublish' : 'publish',
          date: date ? new Date(date) : undefined,
          deleteID,
          expected: review?.expected,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      })
      if (
        !result ||
        typeof result !== 'object' ||
        !('confirmed' in result) ||
        result.confirmed !== true
      )
        throw new Error(errorMessage(result))
      const jobs = await getUpcomingScheduledPublish({ collectionSlug, id })
      if (!Array.isArray(jobs))
        throw new Error(
          'The schedule changed, but its current state could not be loaded. Reopen review to check it.',
        )
      setUpcoming(jobs)
      setMessage(deleteID ? 'Scheduled change cancelled.' : 'Reviewed change scheduled.')
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'The schedule could not be confirmed. Check scheduled changes before trying again.',
      )
    } finally {
      setBusy(false)
    }
  }

  const displayed = mode === 'withdraw' ? review?.withdrawalCandidate : review?.candidate
  const historyOptions =
    review?.versions.map((version) => ({
      value: String(version.id),
      label: `Saved ${new Date(version.updatedAt).toLocaleString()} (version ${version.id})`,
    })) ?? []
  return (
    <>
      <Button
        buttonStyle="secondary"
        disabled={!id || !unchanged || busy}
        onClick={() => void load()}
      >
        Review saved revision
      </Button>
      <Drawer slug={slug} title="Review saved revision">
        <div className="domain-review">
          {busy && <p role="status">Checking the saved revision…</p>}
          {error && (
            <p role="alert" ref={errorRef} tabIndex={-1}>
              {error}
            </p>
          )}
          {message && <p role="status">{message}</p>}
          {!unchanged && (
            <p role="status">Save your changes, then review the saved revision again.</p>
          )}
          {!canPublish && (
            <p>A publisher can publish, withdraw, restore or schedule this record.</p>
          )}
          {review && displayed && (
            <>
              <h3>
                {mode === 'withdraw'
                  ? 'Currently published content to withdraw'
                  : mode === 'restore'
                    ? 'Historical content to restore'
                    : 'Saved content to publish'}
              </h3>
              <p>
                Saved {new Date(String(displayed.updatedAt)).toLocaleString()}.{' '}
                {displayed.publishedAt
                  ? `First published ${new Date(String(displayed.publishedAt)).toLocaleString()}.`
                  : ''}
              </p>
              <div data-testid="domain-reviewed-content">
                <ReviewFields fields={docConfig?.fields ?? []} data={displayed} />
              </div>
              <div className="domain-review__actions">
                <Button
                  disabled={!unchanged || busy}
                  buttonStyle="secondary"
                  onClick={() => void load()}
                >
                  Review latest saved revision
                </Button>
                {review.published && (
                  <Button
                    disabled={!ready}
                    buttonStyle="secondary"
                    onClick={() => {
                      setMode('withdraw')
                      setError('')
                    }}
                  >
                    Review withdrawal
                  </Button>
                )}
                {canPublish && (
                  <Button disabled={!ready} onClick={() => void apply()}>
                    {mode === 'restore'
                      ? 'Restore reviewed revision'
                      : mode === 'withdraw'
                        ? 'Withdraw published revision'
                        : 'Publish reviewed revision'}
                  </Button>
                )}
              </div>
              <h3>Restore a saved version</h3>
              <div className="field-type select">
                <FieldLabel htmlFor="domain-history" label="Historical version" />
                <ReactSelect
                  inputId="domain-history"
                  disabled={busy}
                  options={historyOptions}
                  value={historyOptions.find((option) => option.value === selected)}
                  onChange={(option) =>
                    setSelected(option && !Array.isArray(option) ? String(option.value) : '')
                  }
                />
              </div>
              <Button
                buttonStyle="secondary"
                disabled={!selected || !unchanged || busy}
                onClick={() => void load(selected)}
              >
                Review selected version
              </Button>
              {canPublish && mode !== 'restore' && (
                <>
                  <h3>Schedule this reviewed change</h3>
                  <div className="field-type text">
                    <label htmlFor="domain-schedule-date">
                      Publication date and time ({Intl.DateTimeFormat().resolvedOptions().timeZone})
                    </label>
                    <input
                      id="domain-schedule-date"
                      type="datetime-local"
                      value={date}
                      onChange={(event) => setDate(event.target.value)}
                      disabled={busy}
                    />
                  </div>
                  <Button disabled={!ready || !date} onClick={() => void schedule()}>
                    Schedule reviewed {mode === 'withdraw' ? 'withdrawal' : 'publication'}
                  </Button>
                </>
              )}
              <h3>Scheduled changes</h3>
              {!upcoming.length ? (
                <p>No scheduled changes.</p>
              ) : (
                <ul>
                  {upcoming.map((job) => (
                    <li key={job.id}>
                      {job.input.type === 'unpublish' ? 'Withdrawal' : 'Publication'}:{' '}
                      {new Date(job.waitUntil).toLocaleString()}
                      {canPublish && (
                        <Button
                          buttonStyle="secondary"
                          disabled={busy}
                          onClick={() => void schedule(job.id)}
                        >
                          Cancel scheduled change
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          <Button buttonStyle="secondary" onClick={() => closeModal(slug)}>
            Close review
          </Button>
        </div>
      </Drawer>
    </>
  )
}
