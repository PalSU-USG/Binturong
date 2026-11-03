export function normalizeDocumentNumber(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase().normalize('NFC')
}
