export interface ZipFixtureEntry {
  name: string
  bytes: Uint8Array
  /** Raw deflate data for this entry; stored uncompressed when omitted. */
  deflated?: Uint8Array
}

/** Builds a minimal ZIP archive for tests. CRC fields are left at zero. */
export function buildZipFixture(entries: ZipFixtureEntry[]): ArrayBuffer {
  const encoder = new TextEncoder()
  const parts: Uint8Array[] = []
  const directory: Uint8Array[] = []
  let offset = 0
  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const data = entry.deflated ?? entry.bytes
    const method = entry.deflated ? 8 : 0
    const local = new Uint8Array(30 + name.length + data.length)
    const localView = new DataView(local.buffer)
    localView.setUint32(0, 0x04034b50, true)
    localView.setUint16(4, 20, true)
    localView.setUint16(8, method, true)
    localView.setUint32(18, data.length, true)
    localView.setUint32(22, entry.bytes.length, true)
    localView.setUint16(26, name.length, true)
    local.set(name, 30)
    local.set(data, 30 + name.length)
    const central = new Uint8Array(46 + name.length)
    const centralView = new DataView(central.buffer)
    centralView.setUint32(0, 0x02014b50, true)
    centralView.setUint16(4, 20, true)
    centralView.setUint16(6, 20, true)
    centralView.setUint16(10, method, true)
    centralView.setUint32(20, data.length, true)
    centralView.setUint32(24, entry.bytes.length, true)
    centralView.setUint16(28, name.length, true)
    centralView.setUint32(42, offset, true)
    central.set(name, 46)
    parts.push(local)
    directory.push(central)
    offset += local.length
  }
  const directorySize = directory.reduce((sum, part) => sum + part.length, 0)
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(8, entries.length, true)
  endView.setUint16(10, entries.length, true)
  endView.setUint32(12, directorySize, true)
  endView.setUint32(16, offset, true)
  const all = [...parts, ...directory, end]
  const output = new Uint8Array(all.reduce((sum, part) => sum + part.length, 0))
  let position = 0
  for (const part of all) {
    output.set(part, position)
    position += part.length
  }
  return output.buffer
}
