import { describe, expect, it } from 'vitest'

import { assertTestDatabase } from '../helpers/assertTestDatabase'

describe('test database isolation', () => {
  it('accepts the dedicated Binturong test database', () => {
    expect(() =>
      assertTestDatabase('postgresql://tester:synthetic@127.0.0.1:55322/binturong_test'),
    ).not.toThrow()
  })

  it.each([
    undefined,
    '',
    'invalid',
    'https://127.0.0.1:55322/binturong_test',
    'postgresql://tester:synthetic@db.example.invalid:55322/binturong_test',
    'postgresql://tester:synthetic@127.0.0.1:55322/postgres',
    'postgresql://tester:synthetic@127.0.0.1:54322/binturong_test',
    'postgresql://tester:synthetic@127.0.0.1:55322/binturong_test?host=db.example.invalid',
  ])('rejects an unsafe target: %s', (url) => {
    expect(() => assertTestDatabase(url)).toThrow('Tests require the local binturong_test database')
  })
})
