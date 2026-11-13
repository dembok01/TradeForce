import { Nav } from "@/components/marketing/nav";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Bento } from "@/components/marketing/bento";
import { StatStrip } from "@/components/marketing/stat-strip";
import { CharterFeatures } from "@/components/marketing/charter-features";
import { Comparison } from "@/components/marketing/comparison";
import { LiveDemo } from "@/components/marketing/live-demo";
import { Testimonials } from "@/components/marketing/testimonials";
import { Pricing } from "@/components/marketing/pricing";
import { Faq } from "@/components/marketing/faq";
import { BlogGrid } from "@/components/marketing/blog-grid";
import { Contact } from "@/components/marketing/contact";
import { ClosingCta } from "@/components/marketing/closing-cta";
import { Footer } from "@/components/marketing/footer";
import { MotionProvider } from "@/components/motion/motion-provider";

/**
 * The reference's section run, with TradeForce's content.
 *
 * Scope: this rework is the landing page only. The `landing` class carries
 * Manrope and the link focus ring so they reach this page and nothing else —
 * the dashboard, admin, auth and onboarding screens keep Inter/Fraunces and
 * the 8px radius scale they always had.
 *
 * MotionProvider is mounted here rather than in the root layout for the same
 * reason: the dashboard layout already has its own, and this page needs one so
 * its scroll reveals honour prefers-reduced-motion (the CSS kill-switch in
 * globals.css cannot reach motion's inline styles).
 *
 * Three sections render nothing today and that is deliberate: StatStrip,
 * Testimonials and BlogGrid each return null while their data array is empty,
 * because inventing figures, customers or posts for a live commercial product
 * is the one thing the design spec names as a failure.
 */
export default function Home() {
  return (
    <MotionProvider>
      <div className="landing flex flex-1 flex-col">
        <Nav />
        <main className="flex-1">
          <Hero />
          <HowItWorks />
          <Bento />
          <StatStrip />
          <CharterFeatures />
          <Comparison />
          <LiveDemo />
          <Testimonials />
          <Pricing />
          <Faq />
          <BlogGrid />
          <Contact />
          <ClosingCta />
        </main>
        <Footer />
      </div>
    </MotionProvider>
  );
}
