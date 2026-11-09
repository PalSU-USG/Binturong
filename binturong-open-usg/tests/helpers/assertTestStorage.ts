export function assertTestStorage(url: string | undefined, bucket: string | undefined): void {
  if (url !== 'http://127.0.0.1:56321' || bucket !== 'binturong-documents-test')
    throw new Error('Storage tests require the dedicated local private bucket on port 56321')
}
