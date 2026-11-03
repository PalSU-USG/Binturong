import { describe, expect, it } from 'vitest'

import { assertTestDatabase } from '../helpers/assertTestDatabase'

describe('test database isolation', () => {
  it.each(['55322', '56322'])('accepts the dedicated Binturong test database on %s', (port) => {
    expect(() =>
      assertTestDatabase(`postgresql://tester:synthetic@127.0.0.1:${port}/binturong_test`),
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
    'postgresql://tester:synthetic@db.example.invalid:56322/binturong_test',
    'postgresql://tester:synthetic@127.0.0.1:56322/postgres',
    'postgresql://tester:synthetic@127.0.0.1:56322/binturong_test?host=db.example.invalid',
    'postgresql://tester:synthetic@127.0.0.1:56322/binturong_test#override',
    'postgresql://tester:synthetic@127.0.0.1:56323/binturong_test',
  ])('rejects an unsafe target: %s', (url) => {
    expect(() => assertTestDatabase(url)).toThrow('Tests require the local binturong_test database')
  })
})
