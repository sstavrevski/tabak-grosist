import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

gsap.registerPlugin(ScrollTrigger);

const scrollToTarget = (target: Element) => {
  target.scrollIntoView({ behavior: "smooth" });
};

/* ----------------------------------------------------------
   Header state + scroll progress
   ---------------------------------------------------------- */
const header = document.querySelector<HTMLElement>("[data-header]");
const progress = document.querySelector<HTMLElement>(".scroll-progress");

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
  header?.classList.toggle("is-scrolled", window.scrollY > 24);
  if (progress) {
    const maxScroll =
      document.documentElement.scrollHeight - window.innerHeight;
    const percent = maxScroll > 0 ? (window.scrollY / maxScroll) * 100 : 0;
    progress.style.width = `${Math.min(percent, 100)}%`;
  }
  // Release the lock shortly after the smooth scroll settles (no scroll events).
  if (spyLock) {
    window.clearTimeout(spyReleaseTimer);
    spyReleaseTimer = window.setTimeout(() => {
      spyLock = false;
      window.clearTimeout(spyFallbackTimer);
    }, 150);
  }
};

window.addEventListener("scroll", onScroll, { passive: true });
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
document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const id = link.getAttribute("href");
    if (!id || id === "#") return;
    event.preventDefault();
    closeMenu();
    const target = document.querySelector(id);
    if (target) {
      lockSpy();
      setActiveSection(id.slice(1));
      scrollToTarget(target);
    }
  });
});

/* ----------------------------------------------------------
   Scroll-spy — highlight the nav link for the section in view
   ---------------------------------------------------------- */
const spyTargets = new Map<string, HTMLElement[]>();
document
  .querySelectorAll<HTMLAnchorElement>(
    '.nav-link[href^="#"], .mobile-menu nav a[href^="#"]',
  )
  .forEach((link) => {
    const id = link.getAttribute("href")?.slice(1);
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
    { rootMargin: "-45% 0px -50% 0px", threshold: 0 },
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

if (!prefersReducedMotion && parallaxLayers.length) {
  const visibleLayers = new Set<HTMLElement>();
  const parallaxObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) visibleLayers.add(entry.target as HTMLElement);
        else visibleLayers.delete(entry.target as HTMLElement);
      });
    },
    { rootMargin: "20% 0px 20% 0px" },
  );

  parallaxLayers.forEach((layer) => parallaxObserver.observe(layer));

  const updateParallax = () => {
    visibleLayers.forEach((layer) => {
      const speed = Number(layer.dataset.parallax || 0);
      const parent = layer.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const offset =
        (window.innerHeight / 2 - (rect.top + rect.height / 2)) * speed;
      layer.style.transform = `translate3d(0, ${offset}px, 0)`;
    });
    requestAnimationFrame(updateParallax);
  };
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

  gsap.utils.toArray<HTMLElement>("[data-timeline]").forEach((item) => {
    const card = item.querySelector(".timeline-card");
    const dot = item.querySelector(".timeline-dot");
    const tl = gsap.timeline({
      scrollTrigger: { trigger: item, start: "top 78%", once: true },
    });
    if (dot) {
      tl.from(dot, {
        scale: 0,
        opacity: 0,
        duration: 0.45,
        ease: "back.out(2.2)",
      });
      tl.add(() => dot.classList.add("is-reached"), 0.12);
    }
    if (card) {
      tl.from(
        card,
        { opacity: 0, y: 30, duration: 0.7, ease: "power3.out" },
        0.08,
      );
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
}
