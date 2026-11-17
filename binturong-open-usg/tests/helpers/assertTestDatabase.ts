export function assertTestDatabase(connectionString: string | undefined): void {
  const message = 'Tests require the local binturong_test database on port 55322, 45322 or 45323'
  let target: URL

  try {
    target = new URL(connectionString || '')
  } catch {
    throw new Error(message)
  }

  if (
    !['postgres:', 'postgresql:'].includes(target.protocol) ||
    !['127.0.0.1', 'localhost'].includes(target.hostname) ||
    !['55322', '45322', '45323'].includes(target.port) ||
    target.pathname !== '/binturong_test' ||
    target.search !== '' ||
    target.hash !== ''
  ) {
    throw new Error(message)
  }
}
