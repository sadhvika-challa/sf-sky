import { useEffect } from 'react'
import type { PublicRoute } from './routes'
import './public-page.css'

const SUPPORT_EMAIL = 'sadhvikac1@gmail.com'

const PAGE_METADATA: Readonly<Record<PublicRoute, {
  title: string
  description: string
}>> = {
  privacy: {
    title: 'Privacy | Soleil',
    description: 'How Soleil handles location, saved spots, weather requests, maps, and support messages.',
  },
  support: {
    title: 'Support | Soleil',
    description: 'Get help using Soleil, including location recovery, live weather, saved spots, and issue reporting.',
  },
}

interface PublicPageProps {
  route: PublicRoute
}

function usePageMetadata(route: PublicRoute): void {
  useEffect(() => {
    const previousTitle = document.title
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const previousDescription = description?.content
    const createdDescription = description === null
    const activeDescription = description ?? document.createElement('meta')

    if (createdDescription) {
      activeDescription.name = 'description'
      document.head.append(activeDescription)
    }

    document.title = PAGE_METADATA[route].title
    activeDescription.content = PAGE_METADATA[route].description

    return () => {
      document.title = previousTitle
      if (createdDescription) {
        activeDescription.remove()
      } else if (previousDescription !== undefined) {
        activeDescription.content = previousDescription
      }
    }
  }, [route])
}

function SiteHeader({ route }: PublicPageProps) {
  return (
    <>
      <a className="public-skip-link" href="#main-content">Skip to main content</a>
      <header className="public-header">
        <a className="public-brand" href="/" aria-label="Open Soleil map">
          <span className="public-brand-mark" aria-hidden="true">☀</span>
          <span>Soleil</span>
        </a>
        <nav className="public-nav" aria-label="Public pages">
          <a href="/" className="public-nav-link">Open Soleil</a>
          <a
            href="/soleil/privacy"
            className="public-nav-link"
            aria-current={route === 'privacy' ? 'page' : undefined}
          >
            Privacy
          </a>
          <a
            href="/soleil/support"
            className="public-nav-link"
            aria-current={route === 'support' ? 'page' : undefined}
          >
            Support
          </a>
        </nav>
      </header>
    </>
  )
}

function PrivacyPage() {
  return (
    <article className="public-article" aria-labelledby="privacy-title">
      <div className="public-intro">
        <p className="public-eyebrow">Privacy notice</p>
        <h1 id="privacy-title">Your sky plans should stay yours.</h1>
        <p className="public-lede">
          Soleil helps you compare sunrise, sunset, stargazing, and current sky conditions.
          This notice explains what the current website, PWA, and iOS build handle when you use them.
        </p>
        <p className="public-date">Effective and last updated August 30, 2026</p>
      </div>

      <section aria-labelledby="location-heading">
        <h2 id="location-heading">Location</h2>
        <p>
          Location is optional. If you grant access, Soleil processes your current coordinates during that
          session to rank nearby spots, calculate distances, choose relevant city coverage, and display your
          location marker on the map. Soleil does not save your precise current location in its own storage.
          You can continue browsing supported cities without granting location access.
        </p>
        <p>
          Your browser or operating system manages the location permission and may keep its own permission
          setting. You can change that permission in your browser or device settings.
        </p>
      </section>

      <section aria-labelledby="local-heading">
        <h2 id="local-heading">Information kept on your device</h2>
        <p>
          Saved spots, display preferences, and certain onboarding or interface settings are stored locally
          on your device. The current build does not provide accounts or sync this information to a Soleil
          account. Removing site data or deleting the app can remove these local choices.
        </p>
      </section>

      <section aria-labelledby="providers-heading">
        <h2 id="providers-heading">Weather, maps, typography, and hosting</h2>
        <p>Soleil depends on services operated by other companies:</p>
        <ul>
          <li>
            <strong>Open-Meteo:</strong> Soleil sends catalog spot or neighborhood coordinates, rather than
            your device's precise current location, to retrieve weather forecasts and air-quality data used
            in score evidence. Open-Meteo receives the request's IP address and request details that may include
            geographic query coordinates. Open-Meteo says troubleshooting logs can contain those coordinates
            and are deleted after 90 days. Read the{' '}
            <a href="https://open-meteo.com/en/terms" rel="noreferrer">Open-Meteo terms and privacy information</a>.
          </li>
          <li>
            <strong>CARTO:</strong> Map tile requests disclose the visible map area and technical request
            information. CARTO's current basemap terms describe logging a truncated IP address, referrer,
            user agent, timestamps, and request volume, with logs retained in the United States for 30 days.
            Soleil's current unkeyed basemap integration remains subject to release review. This notice does
            not establish that integration's release compliance. Read the{' '}
            <a href="https://carto.com/legal/basemap-terms/" rel="noreferrer">CARTO basemap terms</a>.
          </li>
          <li>
            <strong>Typography:</strong> The current build bundles its font files locally and does not
            contact Google Fonts to display typography.
          </li>
          <li>
            <strong>Vercel:</strong> The website and PWA are hosted on Vercel. Normal web requests may expose
            your IP address, city or country inferred from IP, user agent, requested path, referrer, timestamps,
            and diagnostic information under the{' '}
            <a href="https://vercel.com/legal/privacy-policy" rel="noreferrer">Vercel Privacy Policy</a>.
          </li>
        </ul>
      </section>

      <section aria-labelledby="external-heading">
        <h2 id="external-heading">Links and messages you choose to open</h2>
        <p>
          Soleil only opens Google Maps directions, Street View, or an event's external website after you
          choose the relevant link. Soleil passes Google Maps the selected catalog destination or viewpoint
          and, for directions, your chosen travel mode. Soleil does not place your current location in that
          link. Google Maps may independently choose a starting location and process activity according to
          your Google, device, and Maps settings. Soleil does not receive your route or Maps history.
        </p>
        <p>
          Choosing to report a bug or suggest a spot creates a draft in your email application. A bug draft
          includes your description, the current Soleil page URL, your browser or app user agent, and a
          timestamp. A spot suggestion includes the name and reason you entered. Nothing is sent until you
          choose to send the draft. Sent mail is handled by your email provider and delivered to Sadhvika
          Challa, who uses it to respond to support requests and evaluate product or spot improvements. The
          support mailbox is accessed by Sadhvika. A fixed retention period has not yet been approved, so sent
          messages remain there until manually deleted. You may request deletion through the contact address
          below. Do not include sensitive personal information in a support message.
        </p>
      </section>

      <section aria-labelledby="current-build-heading">
        <h2 id="current-build-heading">What the current build does not include</h2>
        <p>
          The current build has no Soleil user accounts, advertising SDKs, or analytics SDKs. This notice is
          a description of the current product, not an App Store privacy determination or approval. It will be
          updated if Soleil's data practices or providers change.
        </p>
        <p>
          Soleil does not include its own crash-reporting SDK. If you choose in iOS Settings to share analytics
          with Apple and app developers, Apple may make privacy-protected usage and crash information available
          to the operator. Apple controls that collection and your opt-in setting.
        </p>
      </section>

      <section aria-labelledby="contact-heading">
        <h2 id="contact-heading">Contact</h2>
        <p>
          Soleil is operated by Sadhvika Challa. For privacy questions, email{' '}
          <a href={`mailto:${SUPPORT_EMAIL}?subject=Soleil%20privacy%20question`}>{SUPPORT_EMAIL}</a> or visit the{' '}
          <a href="/soleil/support">Soleil support page</a>.
        </p>
      </section>
    </article>
  )
}

function SupportPage() {
  return (
    <article className="public-article" aria-labelledby="support-title">
      <div className="public-intro">
        <p className="public-eyebrow">Support</p>
        <h1 id="support-title">Help with Soleil</h1>
        <p className="public-lede">
          Find a quick answer below, or send enough detail for the problem to be reproduced.
        </p>
        <p className="public-date">Effective and last updated August 30, 2026</p>
      </div>

      <section aria-labelledby="browse-heading">
        <h2 id="browse-heading">Browse without sharing location</h2>
        <p>
          Location is optional. Open Soleil, choose a supported city, then browse its spots and scores.
          Nearby recommendations require location access, but city browsing does not.
        </p>
      </section>

      <section aria-labelledby="location-help-heading">
        <h2 id="location-help-heading">Recover location access</h2>
        <ol>
          <li>Open your browser or iPhone settings and find Soleil's location permission.</li>
          <li>Allow location while using the app or website.</li>
          <li>Return to Soleil and choose the location control again.</li>
        </ol>
        <p>
          If access is still unavailable, check that Location Services are enabled for the device. You can
          always keep browsing by city while location is off.
        </p>
      </section>

      <section aria-labelledby="live-data-heading">
        <h2 id="live-data-heading">Live weather and map data</h2>
        <p>
          Current scores, forecasts, confidence, and map tiles require a network connection and depend on
          third-party services. Check the last updated or unavailable state shown in Soleil before relying on
          a score. A saved or installed app can still open with limited cached information when offline, but
          it cannot refresh live conditions until the network returns.
        </p>
      </section>

      <section aria-labelledby="saved-heading">
        <h2 id="saved-heading">Saved spots</h2>
        <p>
          Saved spots stay on the device where you saved them. They do not currently sync between browsers,
          phones, or reinstalls. Clearing browser data or deleting the app can remove them.
        </p>
      </section>

      <section aria-labelledby="report-heading">
        <h2 id="report-heading">Report a problem or suggest a spot</h2>
        <p>When you email, please include:</p>
        <ul>
          <li>What you expected and what happened instead.</li>
          <li>The city and spot, if the issue concerns a specific location.</li>
          <li>Whether you used the website, installed PWA, or iPhone app.</li>
          <li>Your device model, operating system version, and browser version.</li>
          <li>The approximate date and time, plus a screenshot if it is safe to share.</li>
        </ul>
        <a
          className="public-primary-link"
          href={`mailto:${SUPPORT_EMAIL}?subject=Soleil%20support%20request`}
        >
          Email Soleil support
        </a>
        <p className="public-contact-detail">Support email: {SUPPORT_EMAIL}</p>
      </section>

      <section aria-labelledby="privacy-help-heading">
        <h2 id="privacy-help-heading">Privacy questions</h2>
        <p>
          Read the <a href="/soleil/privacy">Soleil privacy notice</a> for details about location, local storage,
          weather providers, maps, local typography, hosting, and support messages.
        </p>
      </section>
    </article>
  )
}

export default function PublicPage({ route }: PublicPageProps) {
  usePageMetadata(route)

  return (
    <div className="public-site">
      <SiteHeader route={route} />
      <main id="main-content" className="public-main" tabIndex={-1}>
        {route === 'privacy' ? <PrivacyPage /> : <SupportPage />}
      </main>
      <footer className="public-footer">
        <p>© 2026 Sadhvika Challa</p>
        <div className="public-footer-links">
          <a href="/third-party-notices.txt">Third-party notices</a>
          <a href="/">Open Soleil</a>
        </div>
      </footer>
    </div>
  )
}
