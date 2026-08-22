import { BlurInHeadline } from "@/components/blur-in-headline";
import { FAQ } from "@/components/faq";
import { Proof } from "@/components/proof";
import { Footer } from "@/components/footer";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { createMetadata, siteConfig } from "@/lib/metadata";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = createMetadata({
  title: "RATCHET",
  description: `Welcome to ${siteConfig.name}. ${siteConfig.description}`,
  path: "/",
});

/**
 * The landing page.
 *
 * Testimonials, a pricing table and a customer logo wall were removed rather
 * than filled in. RATCHET has no users, no prices and no customers, and
 * inventing them would be the one thing on this page that is not true.
 *
 * The template's feature grid was replaced with `Proof`, which renders the
 * real credible-interval field using numbers read out of a verified run. What
 * remains is the problem, the mechanism, the evidence, and the limitations.
 */
export default function HomePage(): ReactNode {
  return (
    <main id="main-content" className="flex-1">
      <Hero />
      <BlurInHeadline />
      <Proof />
      <HowItWorks />
      <FAQ />
      <Footer />
    </main>
  );
}
