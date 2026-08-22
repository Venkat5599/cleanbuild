"use client";

import { motion, AnimatePresence } from "motion/react";
import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

/**
 * These are the real limitations, stated plainly. A page that only lists
 * strengths tells a reader nothing they can act on.
 */
const faqs = [
  {
    question: "Is the data on the dashboard real?",
    answer:
      "The history is synthetic and generated with a known ground truth, so the learning path can be verified rather than asserted. A script replays it and checks that the model recovers the effects that were planted. It is not a real creator's channel, and it is labelled as synthetic everywhere it appears.",
  },
  {
    question: "How much history does it need before it is useful?",
    answer:
      "There are thirty-five things being estimated, so a few dozen posts is not enough on its own. Below roughly a hundred and fifty posts the estimates lean on a prior pooled from other creators in the same niche. The ordering of effects becomes trustworthy well before the exact magnitudes do.",
  },
  {
    question: "Why are the numbers smaller than the real effects?",
    answer:
      "Deliberately. Estimates are pulled toward the niche prior in proportion to how little evidence supports them, so a feature seen eight times cannot shout as loudly as one seen eighty. The bars widen instead of the number inflating.",
  },
  {
    question: "What happens when a post's metrics never arrive?",
    answer:
      "The experiment is voided and excluded. Nothing is imputed. A guessed result is indistinguishable from a measured one once it is inside the model, and it would quietly corrupt every belief that follows.",
  },
  {
    question: "Does it post for you?",
    answer:
      "No, and it is not built to. It reads, it reasons and it tells you what it found. Publishing stays a human decision.",
  },
  {
    question: "What is actually running while nobody is watching?",
    answer:
      "A scheduled job on Cloudflare's cron. It matures experiments, recomputes the model, and briefs the agent, with every browser closed. There is a script in the repository that demonstrates the whole path end to end.",
  },
];

const ease = [0.23, 1, 0.32, 1] as const;

function FAQItem({
  faq,
  index,
  isOpen,
  onToggle,
}: {
  faq: (typeof faqs)[0];
  index: number;
  isOpen: boolean;
  onToggle: () => void;
}): ReactNode {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, ease, delay: index * 0.05 }}
      onClick={onToggle}
      className="cursor-pointer rounded-2xl bg-frame p-5 shadow-sm sm:p-6"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      aria-expanded={isOpen}
    >
      <div className="flex w-full items-center justify-between gap-4 text-left">
        <span className="text-base font-medium text-foreground sm:text-lg">
          {faq.question}
        </span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.3, ease }}
          className="shrink-0"
        >
          <ChevronDown className="h-5 w-5 text-muted-foreground" />
        </motion.div>
      </div>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease }}
            className="overflow-hidden"
          >
            <p className="pt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
              {faq.answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function FAQ(): ReactNode {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const handleToggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section className="w-full px-6 py-20 sm:py-28">
      <div className="mx-auto max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease }}
          className="mb-12 text-center sm:mb-16"
        >
          <span className="text-sm font-medium text-muted-foreground">
            Frequently Asked Questions
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            Everything you need to know
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
            Can&apos;t find the answer you&apos;re looking for? Reach out!
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <motion.a
              href="#"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex items-center rounded-xl bg-foreground px-6 py-2.5 text-sm font-semibold text-background transition-colors hover:bg-foreground/90"
            >
              Get Started
            </motion.a>
            <motion.a
              href="#"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex items-center rounded-xl border border-border bg-frame px-6 py-2.5 text-sm font-semibold text-foreground transition-colors"
            >
              Contact Support
            </motion.a>
          </div>
        </motion.div>

        <div className="flex flex-col gap-3" role="list">
          {faqs.map((faq, index) => (
            <FAQItem
              key={index}
              faq={faq}
              index={index}
              isOpen={openIndex === index}
              onToggle={() => handleToggle(index)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
