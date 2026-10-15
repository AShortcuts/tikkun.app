<script lang="ts">
  import { resolve } from '$app/paths'
  import InformationPage from '$lib/components/InformationPage.svelte'
  import { supportEmail } from '$lib/support-contact'
  import AnalyticsPreference from '../../../../app/analytics/AnalyticsPreference.svelte'
</script>

<svelte:head>
  <title>Privacy Policy — Tikkun Reader</title>
  <meta name="description" content="How Tikkun Reader handles local reading data, downloads, optional permissions, and support requests." />
</svelte:head>

<InformationPage title="Privacy policy" current="privacy" introduction="Your practice is personal. Here is what stays on your device, and what happens when you connect.">
  <p class="information-date">Last updated <time datetime="2026-09-30">September 30, 2026</time></p>
  <section aria-labelledby="privacy-overview">
    <h2 id="privacy-overview">A reader without an account</h2>
    <p>Tikkun Reader lets you read and practice without signing up. This policy covers the Tikkun Reader website and app.</p>
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
  <section aria-labelledby="privacy-analytics">
    <h2 id="privacy-analytics">Privacy-preserving analytics</h2>
    <p>When enabled for this release, our self-hosted Melytics service receives page categories, feature actions, playback and visible-page time, and error categories. Website and app statistics are kept separate. We do not send search text, exact passages, bookmarks, recordings, full referrer URLs, or error messages in analytics.</p>
    <p>The service processes your IP address and browser or app information to estimate daily visitors and report device and country statistics. It uses a daily salted hash instead of storing the raw IP address in analytics. We do not create a persistent analytics identifier or use analytics cookies. Raw analytics records are retained for 90 days; daily summaries are kept longer.</p>
    <p>You can turn collection off on this device here or in Reader Settings under More. Offline activity is not queued for later delivery.</p>
    <AnalyticsPreference />
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
    <p>We will update this page and its date when our practices change. If anything is unclear, <a href={resolve('/support')}>get in touch</a>.</p>
  </section>
</InformationPage>
