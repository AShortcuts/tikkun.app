// Match whole Hebrew words so ordinary words such as אלה and יהודה stay intact.
const divineName = /^(ו?[בכלמש]?ה?)(יהוה|אלוה|אלו?ה(?:ים|י(?:נו|כם|כן|הם|הן|מו|ך|ו|ם|ן|ה)?))$/u
const hebrewWord = /[א-ת][א-ת\p{M}]*/gu
const cantillation = /[\u0591-\u05AF\u05BD]/gu

export function replacePrintDivineNames(text: string): string {
  return text.replace(hebrewWord, word => {
    const letters = word.replace(/\p{M}/gu, '')
    const match = divineName.exec(letters)
    if (!match) return word
    const prefixLength = match[1].length
    const name = match[2]
    // The four-letter Name keeps its final hey (ידוה); Eloah derivatives change the root hey to kuf.
    const replacedPosition = name === 'יהוה' ? 1 : name.indexOf('ה')
    const replacement = name === 'יהוה' ? 'ד' : 'ק'
    let position = -1
    return word.replace(/[א-ת]/gu, letter => {
      position++
      return position - prefixLength === replacedPosition ? replacement : letter
    })
  })
}

type Letter = { letter: string, points: string }

function pointedLetters(word: string): Letter[] {
  return [...word.replace(cantillation, '').matchAll(/([א-ת])(\p{M}*)/gu)].map(([, letter, points]) => ({ letter, points }))
}

// Other names are identified from their pointing, so this needs the pointed form of each word.
// Ambiguous spellings count as names: a needless ב״ה is harmless, while a missed name is not.
function isRemainingName(word: string) {
  const letters = pointedLetters(word)
  const plain = letters.map(({ letter }) => letter).join('')
  if (divineName.test(plain)) return true
  const named = (pattern: RegExp, check: (name: Letter[]) => boolean) => {
    const match = pattern.exec(plain)
    return Boolean(match && check(letters.slice(match[1].length)))
  }
  return named(/^(ו?[בכלמ]?)שדי$/u, ([shin]) => shin.points.includes('\u05C1'))
    || named(/^(ו?[בכלמ]?)אדני$/u, ([, , nun]) => nun.points.includes('\u05B8'))
    || named(/^(ו?[בכלמ]?ה?)אלי?$/u, ([aleph, lamed]) => aleph.points.includes('\u05B5') && (plain.endsWith('אל') || lamed.points.includes('\u05B4')))
    || named(/^()יה$/u, ([yud, hey]) => yud.points.includes('\u05B8') && hey.points.includes('\u05BC'))
    || named(/^()אהיה$/u, ([aleph]) => aleph.points.includes('\u05B6'))
}

/** Whether pointed text still contains a name that cannot be erased after any print substitution. */
export function containsDivineName(text: string): boolean {
  return (text.match(hebrewWord) ?? []).some(isRemainingName)
}
