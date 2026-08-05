const ANNOTATED_WORD_SELECTOR =
  '.word[data-annotations-mode][data-annotations-alternate]'

export function applyAnnotationMode(root: ParentNode, enabled: boolean) {
  const mode = enabled ? 'on' : 'off'

  root
    .querySelectorAll<HTMLElement>(ANNOTATED_WORD_SELECTOR)
    .forEach((word) => {
      const isPresent =
        (enabled
          ? word.dataset.annotationsOnPresent
          : word.dataset.annotationsOffPresent) !== 'false'
      const isKri =
        (enabled
          ? word.dataset.annotationsOnKri
          : word.dataset.annotationsOffKri) === 'true'

      word.hidden = !isPresent
      word.classList.toggle('ktiv-kri', isPresent && isKri)
      if (word.dataset.annotationsMode === mode) return

      const currentMarkup = word.innerHTML
      const nextMarkup = word.dataset.annotationsAlternate ?? ''
      word.dataset.annotationsAlternate = currentMarkup
      word.innerHTML = isPresent ? nextMarkup : ''
      word.dataset.annotationsMode = mode
    })
}
