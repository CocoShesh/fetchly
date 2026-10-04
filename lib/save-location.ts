interface LocalFileHandle { createWritable(): Promise<WritableStream<Uint8Array>> }
export interface LocalDirectoryHandle { name: string; getFileHandle(name: string, options: { create: boolean }): Promise<LocalFileHandle>; removeEntry(name: string): Promise<void> }
let directory: LocalDirectoryHandle | null = null
export function currentSaveDirectory() { return directory }
export function forgetSaveDirectory() { directory = null }
export function canChooseSaveDirectory() { return typeof window !== 'undefined' && window.isSecureContext && 'showDirectoryPicker' in window }
export async function chooseSaveDirectory() {
  const picker = (window as unknown as { showDirectoryPicker(options: { mode: string }): Promise<LocalDirectoryHandle> }).showDirectoryPicker
  directory = await picker.call(window, { mode: 'readwrite' })
  return directory.name
}
export async function uniqueLocalFile(folder: LocalDirectoryHandle, base: string, ext: string) {
  const clean = base.replace(/[\x00-\x1f\x7f\\/*?:"<>|]/g, '').trim().replace(/[. ]+$/, '').slice(0, 100) || 'download'
  for (let copy = 0; copy < 1000; copy++) {
    const name = `${clean}${copy ? ` (${copy})` : ''}.${ext}`
    try { await folder.getFileHandle(name, { create: false }) }
    catch (cause) {
      if (cause instanceof DOMException && cause.name === 'NotFoundError') return { name, file: await folder.getFileHandle(name, { create: true }) }
      throw cause
    }
  }
  throw new Error('This folder has too many copies of the same filename. Choose a different filename.')
}

let folderWrites: Promise<unknown> = Promise.resolve()
export function withFolderWrite<T>(save: () => Promise<T>): Promise<T> {
  const pending = folderWrites.then(save, save)
  folderWrites = pending.catch(() => undefined)
  return pending
}
