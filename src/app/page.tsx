import { Nav } from "@/components/marketing/nav";
import { Hero } from "@/components/marketing/hero";
import { CharterFeatures } from "@/components/marketing/charter-features";
import { Pricing } from "@/components/marketing/pricing";
import { Contact } from "@/components/marketing/contact";
import { Footer } from "@/components/marketing/footer";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <Nav />
      <main className="flex-1">
        <Hero />
        <CharterFeatures />
        <Pricing />
        <Contact />
      </main>
      <Footer />
    </div>
  );
}
