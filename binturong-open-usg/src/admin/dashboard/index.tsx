import React from 'react'
import type { AdminViewServerProps } from 'payload'

import { hasRole } from '@/access/roles'
import { adminCopy } from '@/admin/copy'
import { loadDrafts, loadRecentChanges, type DashboardResult } from './queries'
import './index.scss'

type Permission = boolean | { permission?: boolean } | undefined
const allowed = (value: Permission) =>
  value === true || (typeof value === 'object' && value.permission === true)

type Task = { label: string; help: string; href: string; show: boolean }

function List<T extends { href: string; title?: string }>({
  heading,
  id,
  result,
  empty,
  linkLabel,
  detail,
}: {
  heading: string
  id: string
  result: DashboardResult<T>
  empty: string
  linkLabel: string
  detail: (item: T) => string
}) {
  return (
    <section aria-labelledby={id} className="admin-home__section" id={`${id}-section`}>
      <h2 id={id}>{heading}</h2>
      {!result.ok ? (
        <p role="alert" className="admin-home__error">
          {result.error}
        </p>
      ) : result.items.length === 0 ? (
        <p>{empty}</p>
      ) : (
        <ul>
          {result.items.map((item) => (
            <li key={item.href}>
              <a href={item.href}>
                <span className="admin-home__item-title">{item.title || 'Untitled'}</span>
                <span className="visually-hidden"> ({linkLabel})</span>
              </a>
              <span className="admin-home__detail">{detail(item)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const when = (value: string) =>
  new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })

export default async function AdminHome({ initPageResult }: AdminViewServerProps) {
  const { req, permissions } = initPageResult
  const role = req.user?.role
  const canPublish = hasRole(role, 'publisher')
  const can = (slug: string) =>
    allowed((permissions?.collections?.[slug] as { create?: Permission } | undefined)?.create)
  const canEditMenu = allowed(
    (permissions?.globals?.header as { update?: Permission } | undefined)?.update,
  )

  const [mine, waiting, recent] = await Promise.all([
    loadDrafts(req, { mine: true }),
    canPublish ? loadDrafts(req, { oldestFirst: true }) : Promise.resolve(null),
    loadRecentChanges(req),
  ])

  const tasks: Task[] = [
    {
      label: adminCopy.taskPost,
      help: adminCopy.taskPostHelp,
      href: '/admin/collections/posts/create',
      show: can('posts'),
    },
    {
      label: adminCopy.taskIssuance,
      help: adminCopy.taskIssuanceHelp,
      href: '/admin/collections/issuances/create',
      show: can('issuances'),
    },
    {
      label: adminCopy.taskReport,
      help: adminCopy.taskReportHelp,
      href: '/admin/collections/documents',
      show: can('reports'),
    },
    {
      label: adminCopy.taskPerson,
      help: adminCopy.taskPersonHelp,
      href: '/admin/collections/people/create',
      show: can('people'),
    },
    {
      label: adminCopy.taskMenu,
      help: adminCopy.taskMenuHelp,
      href: '/admin/globals/header',
      show: canEditMenu,
    },
    {
      label: adminCopy.taskWaiting,
      help: adminCopy.taskWaitingHelp,
      href: '#waiting-section',
      show: canPublish,
    },
    {
      label: adminCopy.taskHowTo,
      help: adminCopy.taskHowToHelp,
      href: '/admin/how-to',
      show: true,
    },
  ]

  return (
    <div className="admin-home">
      <h1>{adminCopy.homeTitle}</h1>
      <p>{adminCopy.homeIntro}</p>
      <ul className="admin-home__tasks">
        {tasks
          .filter((task) => task.show)
          .map((task) => (
            <li key={task.label}>
              <a className="admin-home__task" href={task.href}>
                <span className="admin-home__task-label">{task.label}</span>
                <span className="admin-home__task-help">{task.help}</span>
              </a>
            </li>
          ))}
      </ul>
      <List
        heading={adminCopy.yourDrafts}
        id="your-drafts"
        result={mine}
        empty={adminCopy.yourDraftsEmpty}
        linkLabel={adminCopy.open}
        detail={(item) => `Saved ${when(item.updatedAt)}`}
      />
      {waiting && (
        <List
          heading={adminCopy.waitingTitle}
          id="waiting"
          result={waiting}
          empty={adminCopy.waitingEmpty}
          linkLabel={adminCopy.openAndReview}
          detail={(item) => `Saved ${when(item.updatedAt)}. ${adminCopy.openAndReview}.`}
        />
      )}
      <List
        heading={adminCopy.recentTitle}
        id="recent"
        result={recent}
        empty={adminCopy.recentEmpty}
        linkLabel={adminCopy.open}
        detail={(item) => `${item.action} ${when(item.at)}`}
      />
    </div>
  )
}
