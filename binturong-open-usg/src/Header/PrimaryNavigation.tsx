'use client'

import { ChevronDownIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import React, { useEffect, useRef } from 'react'

import { matchPath } from './currentPath'
import type { NavItem, NavLink } from './resolveNavigation'

function Entry({
  link,
  pathname,
  sectionOf,
}: {
  link: NavLink
  pathname: string | null
  sectionOf?: NavLink[]
}) {
  if (!link.href) {
    return (
      <span className="site-nav-link">
        {link.label} <span className="site-nav-note">Not yet available</span>
      </span>
    )
  }
  const match = matchPath(link.href, pathname)
  const inSection =
    match === 'section' || (match !== 'page' && sectionOf?.some((c) => matchPath(c.href, pathname)))
  return (
    <Link
      className="site-nav-link"
      href={link.href}
      aria-current={match === 'page' ? 'page' : undefined}
      data-section-current={inSection ? 'true' : undefined}
      {...(link.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {link.label}
      {inSection && <span className="sr-only"> (current section)</span>}
      {link.newTab && <span className="sr-only"> (opens in a new tab)</span>}
    </Link>
  )
}

export function PrimaryNavigation({ items }: { items: NavItem[] }) {
  const pathname = usePathname()
  const nav = useRef<HTMLElement>(null)
  const previousPath = useRef(pathname)

  // Enhancement only: the native details elements work without any of this.
  useEffect(() => {
    const root = nav.current
    if (!root) return
    root.dataset.enhanced = 'true'
    const open = () => Array.from(root.querySelectorAll<HTMLDetailsElement>('details[open]'))
    const closeAll = () => open().forEach((details) => (details.open = false))

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const details = (document.activeElement as Element | null)?.closest<HTMLDetailsElement>(
        'details[open]',
      )
      if (!details || !root.contains(details)) return
      details.open = false
      details.querySelector<HTMLElement>(':scope > summary')?.focus()
      event.preventDefault()
    }
    const onToggle = (event: Event) => {
      const group = event.target as HTMLDetailsElement
      if (!group.open || !group.classList.contains('site-nav-group')) return
      root
        .querySelectorAll<HTMLDetailsElement>('details.site-nav-group[open]')
        .forEach((other) => other !== group && (other.open = false))
      // Open towards the left when the menu would leave the viewport (trailing or wrapped items).
      const menu = group.querySelector<HTMLElement>(':scope > .site-nav-children')
      delete group.dataset.align
      if (menu && menu.getBoundingClientRect().right > document.documentElement.clientWidth)
        group.dataset.align = 'end'
    }
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest<HTMLAnchorElement>('a[href]')
      const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
      if (anchor && event.button === 0 && !modified && anchor.target !== '_blank') closeAll()
    }
    const onOutside = (event: PointerEvent) => {
      if (!root.contains(event.target as Node)) closeAll()
    }
    const wide = window.matchMedia('(min-width: 64rem)')
    let lastFocused: Element | null = null
    const onFocusIn = (event: FocusEvent) => (lastFocused = event.target as Element)
    const onFocusOut = (event: FocusEvent) => {
      if (event.relatedTarget) lastFocused = null
    }
    // Hiding focused content (narrowing to the Menu form) must not strand focus on <body>.
    const restoreFocus = () => {
      const menu = root.querySelector<HTMLDetailsElement>('details.site-nav-menu')
      const active = document.activeElement
      const stranded = !active || active === document.body
      if (wide.matches || !menu || menu.open) return
      if (
        (active && menu.contains(active)) ||
        (stranded && lastFocused && menu.contains(lastFocused))
      )
        menu.querySelector<HTMLElement>(':scope > summary')?.focus()
    }
    const onBreakpoint = () => {
      restoreFocus()
      requestAnimationFrame(() => requestAnimationFrame(restoreFocus))
    }
    root.addEventListener('keydown', onKeyDown)
    root.addEventListener('focusin', onFocusIn)
    root.addEventListener('focusout', onFocusOut)
    root.addEventListener('toggle', onToggle, true)
    root.addEventListener('click', onClick)
    document.addEventListener('pointerdown', onOutside)
    wide.addEventListener('change', onBreakpoint)
    return () => {
      root.removeEventListener('keydown', onKeyDown)
      root.removeEventListener('focusin', onFocusIn)
      root.removeEventListener('focusout', onFocusOut)
      root.removeEventListener('toggle', onToggle, true)
      root.removeEventListener('click', onClick)
      document.removeEventListener('pointerdown', onOutside)
      wide.removeEventListener('change', onBreakpoint)
    }
  }, [])

  // After a client-side navigation completes, close menus and move focus to the new heading.
  useEffect(() => {
    if (previousPath.current === pathname) return
    previousPath.current = pathname
    nav.current
      ?.querySelectorAll('details[open]')
      .forEach((d) => ((d as HTMLDetailsElement).open = false))
    const target =
      document.querySelector<HTMLElement>('main h1') ?? document.querySelector<HTMLElement>('main')
    if (target) {
      target.tabIndex = -1
      target.focus()
    }
  }, [pathname])

  return (
    <nav aria-label="Primary" className="site-nav" ref={nav}>
      <div className="site-nav-bar">
        <details className="site-nav-menu">
          <summary className="site-nav-toggle">Menu</summary>
          <ul className="site-nav-list">
            {items.map((item) => (
              <li className="site-nav-item" data-section={item.section ?? undefined} key={item.id}>
                <Entry link={item} pathname={pathname} sectionOf={item.children} />
                {item.children.length > 0 && (
                  <details className="site-nav-group" name="site-nav-group">
                    <summary className="site-nav-toggle site-nav-group-toggle">
                      <span className="sr-only">Show {item.label} links</span>
                      <ChevronDownIcon aria-hidden="true" className="size-4" />
                    </summary>
                    <ul className="site-nav-children">
                      {item.children.map((child) => (
                        <li key={child.id}>
                          <Entry link={child} pathname={pathname} />
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </details>
        <Link className="site-nav-link site-nav-search" href="/search">
          Search
        </Link>
      </div>
    </nav>
  )
}
