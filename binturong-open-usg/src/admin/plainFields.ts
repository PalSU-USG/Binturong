import type { Field } from 'payload'

export type PlainText = {
  label: string
  help: string
  /** Reader-friendly names for stored select values; the stored values never change. */
  options?: Record<string, string>
}

const titleCase = (value: string) =>
  value.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase())

/**
 * Applies plain labels, help text and option names to named fields by path
 * ("terms.office" for a field inside an array). Names, types, nesting, hooks and
 * validation are untouched. A path that matches no field throws at config load, so a
 * renamed field cannot silently lose its help text.
 */
export function plainFields(fields: Field[], text: Record<string, PlainText>): Field[] {
  const used = new Set<string>()
  const apply = (list: Field[], prefix: string): Field[] =>
    list.map((field) => {
      if (!('name' in field)) {
        if ('fields' in field && Array.isArray(field.fields))
          return { ...field, fields: apply(field.fields, prefix) } as Field
        return field
      }
      const path = `${prefix}${field.name}`
      const entry = text[path]
      let next = field as Field & { fields?: Field[] }
      if (entry) {
        used.add(path)
        next = {
          ...next,
          label: entry.label,
          admin: { ...next.admin, description: entry.help },
        } as typeof next
        if (next.type === 'select')
          next = {
            ...next,
            options: next.options.map((option) => {
              const value = typeof option === 'string' ? option : option.value
              return { value, label: entry.options?.[value] ?? titleCase(value) }
            }),
          } as typeof next
      }
      if ('fields' in next && Array.isArray(next.fields))
        next = { ...next, fields: apply(next.fields, `${path}.`) } as typeof next
      return next
    })
  const result = apply(fields, '')
  const unused = Object.keys(text).filter((path) => !used.has(path))
  if (unused.length) throw new Error(`plainFields: no field named ${unused.join(', ')}`)
  return result
}
