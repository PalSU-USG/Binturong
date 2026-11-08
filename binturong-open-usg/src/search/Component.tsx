import React from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { SearchType } from './params'

/** Plain GET form: works without JavaScript and adds no history entry per keystroke. */
export const Search: React.FC<{ q?: string | null; type?: SearchType }> = ({ q, type = 'all' }) => (
  <form action="/search" method="get" role="search" className="flex flex-col gap-4 sm:flex-row">
    <div className="flex-1">
      <Label htmlFor="search" className="sr-only">
        Search updates
      </Label>
      <Input
        id="search"
        name="q"
        type="search"
        defaultValue={q ?? ''}
        maxLength={100}
        autoComplete="off"
        placeholder="Search by title or document number"
      />
    </div>
    {type !== 'all' && <input type="hidden" name="type" value={type} />}
    <button
      type="submit"
      className="h-10 rounded border border-border bg-primary px-6 text-primary-foreground"
    >
      Search
    </button>
  </form>
)
