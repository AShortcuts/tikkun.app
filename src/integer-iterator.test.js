import { expect, test } from 'vitest'

import IntegerIterator from './integer-iterator.ts'

test('previous once returns 1 less than the start', () => {
  const sut = IntegerIterator.new({ startingAt: 0 })

  expect(sut.previous()).toBe(-1)
})

test('previous twice returns 1 less each time', () => {
  const sut = IntegerIterator.new({ startingAt: 42 })

  expect(sut.previous()).toBe(41)
  expect(sut.previous()).toBe(40)
})

test('next multiple times returns 1 more each time', () => {
  const sut = IntegerIterator.new({ startingAt: -13 })

  expect(sut.next()).toBe(-12)
  expect(sut.next()).toBe(-11)
  expect(sut.next()).toBe(-10)
})

test('interleaving previous and next always extends the values returned', () => {
  const sut = IntegerIterator.new({ startingAt: 0 })

  sut.previous()
  sut.next()
  sut.next()
  sut.previous()
  sut.next()

  expect(sut.previous()).toBe(-3)
  expect(sut.next()).toBe(4)
})
