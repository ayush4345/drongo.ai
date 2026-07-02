"use client";

import { useEffect } from "react";

/**
 * Scroll-triggered reveal, ported 1:1 from the static landing page.
 * Adds `.r` to headers + grid items, then `.in` when they enter the viewport.
 * Renders nothing — it only wires up an IntersectionObserver after mount, so
 * with JS disabled or reduced-motion enabled the content stays fully visible.
 */
export default function ScrollReveal() {
  useEffect(() => {
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) return;

    const headers = document.querySelectorAll(
      "section .label, section h2, section .lead, .ctaband .cta",
    );
    const items = document.querySelectorAll(
      ".pcard, .step, .fcard, .stat, .gs, .spon",
    );

    // stagger grid items by their position within their row
    items.forEach((el) => {
      const parent = el.parentNode;
      const i = parent
        ? Array.prototype.indexOf.call(parent.children, el)
        : 0;
      (el as HTMLElement).style.transitionDelay = `${Math.min(i, 7) * 70}ms`;
    });

    const targets: Element[] = [
      ...Array.from(headers),
      ...Array.from(items),
    ];
    targets.forEach((el) => el.classList.add("r"));

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );

    targets.forEach((el) => io.observe(el));

    return () => io.disconnect();
  }, []);

  return null;
}
