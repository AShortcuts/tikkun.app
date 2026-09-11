<script lang="ts">
  import { resolve } from '$app/paths'
  import InformationPage from '$lib/components/InformationPage.svelte'
  import { supportEmail } from '$lib/support-contact'
</script>

<svelte:head>
  <title>Privacy Policy — Tikkun Reader</title>
  <meta name="description" content="How Tikkun Reader handles local reading data, downloads, optional permissions, and support requests." />
</svelte:head>

<InformationPage title="Privacy policy" current="privacy" introduction="Your practice is personal. Here is what stays on your device, and what happens when you connect.">
  <p class="information-date">Last updated <time datetime="2026-09-11">September 11, 2026</time></p>
  <section aria-labelledby="privacy-overview">
    <h2 id="privacy-overview">A reader without an account</h2>
    <p>Tikkun Reader, by Ocean of Torah, lets you read and practice without signing up. This policy covers the Tikkun Reader website and app.</p>
    <p>We do not use advertising trackers or sell your personal information. Reading preferences and saved places are kept on your device, not in a Tikkun user account.</p>
  </section>
  <section aria-labelledby="privacy-local">
    <h2 id="privacy-local">What stays on your device</h2>
    <p>The reader uses browser or app storage for settings, bookmarks, recent reading positions, downloaded audio, and local recording or word-timing drafts. This lets you return to your place and use downloaded content offline.</p>
    <p>You can remove downloaded recordings through the reader's storage controls. Clearing the website's data in your browser, or deleting the app and its data, removes local settings and saved content. Export anything you want to keep first. Device backups are governed by your device and backup-provider settings.</p>
  </section>
  <section aria-labelledby="privacy-network">
    <h2 id="privacy-network">When you connect</h2>
    <p>The website and app request pages, Torah text, recordings, and updates needed to work. Our hosting and delivery provider, Cloudflare, may process technical request information such as your IP address, browser details, requested files, and request times to deliver and protect the service.</p>
    <p>Local storage does not mean that network requests are anonymous. See <a href="https://www.cloudflare.com/privacypolicy/" rel="noreferrer">Cloudflare's privacy policy</a> for its handling of this information. External sites and services you choose to open have their own privacy policies.</p>
  </section>
  <section aria-labelledby="privacy-permissions">
    <h2 id="privacy-permissions">Optional permissions and sharing</h2>
    <p>Microphone access is requested only when you choose to use recording tools. Captured recordings and timing drafts stay local unless you choose to export or share them. Listening to published recordings does not require microphone access.</p>
    <p>Copying, exporting, or sharing content happens only when you use those controls. You can manage microphone permission in your browser or device settings.</p>
  </section>
  <section aria-labelledby="privacy-support">
    <h2 id="privacy-support">Support and diagnostics</h2>
    <p>If you email us, we receive your email address and whatever message or attachments you choose to send. We use that information to respond and investigate your request. Please send only what is needed to explain the issue.</p>
    <p>The reader can create a local diagnostic report containing its build, coarse browser details, and recent error categories. Reports are not sent automatically. You decide whether to copy, download, or email one.</p>
    <p>For privacy questions or a request to delete support correspondence, email <a href={`mailto:${supportEmail}`}>{supportEmail}</a>. We cannot access or delete reading data stored only on your device.</p>
  </section>
  <section aria-labelledby="privacy-changes">
    <h2 id="privacy-changes">Changes to this policy</h2>
    <p>We will update this page and its date when our practices change. If anything is unclear, <a href={resolve('/support/')}>get in touch</a>.</p>
  </section>
</InformationPage>
