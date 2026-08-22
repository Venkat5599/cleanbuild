import { BlurInHeadline } from "@/components/blur-in-headline";
import { FAQ } from "@/components/faq";
import { FeaturesBento } from "@/components/features-bento";
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
 * Every other section keeps the template's design exactly. Only the copy
 * changed, to describe what this product actually does.
 */
export default function HomePage(): ReactNode {
  return (
    <main id="main-content" className="flex-1">
      <Hero />
      <BlurInHeadline />
      <FeaturesBento />
      <HowItWorks />
      <FAQ />
      <Footer />
    </main>
  );
}
