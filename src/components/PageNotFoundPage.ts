export default function PageNotFoundPage() {
  return `
    <main class="page-not-found">
      <p class="page-not-found-eyebrow">Reader</p>
      <h1>Page Not Found</h1>
      <p>This passage isn't available. Return to the Reading Index to choose another place.</p>
      <button class="page-not-found-action" data-target-id="open-reading-index" type="button">
        Open Reading Index
      </button>
    </main>
  `
}
