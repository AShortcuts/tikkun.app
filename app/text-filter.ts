const NUN_HAFUCHA = '׆'

const removeMarkers = (text: string) =>
  text
    .replace('#(פ)', '')
    .replace(`(${NUN_HAFUCHA})#`, `${NUN_HAFUCHA} `)
    .replace(`#(${NUN_HAFUCHA})`, ` ${NUN_HAFUCHA}`)

const ketiv = (text: string) =>
  removeMarkers(text)
    .split(' ')
    .map((maqafSeparatedWord) =>
      maqafSeparatedWord
        .split('־')
        .map((word) => {
          const parts = word.split('#')

          if (parts.length <= 1) {
            // i.e. there is no `#`, so just take the word
            return parts[0]
          }
          return parts.slice(1)
        })
        .join('־'),
    )
    .join(' ')
    .replace(/\[/g, '{')
    .replace(/\]/g, '}')

const kri = (text: string) =>
  removeMarkers(text)
    .replace(/־/g, ' ')
    .replace(/#\[.+?\]/g, ' ')
    .replace(new RegExp(`[^א-ת\\s${NUN_HAFUCHA}]`, 'g'), '')
    .replace(/\s{2,}/g, ' ')

// An invisible placeholder keeps the Torah side's word slots in step with the
// Tikkun side when a single ketiv word is read as two kri words.
const EMPTY_WORD_SLOT = '\u200b'

// Two Sided Reading pairs every Torah word with the Tikkun word in the same
// slot, so this keeps the Tikkun form's word boundaries but shows the ketiv
// wherever the Tikkun side shows the kri.
export const pairedKetiv = (text: string) => {
  let insideKri = false
  return removeMarkers(text)
    .split(' ')
    .map((spaceSeparatedWord) => {
      if (!insideKri && !spaceSeparatedWord.includes('#')) return spaceSeparatedWord
      // Drop the kri, which may end inside this word or continue into the next one.
      const ketivOnly = spaceSeparatedWord
        .split('־')
        .map((word) => {
          if (word.includes('#')) {
            insideKri = !word.includes(']')
            return word.split('#')[0]
          }
          if (!insideKri) return word
          const kriEnd = word.indexOf(']')
          if (kriEnd < 0) return ''
          insideKri = false
          return word.slice(kriEnd + 1)
        })
        .filter(Boolean)
        .join('־')
      return ketivOnly || EMPTY_WORD_SLOT
    })
    .join(' ')
}

export default ({ text, annotated }: { text: string; annotated: boolean }) =>
  annotated ? ketiv(text) : kri(text)
