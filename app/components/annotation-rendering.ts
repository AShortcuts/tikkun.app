const ANNOTATED_WORD_SELECTOR =
  '.word[data-annotations-mode][data-annotations-alternate]'

export function applyAnnotationMode(root: ParentNode, enabled: boolean) {
  root
    .querySelectorAll<HTMLElement>(ANNOTATED_WORD_SELECTOR)
    .forEach((word) => {
      const fixedMode = word.closest<HTMLElement>('[data-reader-annotations]')
        ?.dataset.readerAnnotations
      const wordEnabled = fixedMode === 'on' || (fixedMode !== 'off' && enabled)
      const wordMode = wordEnabled ? 'on' : 'off'
      const isPresent =
        (wordEnabled
          ? word.dataset.annotationsOnPresent
          : word.dataset.annotationsOffPresent) !== 'false'
      const isKri =
        (wordEnabled
          ? word.dataset.annotationsOnKri
          : word.dataset.annotationsOffKri) === 'true'

      word.hidden = !isPresent
      word.classList.toggle('ktiv-kri', isPresent && isKri)
      if (word.dataset.annotationsMode === wordMode) return

      const currentMarkup = word.innerHTML
      const nextMarkup = word.dataset.annotationsAlternate ?? ''
      word.dataset.annotationsAlternate = currentMarkup
      word.innerHTML = isPresent ? nextMarkup : ''
      word.dataset.annotationsMode = wordMode
    })
}
