import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { PRODUCT_NAME, PRODUCT_TAGLINE } from '../../brand';

/**
 * Public marketing landing page (`/`).
 *
 * Modelled on the package-forwarding playbook (myus.com et al) but rewritten
 * for the WeYell reality: SA → Eswatini shipping with a Sandton suite address,
 * Paystack + MTN MoMo payments, and the journey customers actually run
 * through (`/sign-in` → onboarding → dashboard). Sticky top nav, hero with
 * dual CTA, three-step "how it works", benefits grid, stores strip, pricing
 * teaser, FAQ accordion, final CTA banner, footer.
 */
@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ld-root">
      <!-- ====================== TOP NAVIGATION ====================== -->
      <header class="ld-nav" [class.is-scrolled]="scrolled()">
        <a class="ld-nav-brand" routerLink="/" [attr.aria-label]="productName + ' home'">
          <img src="/weyell-brand-logo.png" [alt]="productName" class="ld-nav-logo" />
        </a>
        <nav class="ld-nav-links" aria-label="Primary">
          <a href="#how-it-works">How it works</a>
          <a href="#benefits">Benefits</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div class="ld-nav-cta">
          <a class="bb-btn bb-btn-ghost" routerLink="/sign-in">Sign in</a>
          <a class="bb-btn bb-btn-primary" routerLink="/sign-in">Get my suite</a>
        </div>
      </header>

      <!-- ============================ HERO ============================ -->
      <section class="ld-hero">
        <div class="ld-hero-inner">
          <div class="ld-hero-copy">
            <div class="ld-hero-logo">
              <img src="/weyell-brand-logo.png" [alt]="productName" />
              <p class="ld-hero-tagline">{{ productTagline }}</p>
            </div>
            <span class="ld-eyebrow">SA → Eswatini · cross-border shipping</span>
            <h1>
              Shop South Africa's stores.<br />
              We ship to <span class="ld-hi">Eswatini</span>.
            </h1>
            <p class="ld-lede">
              Get a free Sandton suite address, shop Takealot, Superbalist, Makro and more,
              and we'll consolidate everything into one shipment to Mbabane, Manzini,
              Matsapha or your closest WeYell pickup point.
            </p>
            <div class="ld-hero-ctas">
              <a class="bb-btn bb-btn-primary ld-cta-lg" routerLink="/sign-in">
                Get my free suite address
                <span class="material-icons-outlined" aria-hidden="true">arrow_forward</span>
              </a>
              <a class="bb-btn bb-btn-outline ld-cta-lg" href="#how-it-works">
                See how it works
              </a>
            </div>
            <ul class="ld-hero-bullets">
              <li><span class="material-icons-outlined">check_circle</span>No setup fees</li>
              <li><span class="material-icons-outlined">check_circle</span>Pay with Paystack or MTN MoMo</li>
              <li><span class="material-icons-outlined">check_circle</span>WhatsApp + email support</li>
            </ul>
          </div>
          <aside class="ld-hero-art" aria-hidden="true">
            <div class="ld-hero-card ld-hero-card-suite">
              <span class="ld-hero-card-label">Your WeYell suite</span>
              <strong class="ld-hero-card-suite-num">SUI-24803</strong>
              <p>1 Maude St, Sandton<br />Johannesburg 2196, South Africa</p>
              <span class="ld-hero-card-pill">
                <span class="material-icons-outlined">verified</span>
                KYC verified
              </span>
            </div>
            <div class="ld-hero-card ld-hero-card-parcels">
              <span class="ld-hero-card-label">3 parcels in your suite</span>
              <ul class="ld-hero-card-list">
                <li>
                  <span class="ld-dot ld-dot-green"></span>
                  Takealot · Logitech MX Keys
                  <small>Received</small>
                </li>
                <li>
                  <span class="ld-dot ld-dot-amber"></span>
                  Superbalist · Running shoes
                  <small>Ready to ship</small>
                </li>
                <li>
                  <span class="ld-dot ld-dot-purple"></span>
                  Makro · Kettle 1.7L
                  <small>Awaiting invoice</small>
                </li>
              </ul>
            </div>
            <div class="ld-hero-card ld-hero-card-ship">
              <span class="ld-hero-card-label">Ship-out total</span>
              <strong class="ld-hero-card-amount">E 1,240.00</strong>
              <p>Door-to-door · Mbabane<br />ETA: 2–4 days</p>
            </div>
          </aside>
        </div>
      </section>

      <!-- ========================= STAT STRIP ========================== -->
      <section class="ld-stats" aria-label="Why WeYell">
        <div class="ld-stats-inner">
          <div class="ld-stat">
            <strong>1</strong>
            <span>Sandton hub serving every Eswatini postcode</span>
          </div>
          <div class="ld-stat">
            <strong>2–4 days</strong>
            <span>From dispatch to your door or pickup point</span>
          </div>
          <div class="ld-stat">
            <strong>Up to 60%</strong>
            <span>Saved when we consolidate multiple parcels into one shipment</span>
          </div>
          <div class="ld-stat">
            <strong>2 ways</strong>
            <span>Pay with Paystack (card) or MTN MoMo</span>
          </div>
        </div>
      </section>

      <!-- ======================== HOW IT WORKS ======================== -->
      <section id="how-it-works" class="ld-section ld-section-tinted">
        <div class="ld-section-head">
          <span class="ld-eyebrow">How WeYell works</span>
          <h2>Three steps. No surprises.</h2>
          <p>
            From "shop now" to "delivered" — your parcels move through a single, tracked
            pipeline you can watch in real time.
          </p>
        </div>

        <ol class="ld-steps">
          <li class="ld-step">
            <span class="ld-step-num">1</span>
            <span class="material-icons-outlined ld-step-icon">mark_email_read</span>
            <h3>Get your free Sandton suite address</h3>
            <p>
              Sign in with Google, finish a short KYC, and we issue you a personal SA
              suite number you'll use at every store's checkout.
            </p>
          </li>
          <li class="ld-step">
            <span class="ld-step-num">2</span>
            <span class="material-icons-outlined ld-step-icon">shopping_bag</span>
            <h3>Shop SA stores using your suite</h3>
            <p>
              Takealot, Superbalist, Makro, Woolworths, Zando, Dis-Chem, Incredible
              Connection — anything that delivers in South Africa now delivers to you.
            </p>
          </li>
          <li class="ld-step">
            <span class="ld-step-num">3</span>
            <span class="material-icons-outlined ld-step-icon">local_shipping</span>
            <h3>We consolidate & ship to Eswatini</h3>
            <p>
              Parcels land in your suite, we check + photograph each one, then send the
              lot to your door or a pickup branch close to you. Tracked end-to-end.
            </p>
          </li>
        </ol>
      </section>

      <!-- ========================== BENEFITS ========================== -->
      <section id="benefits" class="ld-section">
        <div class="ld-section-head">
          <span class="ld-eyebrow">Built for Eswatini shoppers</span>
          <h2>Everything you need in one place</h2>
          <p>
            We rebuilt the package-forwarding experience around the way Eswatini
            actually shops — local payments, WhatsApp support, transparent ZAR pricing.
          </p>
        </div>

        <div class="ld-benefits">
          <article class="ld-benefit">
            <span class="material-icons-outlined">inventory_2</span>
            <h3>Multi-parcel consolidation</h3>
            <p>Combine orders from several stores into one shipment and pay one shipping fee.</p>
          </article>
          <article class="ld-benefit">
            <span class="material-icons-outlined">price_check</span>
            <h3>Transparent ZAR quotes</h3>
            <p>See the landed cost (shipping + duties + WeYell fee) before you commit to anything.</p>
          </article>
          <article class="ld-benefit">
            <span class="material-icons-outlined">credit_card</span>
            <h3>Paystack &amp; MTN MoMo</h3>
            <p>Card payments via Paystack, or pay straight from your MTN MoMo wallet — no extra apps.</p>
          </article>
          <article class="ld-benefit">
            <span class="material-icons-outlined">verified_user</span>
            <h3>KYC-verified accounts</h3>
            <p>Upload your ID once. Customs paperwork and high-value parcels stay headache-free.</p>
          </article>
          <article class="ld-benefit">
            <span class="material-icons-outlined">photo_camera</span>
            <h3>Receive-with-photo</h3>
            <p>Every parcel is photographed on arrival so you can see what landed before you ship.</p>
          </article>
          <article class="ld-benefit">
            <span class="material-icons-outlined">explore</span>
            <h3>Real-time tracking</h3>
            <p>Watch each milestone — received, inspected, shipped, ready for collection — from your dashboard.</p>
          </article>
          <article class="ld-benefit">
            <span class="material-icons-outlined">support_agent</span>
            <h3>WhatsApp + email support</h3>
            <p>Chat with a human on WhatsApp during business hours, or open a ticket any time.</p>
          </article>
          <article class="ld-benefit">
            <span class="material-icons-outlined">storefront</span>
            <h3>PUDO or door delivery</h3>
            <p>Pick up at our Mbabane, Manzini, Matsapha or Nhlangano branches, or have it delivered.</p>
          </article>
        </div>
      </section>

      <!-- =========================== STORES =========================== -->
      <section class="ld-stores">
        <div class="ld-section-head">
          <h2>Shop your favourite South African stores</h2>
          <p>If it delivers in SA, you can shop it. Below is a small sample of where members shop most.</p>
        </div>
        <ul class="ld-store-list" role="list">
          <li>Takealot</li>
          <li>Superbalist</li>
          <li>Makro</li>
          <li>Woolworths</li>
          <li>Zando</li>
          <li>Dis-Chem</li>
          <li>Incredible Connection</li>
          <li>Cape Union Mart</li>
          <li>Sportsmans Warehouse</li>
          <li>Game</li>
          <li>Builders</li>
          <li>Poetry</li>
          <li>Amazon.co.za</li>
          <li>+ anywhere that delivers in SA</li>
        </ul>
      </section>

      <!-- ========================== PRICING =========================== -->
      <section id="pricing" class="ld-section ld-section-tinted">
        <div class="ld-section-head">
          <span class="ld-eyebrow">Plans &amp; pricing</span>
          <h2>Pay for the suite, not the surprises</h2>
          <p>
            Choose a suite plan when you sign up. Shipping is quoted per-shipment so you
            see the all-in landed cost before you pay.
          </p>
        </div>

        <div class="ld-plans">
          <article class="ld-plan">
            <header>
              <span class="ld-plan-name">Monthly</span>
              <span class="ld-plan-tag">Flexible</span>
            </header>
            <p class="ld-plan-pitch">Try WeYell for a month with no commitment.</p>
            <ul class="ld-plan-list">
              <li><span class="material-icons-outlined">check</span>Sandton suite address</li>
              <li><span class="material-icons-outlined">check</span>Real-time tracking</li>
              <li><span class="material-icons-outlined">check</span>WhatsApp + email support</li>
              <li><span class="material-icons-outlined">check</span>Consolidation included</li>
            </ul>
            <a class="bb-btn bb-btn-outline ld-plan-cta" routerLink="/sign-in">Start monthly</a>
          </article>

          <article class="ld-plan ld-plan-featured">
            <span class="ld-plan-ribbon">Most popular</span>
            <header>
              <span class="ld-plan-name">Quarterly</span>
              <span class="ld-plan-tag">Best value</span>
            </header>
            <p class="ld-plan-pitch">Three months of suite access at a lower monthly rate.</p>
            <ul class="ld-plan-list">
              <li><span class="material-icons-outlined">check</span>Everything in monthly</li>
              <li><span class="material-icons-outlined">check</span>Lower effective monthly rate</li>
              <li><span class="material-icons-outlined">check</span>Priority WhatsApp queue</li>
              <li><span class="material-icons-outlined">check</span>Renewal reminders</li>
            </ul>
            <a class="bb-btn bb-btn-primary ld-plan-cta" routerLink="/sign-in">Choose quarterly</a>
          </article>
        </div>

        <p class="ld-pricing-fine">
          Final plan prices are shown at checkout and may vary by promotion. Shipping is
          quoted per-shipment with a transparent breakdown of carrier, customs, and WeYell fee.
        </p>
      </section>

      <!-- ============================ FAQ ============================ -->
      <section id="faq" class="ld-section">
        <div class="ld-section-head">
          <span class="ld-eyebrow">Frequently asked</span>
          <h2>Questions, answered.</h2>
        </div>

        <div class="ld-faq">
          @for (item of faq; track item.q; let i = $index) {
            <details class="ld-faq-item" [open]="i === 0">
              <summary>
                <span>{{ item.q }}</span>
                <span class="material-icons-outlined ld-faq-chev">expand_more</span>
              </summary>
              <p>{{ item.a }}</p>
            </details>
          }
        </div>
      </section>

      <!-- ========================== FINAL CTA ========================= -->
      <section class="ld-cta-banner">
        <div class="ld-cta-banner-inner">
          <h2>Your Sandton suite is one sign-up away.</h2>
          <p>Sign in with Google to claim your free address and start shopping today.</p>
          <a class="bb-btn bb-btn-primary ld-cta-lg" routerLink="/sign-in">
            Get my suite address
            <span class="material-icons-outlined" aria-hidden="true">arrow_forward</span>
          </a>
        </div>
      </section>

      <!-- =========================== FOOTER =========================== -->
      <footer class="ld-footer">
        <div class="ld-footer-inner">
          <div class="ld-footer-brand">
            <img src="/weyell-brand-logo.png" [alt]="productName" class="ld-footer-logo" />
          </div>
          <p class="ld-footer-tag">{{ productTagline }} · Cross-border shipping for Eswatini.</p>

          <div class="ld-footer-cols">
            <div>
              <h4>Product</h4>
              <a href="#how-it-works">How it works</a>
              <a href="#benefits">Benefits</a>
              <a href="#pricing">Pricing</a>
              <a href="#faq">FAQ</a>
            </div>
            <div>
              <h4>Account</h4>
              <a routerLink="/sign-in">Sign in</a>
              <a routerLink="/sign-in">Get a suite</a>
            </div>
            <div>
              <h4>Support</h4>
              <a href="mailto:support@weyell.com">support&#64;weyell.com</a>
              <a href="https://wa.me/27000000000" target="_blank" rel="noopener">WhatsApp us</a>
            </div>
          </div>

          <div class="ld-footer-fine">
            <span>© {{ year }} WeYell. All rights reserved.</span>
            <span class="ld-footer-fine-sep">·</span>
            <span>Sandton hub, Johannesburg, South Africa</span>
          </div>
        </div>
      </footer>
    </div>
  `,
  styles: `
    /* ---------- root / shared ---------- */
    :host {
      display: block;
      background: var(--bb-surface);
      color: var(--bb-text);
    }
    .ld-root {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .ld-eyebrow {
      display: inline-block;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--bb-link);
      background: var(--bb-primary-soft);
      padding: 0.3rem 0.6rem;
      border-radius: 999px;
      margin-bottom: 0.85rem;
    }
    .ld-cta-lg {
      padding: 0.85rem 1.3rem;
      font-size: 0.95rem;
      gap: 0.5rem;
    }
    .ld-cta-lg .material-icons-outlined { font-size: 1.1rem !important; }

    .ld-section {
      padding: 5.5rem 1.5rem;
    }
    .ld-section-tinted {
      background: linear-gradient(180deg, #faf7ff 0%, #ffffff 100%);
    }
    .ld-section-head {
      max-width: 760px;
      margin: 0 auto 3rem;
      text-align: center;
    }
    .ld-section-head h2 {
      margin: 0 0 0.85rem;
      font-size: 2.1rem;
      letter-spacing: -0.02em;
      line-height: 1.15;
      color: var(--bb-text);
    }
    .ld-section-head p {
      margin: 0;
      font-size: 1.02rem;
      line-height: 1.55;
      color: var(--bb-muted);
    }

    /* ---------- top nav ---------- */
    .ld-nav {
      position: sticky;
      top: 0;
      z-index: 30;
      display: flex;
      align-items: center;
      gap: 1.5rem;
      padding: 0.85rem 1.5rem;
      background: rgba(255, 255, 255, 0.85);
      backdrop-filter: saturate(140%) blur(10px);
      -webkit-backdrop-filter: saturate(140%) blur(10px);
      border-bottom: 1px solid transparent;
      transition: border-color 200ms ease, box-shadow 200ms ease;
    }
    .ld-nav.is-scrolled {
      border-bottom-color: var(--bb-border);
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
    }
    .ld-nav-brand {
      display: inline-flex;
      align-items: center;
      text-decoration: none;
    }
    .ld-nav-logo {
      display: block;
      height: 42px;
      width: auto;
      border-radius: 10px;
    }
    .ld-nav-brand-text { font-size: 1.05rem; }
    .ld-nav-links {
      display: flex;
      align-items: center;
      gap: 1.5rem;
      margin-left: 0.5rem;
    }
    .ld-nav-links a {
      font-size: 0.88rem;
      font-weight: 500;
      color: var(--bb-muted);
      text-decoration: none;
      transition: color 120ms ease;
    }
    .ld-nav-links a:hover { color: var(--bb-text); }
    .ld-nav-cta {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 0.55rem;
    }
    @media (max-width: 880px) {
      .ld-nav-links { display: none; }
    }
    @media (max-width: 540px) {
      .ld-nav-cta .bb-btn-ghost { display: none; }
    }

    /* ---------- hero ---------- */
    .ld-hero {
      position: relative;
      padding: 4.5rem 1.5rem 5.5rem;
      background:
        radial-gradient(circle at 85% -10%, rgba(132, 94, 194, 0.18), transparent 55%),
        radial-gradient(circle at -5% 105%, rgba(255, 140, 66, 0.12), transparent 55%),
        #ffffff;
      overflow: hidden;
    }
    .ld-hero-inner {
      max-width: 1180px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: 1.05fr 0.95fr;
      gap: 3rem;
      align-items: center;
    }
    .ld-hero-logo {
      margin-bottom: 1.25rem;
    }
    .ld-hero-logo img {
      display: block;
      height: clamp(72px, 12vw, 104px);
      width: auto;
      border-radius: 14px;
      box-shadow: 0 12px 32px rgba(15, 23, 42, 0.12);
    }
    .ld-hero-tagline {
      margin: 0.55rem 0 0;
      font-size: 0.92rem;
      font-weight: 600;
      color: var(--bb-muted);
      letter-spacing: 0.02em;
    }
    .ld-hero h1 {
      margin: 0 0 1.1rem;
      font-size: clamp(2.1rem, 4.4vw, 3.4rem);
      line-height: 1.08;
      letter-spacing: -0.025em;
      color: var(--bb-text);
    }
    .ld-hero .ld-hi {
      background: linear-gradient(120deg, var(--bb-primary), #b08aee);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    .ld-lede {
      margin: 0 0 1.8rem;
      font-size: 1.08rem;
      line-height: 1.55;
      color: var(--bb-muted);
      max-width: 540px;
    }
    .ld-hero-ctas {
      display: flex;
      flex-wrap: wrap;
      gap: 0.7rem;
      margin-bottom: 1.6rem;
    }
    .ld-hero-bullets {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem 1.5rem;
    }
    .ld-hero-bullets li {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.82rem;
      color: var(--bb-muted);
    }
    .ld-hero-bullets .material-icons-outlined {
      color: #22c55e;
      font-size: 1rem !important;
    }

    .ld-hero-art {
      position: relative;
      min-height: 420px;
    }
    .ld-hero-card {
      position: absolute;
      background: var(--bb-surface);
      border: 1px solid var(--bb-border);
      border-radius: 14px;
      padding: 1.1rem 1.2rem;
      box-shadow: 0 20px 50px -20px rgba(15, 23, 42, 0.25);
      width: clamp(230px, 22vw, 280px);
    }
    .ld-hero-card-label {
      display: block;
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--bb-muted);
      margin-bottom: 0.5rem;
    }
    .ld-hero-card p {
      margin: 0.4rem 0 0.65rem;
      font-size: 0.84rem;
      color: var(--bb-muted);
      line-height: 1.45;
    }
    .ld-hero-card-suite {
      top: 0;
      left: 0;
      transform: rotate(-2.5deg);
    }
    .ld-hero-card-suite-num {
      display: block;
      font-size: 1.6rem;
      font-weight: 800;
      letter-spacing: -0.01em;
      color: var(--bb-text);
    }
    .ld-hero-card-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      padding: 0.25rem 0.55rem;
      border-radius: 999px;
      background: #ecfdf5;
      color: #047857;
      font-size: 0.72rem;
      font-weight: 700;
    }
    .ld-hero-card-pill .material-icons-outlined {
      font-size: 0.95rem !important;
    }
    .ld-hero-card-parcels {
      top: 35%;
      right: 0;
      transform: rotate(2deg);
      width: clamp(250px, 24vw, 310px);
    }
    .ld-hero-card-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
    }
    .ld-hero-card-list li {
      display: grid;
      grid-template-columns: auto 1fr;
      grid-template-rows: auto auto;
      column-gap: 0.55rem;
      font-size: 0.85rem;
      color: var(--bb-text);
      align-items: center;
    }
    .ld-hero-card-list li small {
      grid-column: 2;
      font-size: 0.72rem;
      color: var(--bb-muted);
    }
    .ld-dot {
      width: 0.55rem;
      height: 0.55rem;
      border-radius: 50%;
      grid-row: 1 / span 2;
    }
    .ld-dot-green { background: #22c55e; }
    .ld-dot-amber { background: #f59e0b; }
    .ld-dot-purple { background: var(--bb-primary); }
    .ld-hero-card-ship {
      bottom: 0;
      left: 12%;
      transform: rotate(-1.5deg);
    }
    .ld-hero-card-amount {
      font-size: 1.65rem;
      font-weight: 800;
      letter-spacing: -0.01em;
      color: var(--bb-text);
    }
    @media (max-width: 900px) {
      .ld-hero-inner { grid-template-columns: 1fr; gap: 2.5rem; }
      .ld-hero-art { display: none; }
    }

    /* ---------- stat strip ---------- */
    .ld-stats {
      padding: 0 1.5rem 0;
      transform: translateY(-2rem);
    }
    .ld-stats-inner {
      max-width: 1180px;
      margin: 0 auto;
      background: var(--bb-text);
      color: #fff;
      border-radius: 18px;
      padding: 1.6rem 2rem;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1.5rem;
      box-shadow: 0 25px 50px -25px rgba(15, 23, 42, 0.45);
    }
    .ld-stat strong {
      display: block;
      font-size: 1.5rem;
      font-weight: 800;
      letter-spacing: -0.015em;
      color: #fff;
    }
    .ld-stat span {
      font-size: 0.82rem;
      color: rgba(255, 255, 255, 0.72);
      line-height: 1.4;
      display: block;
      margin-top: 0.25rem;
    }
    @media (max-width: 760px) {
      .ld-stats-inner { grid-template-columns: repeat(2, 1fr); gap: 1.2rem; }
    }

    /* ---------- how it works ---------- */
    .ld-steps {
      max-width: 1180px;
      margin: 0 auto;
      padding: 0;
      list-style: none;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.4rem;
      counter-reset: ld-step;
    }
    .ld-step {
      position: relative;
      background: var(--bb-surface);
      border: 1px solid var(--bb-border);
      border-radius: 14px;
      padding: 2rem 1.5rem 1.5rem;
      box-shadow: var(--bb-shadow);
    }
    .ld-step-num {
      position: absolute;
      top: -1rem;
      left: 1.5rem;
      width: 2rem;
      height: 2rem;
      border-radius: 50%;
      background: var(--bb-primary);
      color: #fff;
      font-weight: 800;
      font-size: 0.9rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 6px 16px -6px rgba(132, 94, 194, 0.6);
    }
    .ld-step-icon {
      font-size: 1.8rem !important;
      color: var(--bb-link);
      margin-bottom: 0.4rem;
    }
    .ld-step h3 {
      margin: 0 0 0.5rem;
      font-size: 1.08rem;
      color: var(--bb-text);
      letter-spacing: -0.01em;
    }
    .ld-step p {
      margin: 0;
      font-size: 0.92rem;
      color: var(--bb-muted);
      line-height: 1.55;
    }
    @media (max-width: 880px) {
      .ld-steps { grid-template-columns: 1fr; gap: 1.6rem; }
    }

    /* ---------- benefits ---------- */
    .ld-benefits {
      max-width: 1180px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1.1rem;
    }
    .ld-benefit {
      background: var(--bb-surface);
      border: 1px solid var(--bb-border);
      border-radius: 14px;
      padding: 1.35rem 1.3rem;
      box-shadow: var(--bb-shadow);
      transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
    }
    .ld-benefit:hover {
      transform: translateY(-3px);
      box-shadow: var(--bb-shadow-md);
      border-color: rgba(132, 94, 194, 0.35);
    }
    .ld-benefit .material-icons-outlined {
      font-size: 1.5rem !important;
      color: var(--bb-link);
      background: var(--bb-primary-soft);
      width: 2.4rem;
      height: 2.4rem;
      border-radius: 10px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 0.75rem;
    }
    .ld-benefit h3 {
      margin: 0 0 0.35rem;
      font-size: 1rem;
      color: var(--bb-text);
    }
    .ld-benefit p {
      margin: 0;
      font-size: 0.85rem;
      color: var(--bb-muted);
      line-height: 1.5;
    }
    @media (max-width: 1080px) {
      .ld-benefits { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 560px) {
      .ld-benefits { grid-template-columns: 1fr; }
    }

    /* ---------- stores ---------- */
    .ld-stores {
      padding: 3rem 1.5rem 5rem;
      max-width: 1180px;
      margin: 0 auto;
      text-align: center;
    }
    .ld-stores .ld-section-head {
      margin-bottom: 2rem;
    }
    .ld-stores .ld-section-head h2 {
      font-size: 1.55rem;
    }
    .ld-store-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 0.6rem;
    }
    .ld-store-list li {
      padding: 0.55rem 0.95rem;
      border: 1px solid var(--bb-border);
      border-radius: 999px;
      background: var(--bb-surface);
      font-size: 0.85rem;
      color: var(--bb-text);
      font-weight: 500;
    }

    /* ---------- pricing ---------- */
    .ld-plans {
      max-width: 880px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1.4rem;
    }
    .ld-plan {
      position: relative;
      background: var(--bb-surface);
      border: 1px solid var(--bb-border);
      border-radius: 16px;
      padding: 2rem 1.75rem;
      box-shadow: var(--bb-shadow);
    }
    .ld-plan-featured {
      border-color: var(--bb-link);
      background: linear-gradient(180deg, #ffffff 0%, #fbf8ff 100%);
      box-shadow: 0 20px 40px -20px rgba(132, 94, 194, 0.35);
    }
    .ld-plan-ribbon {
      position: absolute;
      top: -0.75rem;
      left: 1.75rem;
      background: var(--bb-primary);
      color: #fff;
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      padding: 0.3rem 0.7rem;
      border-radius: 999px;
      box-shadow: 0 6px 16px -6px rgba(132, 94, 194, 0.6);
    }
    .ld-plan header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0.6rem;
    }
    .ld-plan-name {
      font-size: 1.25rem;
      font-weight: 800;
      letter-spacing: -0.01em;
      color: var(--bb-text);
    }
    .ld-plan-tag {
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--bb-link);
      background: var(--bb-primary-soft);
      padding: 0.25rem 0.55rem;
      border-radius: 999px;
    }
    .ld-plan-pitch {
      margin: 0 0 1rem;
      color: var(--bb-muted);
      font-size: 0.92rem;
      line-height: 1.5;
    }
    .ld-plan-list {
      list-style: none;
      padding: 0;
      margin: 0 0 1.4rem;
      display: flex;
      flex-direction: column;
      gap: 0.55rem;
    }
    .ld-plan-list li {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.9rem;
      color: var(--bb-text);
    }
    .ld-plan-list .material-icons-outlined {
      color: #22c55e;
      font-size: 1.05rem !important;
    }
    .ld-plan-cta {
      width: 100%;
      justify-content: center;
      padding: 0.7rem 1rem;
      font-size: 0.9rem;
    }
    .ld-pricing-fine {
      max-width: 700px;
      margin: 2rem auto 0;
      text-align: center;
      font-size: 0.8rem;
      color: var(--bb-muted);
      line-height: 1.55;
    }
    @media (max-width: 760px) {
      .ld-plans { grid-template-columns: 1fr; }
    }

    /* ---------- faq ---------- */
    .ld-faq {
      max-width: 760px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
    }
    .ld-faq-item {
      background: var(--bb-surface);
      border: 1px solid var(--bb-border);
      border-radius: 12px;
      overflow: hidden;
    }
    .ld-faq-item summary {
      list-style: none;
      cursor: pointer;
      padding: 1.05rem 1.25rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      font-weight: 600;
      color: var(--bb-text);
      font-size: 0.95rem;
    }
    .ld-faq-item summary::-webkit-details-marker { display: none; }
    .ld-faq-item p {
      margin: 0;
      padding: 0 1.25rem 1.15rem;
      color: var(--bb-muted);
      font-size: 0.9rem;
      line-height: 1.6;
    }
    .ld-faq-chev {
      transition: transform 180ms ease;
      color: var(--bb-muted);
    }
    .ld-faq-item[open] .ld-faq-chev { transform: rotate(180deg); }

    /* ---------- cta banner ---------- */
    .ld-cta-banner {
      padding: 4rem 1.5rem;
      background:
        radial-gradient(circle at 0% 0%, rgba(255, 140, 66, 0.25), transparent 50%),
        radial-gradient(circle at 100% 100%, rgba(255, 255, 255, 0.18), transparent 50%),
        linear-gradient(135deg, var(--bb-primary), #6b3fb0);
      color: #fff;
    }
    .ld-cta-banner-inner {
      max-width: 880px;
      margin: 0 auto;
      text-align: center;
    }
    .ld-cta-banner h2 {
      margin: 0 0 0.6rem;
      font-size: clamp(1.7rem, 3.6vw, 2.4rem);
      letter-spacing: -0.02em;
      color: #fff;
    }
    .ld-cta-banner p {
      margin: 0 0 1.6rem;
      font-size: 1.05rem;
      color: rgba(255, 255, 255, 0.85);
    }
    .ld-cta-banner .bb-btn-primary {
      background: #fff;
      color: var(--bb-link);
      box-shadow: 0 12px 28px -10px rgba(0, 0, 0, 0.35);
    }
    .ld-cta-banner .bb-btn-primary:hover {
      background: #faf5ff;
      color: var(--bb-primary-hover);
    }

    /* ---------- footer ---------- */
    .ld-footer {
      background: var(--bb-text);
      color: rgba(255, 255, 255, 0.7);
      padding: 3.5rem 1.5rem 2rem;
    }
    .ld-footer-inner {
      max-width: 1180px;
      margin: 0 auto;
    }
    .ld-footer-brand {
      display: inline-flex;
      align-items: center;
    }
    .ld-footer-logo {
      display: block;
      height: 56px;
      width: auto;
      border-radius: 12px;
    }
    .ld-footer-tag {
      margin: 0.55rem 0 2rem;
      font-size: 0.92rem;
      color: rgba(255, 255, 255, 0.65);
    }
    .ld-footer-cols {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.5rem;
      margin-bottom: 2.5rem;
    }
    .ld-footer-cols h4 {
      margin: 0 0 0.85rem;
      font-size: 0.85rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.6);
    }
    .ld-footer-cols a {
      display: block;
      padding: 0.25rem 0;
      font-size: 0.9rem;
      color: rgba(255, 255, 255, 0.85);
      text-decoration: none;
    }
    .ld-footer-cols a:hover { color: #fff; text-decoration: underline; }
    .ld-footer-fine {
      padding-top: 1.5rem;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      font-size: 0.78rem;
      color: rgba(255, 255, 255, 0.5);
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
    }
    .ld-footer-fine-sep { opacity: 0.5; }
    @media (max-width: 640px) {
      .ld-footer-cols { grid-template-columns: 1fr 1fr; }
    }
  `,
})
export class LandingComponent {
  readonly productName = PRODUCT_NAME;
  readonly productTagline = PRODUCT_TAGLINE;
  readonly year = new Date().getFullYear();
  readonly scrolled = signal(false);

  readonly faq: ReadonlyArray<{ q: string; a: string }> = [
    {
      q: "Where is the WeYell warehouse?",
      a: "Our hub is in Sandton, Johannesburg. Every WeYell member gets a unique suite number at that address and uses it like a normal SA delivery address at any store.",
    },
    {
      q: "Which stores can I shop from?",
      a: "Anywhere that delivers in South Africa — Takealot, Superbalist, Makro, Woolworths, Zando, Dis-Chem, Incredible Connection, Cape Union Mart and more. If a store ships in SA, your suite address works.",
    },
    {
      q: "How do payments work?",
      a: "Pay your monthly or quarterly suite plan with Paystack (card) or MTN MoMo. Per-shipment ship-out fees use the same options — pick a method on the checkout screen and you're done.",
    },
    {
      q: "How long does shipping to Eswatini take?",
      a: "Most consolidated shipments arrive in 2–4 business days after dispatch from Sandton. Customs and weather can affect this; you'll see a live ETA on your dashboard.",
    },
    {
      q: "Do I have to verify my identity?",
      a: "Yes — a one-time KYC upload (national ID or passport) is required before your first ship-out. It keeps customs paperwork clean and protects your account from fraud.",
    },
    {
      q: "What happens if a parcel arrives damaged?",
      a: "Our ops team photographs every parcel on arrival and flags damage automatically. You'll see the photos and inspection notes on your dashboard before you decide to ship.",
    },
    {
      q: "Can I pick up in person?",
      a: "Yes — choose PUDO pickup at our Mbabane, Manzini, Matsapha or Nhlangano branches, or door-to-door delivery. You pick per shipment.",
    },
  ];

  @HostListener('window:scroll')
  onScroll(): void {
    this.scrolled.set(window.scrollY > 12);
  }
}
