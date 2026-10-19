export function assertTestDatabase(connectionString: string | undefined): void {
  const message = 'Tests require the local binturong_test database on port 55322'
  let target: URL

  try {
    target = new URL(connectionString || '')
  } catch {
    throw new Error(message)
  }

  if (
    !['postgres:', 'postgresql:'].includes(target.protocol) ||
    !['127.0.0.1', 'localhost'].includes(target.hostname) ||
    target.port !== '55322' ||
    target.pathname !== '/binturong_test' ||
    target.search !== '' ||
    target.hash !== ''
  ) {
    throw new Error(message)
  }
}
