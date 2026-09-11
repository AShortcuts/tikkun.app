<script lang="ts">
  import { resolve } from '$app/paths'
  import InformationPage from '$lib/components/InformationPage.svelte'
  import { supportEmail, supportMailto } from '$lib/support-contact'
</script>

<svelte:head>
  <title>Support — Tikkun Reader</title>
  <meta name="description" content="Get help with Tikkun Reader. Email Ocean of Torah about a reading, recording, technical issue, or suggestion." />
</svelte:head>

<InformationPage title="Here to help." current="support" introduction="A question, a recording that needs attention, or an idea for the reader? We'd like to hear from you.">
  <section class="support-contact" aria-labelledby="support-contact-title">
    <h2 id="support-contact-title">Email Tikkun support</h2>
    <p>Write to us directly. No account or form needed.</p>
    <p><a class="support-email" href={`mailto:${supportEmail}`}>{supportEmail}</a></p>
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- This shared URL opens an email client, not an app route. -->
    <a class="site-primary-action" href={supportMailto}>Email support</a>
  </section>
  <section aria-labelledby="support-details">
    <h2 id="support-details">A few details help</h2>
    <ul>
      <li>What you were trying to do, and what happened instead.</li>
      <li>The reading and aliyah, or a link to the passage, if relevant.</li>
      <li>Your device and browser or app version. A screenshot can help, too.</li>
    </ul>
  </section>
  <section aria-labelledby="support-diagnostics">
    <h2 id="support-diagnostics">Troubleshooting a technical issue?</h2>
    <p>You can copy or download a diagnostic report from <a href={resolve('/about/#support-title')}>About</a> or Reader Settings, then attach it to your email. Nothing is sent automatically.</p>
    <p>Only share details you're comfortable sending. Our <a href={resolve('/privacy/')}>privacy policy</a> explains how local data and support requests are handled.</p>
  </section>
</InformationPage>
