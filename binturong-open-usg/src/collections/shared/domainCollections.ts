export const domainCollections = [
  'organizations',
  'academic-years',
  'offices',
  'people',
  'activities',
  'issuances',
  'reports',
] as const

export type DomainCollection = (typeof domainCollections)[number]
export const isDomainCollection = (value: unknown): value is DomainCollection =>
  domainCollections.some((slug) => slug === value)
