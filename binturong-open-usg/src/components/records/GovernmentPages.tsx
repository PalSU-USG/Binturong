import configPromise from '@payload-config'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import React from 'react'

import { SectionLayout } from '@/components/SectionLayout'
import { listOffices, listParticipatingCsgs, readOffice } from '@/records/governmentQueries'
import { buildOfficeTree, type OfficeNode } from '@/records/officeTree'
import { formatLongDate } from './format'

const linkClass = 'inline-flex min-h-11 items-center underline'
const officeHref = (slug: string) => `/government/offices/${encodeURIComponent(slug)}`
const getPayloadClient = () => getPayload({ config: configPromise })

function Shell({
  title,
  path,
  trail = [],
  children,
}: {
  title: string
  path: string
  trail?: { label: string; href?: string }[]
  children: React.ReactNode
}) {
  return (
    <SectionLayout
      currentLabel={title}
      currentPath={path}
      fallback={{ label: 'Government', href: '/government' }}
      section="government"
      trail={path === '/government' ? [] : [...trail, { label: title }]}
    >
      <div className="container pt-8 pb-16">
        <h1 className="text-3xl font-semibold [overflow-wrap:anywhere]">{title}</h1>
        <div className="mt-6">{children}</div>
      </div>
    </SectionLayout>
  )
}

export function GovernmentHome() {
  return (
    <Shell path="/government" title="Government">
      <ul>
        {[
          ['/government/organizational-chart', 'Organizational chart'],
          ['/government/offices', 'Offices'],
          ['/government/participating-csgs', 'Participating CSGs'],
        ].map(([href, label]) => (
          <li key={href}>
            <Link className={linkClass} href={href!}>
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </Shell>
  )
}

function Tree({ nodes }: { nodes: OfficeNode[] }) {
  return (
    <ul className="ml-0 list-none pl-0 [&_ul]:ml-4 [&_ul]:border-l [&_ul]:border-border [&_ul]:pl-4">
      {nodes.map((node) => (
        <li key={node.id}>
          <Link className={linkClass} href={officeHref(node.slug)}>
            {node.name}
          </Link>
          {node.children.length > 0 && <Tree nodes={node.children} />}
        </li>
      ))}
    </ul>
  )
}

export async function OrganizationalChartPage() {
  const groups = buildOfficeTree(await listOffices(await getPayloadClient()))
  return (
    <Shell path="/government/organizational-chart" title="Organizational chart">
      {groups.length === 0 ? (
        <p role="status">No offices have been published yet.</p>
      ) : (
        groups.map((group) => (
          <section aria-labelledby={`g-${group.label}`} className="mb-8" key={group.label}>
            <h2 className="text-xl font-semibold" id={`g-${group.label}`}>
              {group.label}
            </h2>
            <Tree nodes={group.roots} />
          </section>
        ))
      )}
    </Shell>
  )
}

export async function OfficesDirectoryPage() {
  const offices = await listOffices(await getPayloadClient())
  return (
    <Shell path="/government/offices" title="Offices">
      {offices.length === 0 ? (
        <p role="status">No offices have been published yet.</p>
      ) : (
        <ul>
          {offices.map((office) => (
            <li key={office.id}>
              <Link className={linkClass} href={officeHref(office.slug)}>
                {office.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  )
}

const branchLabel = {
  executive: 'Executive',
  legislative: 'Legislative',
  judicial: 'Judicial',
} as const

export async function OfficeDetailPage({ params }: { params: Promise<{ slug?: string }> }) {
  let slug = ''
  try {
    slug = decodeURIComponent((await params).slug ?? '')
  } catch {
    notFound()
  }
  const office = await readOffice(await getPayloadClient(), slug)
  if (!office) notFound()
  const range = (start: string | null, end: string | null) => {
    const s = formatLongDate(start)
    const e = formatLongDate(end)
    if (s && e) return `${s} to ${e}`
    if (s) return `From ${s}`
    if (e) return `Until ${e}`
    return 'Term dates not recorded'
  }
  return (
    <Shell
      path={`/government/offices/${office.slug}`}
      title={office.name}
      trail={[{ label: 'Offices', href: '/government/offices' }]}
    >
      <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-[max-content_1fr]">
        {office.branch && (
          <>
            <dt className="font-semibold">Branch</dt>
            <dd className="m-0">{branchLabel[office.branch]}</dd>
          </>
        )}
        {office.organization && (
          <>
            <dt className="font-semibold">Organization</dt>
            <dd className="m-0">{office.organization}</dd>
          </>
        )}
        {office.parent && (
          <>
            <dt className="font-semibold">Part of</dt>
            <dd className="m-0">
              <Link className={linkClass} href={officeHref(office.parent.slug)}>
                {office.parent.name}
              </Link>
            </dd>
          </>
        )}
      </dl>
      {office.children.length > 0 && (
        <section aria-labelledby="children-heading" className="mt-8">
          <h2 className="text-xl font-semibold" id="children-heading">
            Offices under this office
          </h2>
          <ul>
            {office.children.map((child) => (
              <li key={child.slug}>
                <Link className={linkClass} href={officeHref(child.slug)}>
                  {child.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="holders-heading" className="mt-8">
        <h2 className="text-xl font-semibold" id="holders-heading">
          Office holders
        </h2>
        {office.holders.length === 0 ? (
          <p role="status">No office holders have been published for this office.</p>
        ) : (
          <ul className="mt-2">
            {office.holders.map((holder, index) => (
              <li className="py-2" key={`${holder.name}-${index}`}>
                <span className="font-semibold">{holder.name}</span>
                {holder.current && ' (current)'}
                <br />
                <span className="text-sm text-muted-foreground">
                  {range(holder.start, holder.end)}
                  {holder.academicYear ? ` · ${holder.academicYear}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Shell>
  )
}

export async function ParticipatingCsgsPage() {
  const csgs = await listParticipatingCsgs(await getPayloadClient())
  return (
    <Shell path="/government/participating-csgs" title="Participating CSGs">
      {csgs.length === 0 ? (
        <p role="status">No participating CSGs have been published yet.</p>
      ) : (
        <ul>
          {csgs.map((csg) => (
            <li key={csg.slug}>
              <span className="font-semibold">{csg.name}</span>{' '}
              <Link
                className={linkClass}
                href={`/archives/participating-csgs?csg=${encodeURIComponent(csg.slug)}`}
              >
                View records
                <span className="sr-only"> from {csg.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  )
}
