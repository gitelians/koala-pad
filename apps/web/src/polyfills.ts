import { Buffer } from 'buffer'
import process from 'process'

if (typeof globalThis !== 'undefined') {
  if (!(globalThis as any).Buffer) (globalThis as any).Buffer = Buffer
  if (!(globalThis as any).process) (globalThis as any).process = process
  if (!(globalThis as any).global) (globalThis as any).global = globalThis
}
