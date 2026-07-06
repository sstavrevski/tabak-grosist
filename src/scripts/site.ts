import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

gsap.registerPlugin(ScrollTrigger);

// The page scrolls inside #shell, not the window, so everything scroll-related
// must watch the shell. ScrollTrigger uses it as the scroller too.
const shell = document.getElementById("shell") as HTMLElement;
ScrollTrigger.defaults({ scroller: shell });

/* Custom eased smooth-scroll — consistent on every browser (Safari's native
   smooth scroll is janky), with an offset so sections clear the fixed header. */
const scrollToTarget = (target: Element) => {
  // Align the section's content wrapper (which starts after the section's
  // large top padding) just under the fixed header — otherwise we'd land on
  // the padded section edge and leave a big empty gap before the heading.
  const headerOffset = 70;
  const gap = 32;
  const anchor = target.querySelector(".section-inner") ?? target;
  const startY = shell.scrollTop;
  const destY = Math.max(
    0,
    startY + anchor.getBoundingClientRect().top - headerOffset - gap,
  );
  const distance = destY - startY;

  if (prefersReducedMotion || Math.abs(distance) < 2) {
    shell.scrollTo(0, destY);
    return;
  }

  // Snappy, responsive feel: shorter duration + ease-out (fast start,
  // gentle finish) instead of a long slow-in/slow-out curve.
  const duration = Math.min(600, Math.max(300, Math.abs(distance) * 0.35));
  const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

  let startTime: number | null = null;
  const step = (now: number) => {
    if (startTime === null) startTime = now;
    const progress = Math.min(1, (now - startTime) / duration);
    shell.scrollTo(0, startY + distance * easeOutCubic(progress));
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};

/* ----------------------------------------------------------
   Header state
   ---------------------------------------------------------- */
const header = document.querySelector<HTMLElement>("[data-header]");

/* While a click-initiated smooth scroll is in flight we freeze the scroll-spy
   so sections we pass on the way don't flash their active underline. */
let spyLock = false;
let spyReleaseTimer: number | undefined;
let spyFallbackTimer: number | undefined;

const lockSpy = () => {
  spyLock = true;
  window.clearTimeout(spyFallbackTimer);
  // Hard safety net in case the scroll never produces events (already there).
  spyFallbackTimer = window.setTimeout(() => {
    spyLock = false;
  }, 1200);
};

const onScroll = () => {
  header?.classList.toggle("is-scrolled", shell.scrollTop > 24);
  // Release the lock shortly after the smooth scroll settles (no scroll events).
  if (spyLock) {
    window.clearTimeout(spyReleaseTimer);
    spyReleaseTimer = window.setTimeout(() => {
      spyLock = false;
      window.clearTimeout(spyFallbackTimer);
    }, 150);
  }
};

shell.addEventListener("scroll", onScroll, { passive: true });
onScroll();

/* ----------------------------------------------------------
   Mobile menu
   ---------------------------------------------------------- */
const menuToggle = document.querySelector<HTMLButtonElement>(".menu-toggle");
const mobileMenu = document.querySelector<HTMLElement>(".mobile-menu");

const closeMenu = () => {
  menuToggle?.setAttribute("aria-expanded", "false");
  menuToggle?.setAttribute("aria-label", "Отвори мени");
  mobileMenu?.classList.remove("is-open");
  mobileMenu?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("menu-open");
};

const openMenu = () => {
  menuToggle?.setAttribute("aria-expanded", "true");
  menuToggle?.setAttribute("aria-label", "Затвори мени");
  mobileMenu?.classList.add("is-open");
  mobileMenu?.setAttribute("aria-hidden", "false");
  document.body.classList.add("menu-open");
};

menuToggle?.addEventListener("click", () => {
  const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
  if (isOpen) closeMenu();
  else openMenu();
});


document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeMenu();
});

/* ----------------------------------------------------------
   Smooth in-page anchor navigation
   ---------------------------------------------------------- */
document.querySelectorAll<HTMLAnchorElement>('a[href*="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const href = link.getAttribute("href");
    if (!href) return;
    // Support both "#section" and root-relative "/#section" links.
    const hashIndex = href.indexOf("#");
    if (hashIndex === -1) return;
    const hash = href.slice(hashIndex);
    if (hash === "#") return;
    const target = document.querySelector(hash);
    // Section not on this page (e.g. a legal page) — let the browser navigate.
    if (!target) return;
    event.preventDefault();
    closeMenu();
    lockSpy();
    setActiveSection(hash.slice(1));
    scrollToTarget(target);
  });
});

/* ----------------------------------------------------------
   Scroll-spy — highlight the nav link for the section in view
   ---------------------------------------------------------- */
const spyTargets = new Map<string, HTMLElement[]>();
document
  .querySelectorAll<HTMLAnchorElement>(
    '.nav-link[href*="#"], .mobile-menu nav a[href*="#"]',
  )
  .forEach((link) => {
    const href = link.getAttribute("href");
    const id = href?.slice(href.indexOf("#") + 1);
    if (!id) return;
    if (!spyTargets.has(id)) spyTargets.set(id, []);
    spyTargets.get(id)?.push(link);
  });

const setActiveSection = (id: string) => {
  spyTargets.forEach((links, key) => {
    links.forEach((link) => link.classList.toggle("is-active", key === id));
  });
};

const spySections = [...spyTargets.keys()]
  .map((id) => document.getElementById(id))
  .filter((el): el is HTMLElement => Boolean(el));

if (spySections.length && "IntersectionObserver" in window) {
  const spyObserver = new IntersectionObserver(
    (entries) => {
      if (spyLock) return;
      entries
        .filter((entry) => entry.isIntersecting)
        .forEach((entry) => setActiveSection(entry.target.id));
    },
    { root: shell, rootMargin: "-45% 0px -50% 0px", threshold: 0 },
  );
  spySections.forEach((section) => spyObserver.observe(section));
}

/* ----------------------------------------------------------
   Protected logo (no right-click / drag)
   ---------------------------------------------------------- */
const protectedLogo = document.querySelector("[data-protected-logo]");
if (protectedLogo) {
  ["contextmenu", "dragstart"].forEach((eventName) =>
    protectedLogo.addEventListener(eventName, (event) => event.preventDefault()),
  );
}

/* ----------------------------------------------------------
   Parallax orbs
   ---------------------------------------------------------- */
const parallaxLayers = document.querySelectorAll<HTMLElement>("[data-parallax]");

// Desktop only. Parallax is a subtle mouse/pointer depth effect; on phones it
// just adds constant main-thread work and makes scrolling feel laggy.
const parallaxEnabled =
  !prefersReducedMotion &&
  parallaxLayers.length > 0 &&
  window.matchMedia("(min-width: 1024px) and (hover: hover) and (pointer: fine)")
    .matches;

if (parallaxEnabled) {
  const visibleLayers = new Set<HTMLElement>();
  const parallaxObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) visibleLayers.add(entry.target as HTMLElement);
        else visibleLayers.delete(entry.target as HTMLElement);
      });
    },
    { root: shell, rootMargin: "20% 0px 20% 0px" },
  );

  parallaxLayers.forEach((layer) => parallaxObserver.observe(layer));

  // Recompute only on scroll/resize (rAF-throttled) instead of an endless
  // requestAnimationFrame loop that burns cycles even when nothing moves.
  let parallaxQueued = false;
  const updateParallax = () => {
    parallaxQueued = false;
    visibleLayers.forEach((layer) => {
      const speed = Number(layer.dataset.parallax || 0);
      const parent = layer.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const offset =
        (window.innerHeight / 2 - (rect.top + rect.height / 2)) * speed;
      layer.style.transform = `translate3d(0, ${offset}px, 0)`;
    });
  };
  const queueParallax = () => {
    if (parallaxQueued) return;
    parallaxQueued = true;
    requestAnimationFrame(updateParallax);
  };
  shell.addEventListener("scroll", queueParallax, { passive: true });
  window.addEventListener("resize", queueParallax, { passive: true });
  updateParallax();
}

/* ----------------------------------------------------------
   Hero entrance
   ---------------------------------------------------------- */
if (!prefersReducedMotion) {
  const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
  tl.from(".logo", { y: -18, opacity: 0, duration: 0.55 })
    .from(
      ".hero-title-line",
      { yPercent: 120, duration: 1, ease: "power4.out" },
      "-=0.2",
    )
    .from(
      "[data-hero-item]",
      { y: 26, opacity: 0, duration: 0.7, stagger: 0.1 },
      "-=0.6",
    );

  /* Scroll-triggered section reveals */
  gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
    gsap.from(el, {
      opacity: 0,
      y: 42,
      duration: 0.9,
      ease: "power3.out",
      scrollTrigger: { trigger: el, start: "top 85%", once: true },
    });
  });

  gsap.utils.toArray<HTMLElement>("[data-about-copy]").forEach((el, index) => {
    gsap.from(el, {
      opacity: 0,
      x: -38,
      duration: 0.85,
      delay: index * 0.08,
      ease: "power3.out",
      scrollTrigger: { trigger: el, start: "top 88%", once: true },
    });
  });

  const timelineEl = document.querySelector(".timeline");
  const timelineProgress =
    document.querySelector<HTMLElement>(".timeline-progress");
  if (timelineEl && timelineProgress) {
    gsap.fromTo(
      timelineProgress,
      { scaleY: 0 },
      {
        scaleY: 1,
        ease: "none",
        scrollTrigger: {
          trigger: timelineEl,
          start: "top 62%",
          end: "bottom 78%",
          scrub: 0.6,
        },
      },
    );
  }

  // The cards live in a precisely-aligned two-column grid on desktop, so we
  // must NEVER move them with a transform to reveal them — a not-yet-triggered
  // card would sit visibly shifted out of its column. A pure opacity fade can
  // never misposition anything, so the layout is 100% stable every load. The
  // dot is absolutely positioned, so scaling it in is safe (no layout impact).
  gsap.utils.toArray<HTMLElement>("[data-timeline]").forEach((item) => {
    const card = item.querySelector(".timeline-card");
    const dot = item.querySelector(".timeline-dot");
    const tl = gsap.timeline({
      scrollTrigger: { trigger: item, start: "top 84%", once: true },
    });
    if (dot) {
      tl.from(dot, {
        scale: 0.5,
        opacity: 0,
        duration: 0.5,
        ease: "power2.out",
      });
      tl.add(() => dot.classList.add("is-reached"), 0.28);
    }
    if (card) {
      tl.from(card, { opacity: 0, duration: 0.85, ease: "power2.out" }, 0.12);
    }
  });

  const credentialItems = gsap.utils.toArray<HTMLElement>(
    ".credentials-list li",
  );
  if (credentialItems.length) {
    gsap.from(credentialItems, {
      opacity: 0,
      y: 22,
      duration: 0.6,
      ease: "power3.out",
      stagger: 0.13,
      scrollTrigger: {
        trigger: ".credentials-list",
        start: "top 85%",
        once: true,
      },
    });
  }

  /* ----------------------------------------------------------
     Reveal safeguards — content must NEVER stay hidden.
     `gsap.from(..., {opacity:0})` sets opacity 0 immediately and only
     animates it back when the ScrollTrigger fires. If triggers mis-measure
     (fonts/images not loaded yet) or the tab is backgrounded during load,
     an in-view element can get stuck invisible until a refresh. We
     recalculate on exactly those events, and force-reveal anything that is
     on screen yet still hidden as a last-resort guarantee.
     ---------------------------------------------------------- */
  // NOTE: the hero intro elements ([data-hero-item], .hero-title-line, .logo)
  // are deliberately excluded — they animate via the autoplay hero timeline
  // and are guaranteed by its `tl.progress(1)` failsafe below. Including them
  // here would let the scroll net snap them mid-entrance and break the intro.
  const revealSelector =
    "[data-reveal],.timeline-card,.credentials-list li,[data-about-copy]";

  const forceRevealOnScreen = () => {
    gsap.utils.toArray<HTMLElement>(revealSelector).forEach((el) => {
      const rect = el.getBoundingClientRect();
      const onScreen = rect.top < window.innerHeight && rect.bottom > 0;
      if (onScreen && Number(getComputedStyle(el).opacity) < 0.05) {
        gsap.set(el, { opacity: 1, x: 0, y: 0, clearProps: "transform" });
      }
    });
  };

  const recalcAndGuard = () => {
    ScrollTrigger.refresh();
    forceRevealOnScreen();
  };

  // Images/fonts finishing after first paint is the main cause of bad
  // trigger positions — re-measure once everything has loaded.
  window.addEventListener("load", recalcAndGuard);
  document.fonts?.ready.then(recalcAndGuard);
  // Back/forward cache restores (Safari) and returning to a backgrounded tab.
  window.addEventListener("pageshow", (event) => {
    if ((event as PageTransitionEvent).persisted) recalcAndGuard();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) recalcAndGuard();
  });
  // Final hard net well after any entrance animation (~0.9s) would finish:
  // if the hero intro never advanced (e.g. loaded in a background tab), snap
  // it to its end state so the hero can never be left blank, then reveal any
  // other on-screen element still stuck hidden.
  window.setTimeout(() => {
    if (tl.progress() === 0) tl.progress(1);
    forceRevealOnScreen();
  }, 1500);

  // Scroll-aware net: reveals trigger at "top 78-88%" and animate over ~0.9s,
  // so by the time an element is well into view (top above 75% of the
  // viewport) it must be visible. If one is still hidden there, its trigger
  // never fired — reveal it. This can't preempt normal entrance animations
  // (already playing by that point) but guarantees nothing stays invisible,
  // even on fast programmatic jumps.
  const scrollSafetyNet = () => {
    gsap.utils.toArray<HTMLElement>(revealSelector).forEach((el) => {
      const r = el.getBoundingClientRect();
      // 0.75 is past every reveal trigger's start (they fire by "top 78-88%"),
      // so a still-hidden element here has a genuinely failed trigger.
      const wellInView =
        r.width > 0 && r.bottom > 0 && r.top < window.innerHeight * 0.75;
      if (wellInView && Number(getComputedStyle(el).opacity) < 0.05) {
        gsap.set(el, { opacity: 1, x: 0, y: 0, clearProps: "transform" });
      }
    });
  };
  // Run once shortly AFTER scrolling settles (not during) — the getComputedStyle
  // reads here force a style recalc, so doing them every scroll frame made
  // scrolling lag badly on mobile. Debounced, it's imperceptible and still
  // catches any element whose reveal trigger failed to fire.
  let safetyTimer: number | undefined;
  shell.addEventListener(
    "scroll",
    () => {
      window.clearTimeout(safetyTimer);
      safetyTimer = window.setTimeout(scrollSafetyNet, 180);
    },
    { passive: true },
  );
}
