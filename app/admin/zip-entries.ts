export interface ZipEntry {
  name: string
  bytes: Uint8Array
}

const endOfDirectorySignature = 0x06054b50
const directoryEntrySignature = 0x02014b50
const localEntrySignature = 0x04034b50
const maxEntries = 500
const maxEntryBytes = 10 * 1024 * 1024
const maxTotalBytes = 60 * 1024 * 1024
const damaged = () => new Error('This ZIP file is damaged. Download it again and retry.')

/**
 * Reads the file entries of a standard ZIP archive, such as the aligner's cue
 * download. Supports stored and deflated entries; ZIP64 and encryption are
 * rejected because the aligner never produces them.
 */
export async function readZipEntries(source: ArrayBuffer): Promise<ZipEntry[]> {
  const bytes = new Uint8Array(source)
  const view = new DataView(source)
  const end = findEndOfDirectory(view)
  const count = view.getUint16(end + 10, true)
  const directoryOffset = view.getUint32(end + 16, true)
  if (count === 0xffff || directoryOffset === 0xffffffff) {
    throw new Error('Large ZIP64 archives are not supported. Download fewer recordings at a time.')
  }
  if (count > maxEntries) throw new Error(`This ZIP has more than ${maxEntries} files.`)

  const decoder = new TextDecoder()
  const entries: ZipEntry[] = []
  let offset = directoryOffset
  let totalBytes = 0
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== directoryEntrySignature) throw damaged()
    const flags = view.getUint16(offset + 8, true)
    const method = view.getUint16(offset + 10, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const size = view.getUint32(offset + 24, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const localOffset = view.getUint32(offset + 42, true)
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength))
    offset += 46 + nameLength + extraLength + commentLength
    if (name.endsWith('/')) continue
    if (flags & 1) throw new Error('Encrypted ZIP files are not supported.')
    totalBytes += size
    if (size > maxEntryBytes || totalBytes > maxTotalBytes) {
      throw new Error('This ZIP is too large to open here. Download fewer recordings at a time.')
    }
    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== localEntrySignature) throw damaged()
    const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true)
    const data = bytes.subarray(dataStart, dataStart + compressedSize)
    if (data.length !== compressedSize) throw damaged()
    let content: Uint8Array
    if (method === 0) content = data
    else if (method === 8) content = await inflateRaw(data)
    else throw new Error(`${name} uses an unsupported ZIP compression method.`)
    if (content.length !== size) throw damaged()
    entries.push({ name, bytes: content })
  }
  return entries
}

function findEndOfDirectory(view: DataView) {
  const earliest = Math.max(0, view.byteLength - 22 - 0xffff)
  for (let offset = view.byteLength - 22; offset >= earliest; offset -= 1) {
    if (view.getUint32(offset, true) === endOfDirectorySignature) return offset
  }
  throw new Error('This file is not a ZIP archive.')
}

async function inflateRaw(data: Uint8Array) {
  try {
    const stream = new Blob([data.slice()]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  } catch (error) {
    throw new Error('This ZIP file is damaged. Download it again and retry.', { cause: error })
  }
}
