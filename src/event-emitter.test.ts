import { expect, test } from 'vitest'
import { EventEmitter } from './event-emitter.ts'

type TestEvents = {
  value: number
  cleared: undefined
}

test('event emitters require and deliver the declared payload', () => {
  const emitter = new EventEmitter<TestEvents>()
  const values: number[] = []
  emitter.on('value', (value) => values.push(value))

  emitter.emit('value', 3)
  emitter.emit('cleared', undefined)

  expect(values).toEqual([3])
})

test('listeners can unsubscribe without changing the active emission', () => {
  const emitter = new EventEmitter<TestEvents>()
  const calls: string[] = []
  const stopFirst = emitter.on('value', () => {
    calls.push('first')
    stopFirst()
  })
  emitter.on('value', () => calls.push('second'))

  emitter.emit('value', 1)
  emitter.emit('value', 2)

  expect(calls).toEqual(['first', 'second', 'second'])
})
