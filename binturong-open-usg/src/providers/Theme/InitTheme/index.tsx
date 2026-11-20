'use client'

import { useServerInsertedHTML } from 'next/navigation'
import { useRef } from 'react'

import { defaultTheme, themeLocalStorageKey } from '../ThemeSelector/types'

export function InitTheme() {
  const inserted = useRef(false)
  // The 404 can render the layout on the client. Emit the script only in the initial HTML.
  useServerInsertedHTML(() => {
    if (inserted.current) return null
    inserted.current = true

    return (
      <script
        dangerouslySetInnerHTML={{
          __html: `
  (function () {
    function getImplicitPreference() {
      var mediaQuery = '(prefers-color-scheme: dark)'
      var mql = window.matchMedia(mediaQuery)
      var hasImplicitPreference = typeof mql.matches === 'boolean'

      if (hasImplicitPreference) {
        return mql.matches ? 'dark' : 'light'
      }

      return null
    }

    function themeIsValid(theme) {
      return theme === 'light' || theme === 'dark'
    }

    var themeToSet = '${defaultTheme}'
    var preference = window.localStorage.getItem('${themeLocalStorageKey}')

    if (themeIsValid(preference)) {
      themeToSet = preference
    } else {
      var implicitPreference = getImplicitPreference()

      if (implicitPreference) {
        themeToSet = implicitPreference
      }
    }

    document.documentElement.setAttribute('data-theme', themeToSet)
  })();
  `,
        }}
        id="theme-script"
      />
    )
  })
  return null
}
