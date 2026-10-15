// Match whole Hebrew words so ordinary words such as אלה and יהודה stay intact.
const divineName = /^(ו?[בכלמש]?ה?)(יהוה|אלוה|אלו?ה(?:ים|י(?:נו|כם|כן|הם|הן|מו|ך|ו|ם|ן|ה)?))$/u

export function replacePrintDivineNames(text: string): string {
  return text.replace(/[א-ת][א-ת\p{M}]*/gu, word => {
    const letters = word.replace(/\p{M}/gu, '')
    const match = divineName.exec(letters)
    if (!match) return word
    const prefixLength = match[1].length
    const name = match[2]
    const replacedPositions = name === 'יהוה' ? [1, 3] : [name.indexOf('ה')]
    const replacement = name === 'יהוה' ? 'ד' : 'ק'
    let position = -1
    return word.replace(/[א-ת]/gu, letter => {
      position++
      return replacedPositions.includes(position - prefixLength) ? replacement : letter
    })
  })
}
