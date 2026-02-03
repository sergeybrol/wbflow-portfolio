<script>
/* =========================================================
   GLOBAL HELPERS (Device, Safe selectors, RAF throttle)
========================================================= */

const App = {
  state: {
    isTouch: ("ontouchstart" in window) || (navigator.maxTouchPoints > 0),
    breakpoints: {
      mobileMax: 767,
      tabletMax: 1024,
      desktopMin: 1025,
    }
  },

  getDevice() {
    const w = window.innerWidth;
    const isMobile = w <= this.state.breakpoints.mobileMax;
    const isTablet = w > this.state.breakpoints.mobileMax && w <= this.state.breakpoints.tabletMax;
    const isDesktop = w >= this.state.breakpoints.desktopMin;
    
    return { w, isMobile, isTablet, isDesktop };
  },

  rafThrottle(fn) {
    let rafId = null;
    return (...args) => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        fn(...args);
      });
    };
  }
};

// ✅ make it globally accessible for guards like `window.App`
window.App = App;

/* =========================================================
   INIT (Single entry point)
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  // GSAP plugins
  if (window.gsap && window.ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
  }

  initPageTransition();      // jQuery-based (safe fallback)
  initLenis();               // Lenis + ScrollTrigger sync (GSAP ticker)
  initAnchorScroll();        // Anchor scrolling with responsive offsets
  initCustomScrollbar();     // Custom scrollbar thumb
  initCustomCursor();        // Cursor follow + hover label
  initCaseHoverVideo();      // Video play/pause on case hover
  initFooterCtaAnimation();  // SplitType footer animation
  initCountUp(); 			 // Count up 
  initFeaturedWorks();       // Featured works section logic
  initRevealElementsEngine() // All elements except text reveal
  initTextRevealEngine();    // [text-split] engine
  initGroupEngine();         // group item appear

  // ✅ One refresh point (after all inits)
  window.addEventListener("load", () => {
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  });
});


/* =========================================================
   PAGE TRANSITION (jQuery + safe fallback)
========================================================= */

function initPageTransition() {
  // If jQuery isn't present — do nothing (prevents hard errors)
  if (!window.jQuery) return;

  const $ = window.jQuery;
  const transitionTrigger = $(".transition-trigger");
  const introDurationMS = 1800;
  const exitDelayBeforeRedirect = 400;
  const excludedClass = "no-transition";
  const pauseBeforeStart = 200;

  function runIntro() {
    if (!transitionTrigger.length) return;

    $("body").addClass("no-scroll-transition");

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => transitionTrigger.trigger("click"), pauseBeforeStart);
      });
    });

    setTimeout(() => $("body").removeClass("no-scroll-transition"), introDurationMS + pauseBeforeStart);
  }

  // Normal load
  Webflow.push(runIntro);

  // BFCache (back/forward)
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;

    try {
      const ix2 = Webflow.require("ix2");
      ix2.destroy();
      ix2.init();
    } catch (e) {}

    Webflow.push(runIntro);
  });

  // Exit handler
  $(document).on("click", "a", function (e) {
    const link = $(this);

    const href = link.attr("href") || "";
    if (!href) return;

    // Ignore anchors, external, new tabs, mailto/tel, excluded
    if (href.startsWith("#")) return;
    if (href.startsWith("mailto:") || href.startsWith("tel:")) return;

    const currentPath = window.location.pathname;
    const linkPath = link.prop("pathname");
    const isSamePageAnchorLink = currentPath === linkPath && href.includes("#");

    const isInternalLink =
      link.prop("hostname") === window.location.host &&
      !link.hasClass(excludedClass) &&
      link.attr("target") !== "_blank" &&
      transitionTrigger.length > 0 &&
      !isSamePageAnchorLink;

    if (!isInternalLink) return;

    e.preventDefault();

    $("body").addClass("no-scroll-transition");
    transitionTrigger.trigger("click");

    setTimeout(() => {
      window.location.href = href;
    }, exitDelayBeforeRedirect);
  });
}


/* =========================================================
   LENIS (Main + Modal) + ScrollTrigger sync via GSAP ticker
========================================================= */

let lenisMain = null;
let lenisModal = null;

function initLenis() {
  if (!window.Lenis) return;

  // Main
  lenisMain = new Lenis({
    wrapper: document.documentElement,
    content: document.body,
    duration: 1.4,
    easing: (t) => {
      const expo = 1 - Math.pow(2, -10 * t);
      return Math.min(1, expo + 0.05 * t);
    },
    smooth: true,
    smoothTouch: false
  });

  // Modal (optional)
  const modalContent = document.querySelector(".contact-content");
  if (modalContent) {
    lenisModal = new Lenis({
      wrapper: modalContent,
      content: modalContent,
      duration: 1.4,
      easing: (t) => {
        const expo = 1 - Math.pow(2, -10 * t);
        return Math.min(1, expo + 0.05 * t);
      },
      smooth: true,
      smoothTouch: false,
      gestureOrientation: "vertical"
    });
  }

  // ✅ Use GSAP ticker instead of manual RAF
  if (window.gsap) {
    gsap.ticker.add((time) => {
      lenisMain.raf(time * 1000);
      if (lenisModal) lenisModal.raf(time * 1000);
    });
    gsap.ticker.lagSmoothing(0);
  } else {
    // Fallback: manual RAF if GSAP isn't present
    const raf = (time) => {
      lenisMain.raf(time);
      if (lenisModal) lenisModal.raf(time);
      requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  }

  // ScrollTrigger sync
  if (window.ScrollTrigger) {
    lenisMain.on("scroll", ScrollTrigger.update);
  }
}


/* =========================================================
   ANCHOR SCROLL (Responsive offset + Lenis scrollTo)
========================================================= */

function initAnchorScroll() {
  const DEFAULT_OFFSET = 80;

  function getResponsiveOffset(targetEl) {
    const mobile = parseInt(targetEl.getAttribute("data-offset-mobile"), 10);
    const tablet = parseInt(targetEl.getAttribute("data-offset-tablet"), 10);
    const desktop = parseInt(targetEl.getAttribute("data-offset"), 10) || DEFAULT_OFFSET;

    const { isMobile, isTablet } = App.getDevice();

    if (isMobile && !isNaN(mobile)) return mobile;
    if (isTablet && !isNaN(tablet)) return tablet;
    return desktop;
  }

  function scrollToHash(hash, pushState = false) {
    if (!hash) return;
    const targetEl = document.querySelector(hash);
    if (!targetEl) return;

    const offset = getResponsiveOffset(targetEl);
    const targetY = targetEl.getBoundingClientRect().top + window.scrollY - offset;

    if (lenisMain) {
      lenisMain.scrollTo(targetY, {
        offset: 0,
        duration: 0.8,
        easing: (t) => 1 - Math.pow(2, -10 * t)
      });
    } else {
      window.scrollTo({ top: targetY, behavior: "smooth" });
    }

    if (pushState) history.pushState(null, "", hash);
  }

  // On load with hash
  window.addEventListener("load", () => {
    if (window.location.hash) {
      setTimeout(() => scrollToHash(window.location.hash, false), 200);
    }
  });

  // Click on anchor links
  document.querySelectorAll("a[href^='#']").forEach((a) => {
    a.addEventListener("click", (e) => {
      const hash = a.getAttribute("href");
      if (!hash || hash === "#") return;

      const targetEl = document.querySelector(hash);
      if (!targetEl) return;

      e.preventDefault();
      scrollToHash(hash, true);
    });
  });
}


/* =========================================================
   CUSTOM SCROLLBAR (Thumb update throttled)
========================================================= */

function initCustomScrollbar() {
  const scrollbar = document.querySelector(".custom-scrollbar");
  if (!scrollbar) return;

  const thumb = scrollbar.querySelector(".thumb");
  if (!thumb) return;

  let scrollTimeout;

  function updateThumb() {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const docHeight = document.documentElement.scrollHeight;
    const winHeight = window.innerHeight;

    const thumbHeight = Math.max((winHeight / docHeight) * winHeight, 30);
    const thumbTop = (scrollTop / (docHeight - winHeight)) * (winHeight - thumbHeight);

    thumb.style.height = thumbHeight + "px";
    thumb.style.top = thumbTop + "px";
  }

  const updateThumbThrottled = App.rafThrottle(updateThumb);

  const onScroll = () => {
    updateThumbThrottled();
    scrollbar.classList.add("visible");

    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => scrollbar.classList.remove("visible"), 400);
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", updateThumbThrottled);
  window.addEventListener("load", updateThumbThrottled);
}


/* =========================================================
   CUSTOM CURSOR (Desktop only, GSAP ticker already used)
========================================================= */

function initCustomCursor() {
  const cursor = document.querySelector(".custom-cursor");
  if (!cursor) return;

  if (App.state.isTouch) {
    cursor.style.display = "none";
    return;
  }

  if (!window.gsap) return;

  const cursorContent = cursor.querySelector(".cursor-content");
  if (!cursorContent) return;

  let mouseX = 0, mouseY = 0;
  let cursorX = 0, cursorY = 0;
  const speed = 0.16;
  let isHovering = false;

  gsap.set(cursor, { xPercent: -50, yPercent: -50, force3D: true });

  gsap.ticker.add(() => {
    cursorX += (mouseX - cursorX) * speed;
    cursorY += (mouseY - cursorY) * speed;
    gsap.set(cursor, { x: cursorX, y: cursorY });
  });

  window.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  }, { passive: true });

  const showCursor = (label = "Explore") => {
    isHovering = true;
    cursorContent.textContent = label;
    cursorContent.style.opacity = 1;

    gsap.killTweensOf(cursor);
    cursor.style.opacity = 1;

    gsap.to(cursor, { scale: 1, duration: 0.48, ease: "power3.out", force3D: true });
  };

  const hideCursor = () => {
    isHovering = false;
    cursorContent.style.opacity = 0;

    gsap.killTweensOf(cursor);
    gsap.to(cursor, {
      scale: 0.001,
      duration: 0.48,
      ease: "power3.out",
      force3D: true,
      onComplete: () => { if (!isHovering) cursor.style.opacity = 0; }
    });
  };

  // (Optional) Delegate instead of binding every item (safer for dynamic content)
  document.addEventListener("mouseenter", (e) => {
    const item = e.target.closest(".featured-work");
    if (!item) return;
    showCursor(item.getAttribute("data-cursor-label") || "Explore");
  }, true);

  document.addEventListener("mouseleave", (e) => {
    const item = e.target.closest(".featured-work");
    if (!item) return;
    hideCursor();
  }, true);
}


/* =========================================================
   CASE VIDEO HOVER (Delegated)
========================================================= */

function initCaseHoverVideo() {
  document.addEventListener("mouseenter", (e) => {
    const item = e.target.closest(".featured-work");
    if (!item) return;

    const video = item.querySelector(".featured-work-video");
    if (!video) return;

    try {
      video.currentTime = 0;
      video.play();
    } catch (err) {}
  }, true);

  document.addEventListener("mouseleave", (e) => {
    const item = e.target.closest(".featured-work");
    if (!item) return;

    const video = item.querySelector(".featured-work-video");
    if (!video) return;

    try { video.pause(); } catch (err) {}
  }, true);
}

/* =========================================================
   FIXED HEADER LOGIC
========================================================= */

(function initFixedHeader() {
  const wrapper = document.querySelector(".header-wrapper");
  if (!wrapper) return;

  let lastScrollY = window.scrollY;
  let isHeaderHidden = false;
  let scrollDownDistance = 0;
  let scrollUpDistance = 0;

  const SCROLLED_THRESHOLD = 32;
  const HIDE_START_OFFSET = 200;
  const SHOW_AFTER_SCROLL_UP = 80;
  const HIDE_AFTER_SCROLL_DOWN = 80;

  window.addEventListener("scroll", () => {
    const scrollY = window.scrollY;

    wrapper.classList.toggle("is-scrolled", scrollY > SCROLLED_THRESHOLD);

    if (scrollY > lastScrollY) {
      scrollUpDistance = 0;
      scrollDownDistance += scrollY - lastScrollY;

      if (scrollDownDistance >= HIDE_AFTER_SCROLL_DOWN && !isHeaderHidden && scrollY > HIDE_START_OFFSET) {
        wrapper.classList.add("is-hide");
        isHeaderHidden = true;
        scrollDownDistance = 0;
      }
    } else if (scrollY < lastScrollY) {
      scrollDownDistance = 0;
      if (isHeaderHidden) {
        scrollUpDistance += lastScrollY - scrollY;
        if (scrollUpDistance >= SHOW_AFTER_SCROLL_UP) {
          wrapper.classList.remove("is-hide");
          isHeaderHidden = false;
          scrollUpDistance = 0;
        }
      }
    }

    lastScrollY = scrollY;
  }, { passive: true });
})();


/* =========================================================
   MOBILE MENU LOGIC
========================================================= */

function initMobileMenu() {
  const burgerBtn = document.querySelector(".mobile-menu-button");
  const navLinks = document.querySelectorAll(".nav-link");
  const lottieIcon = document.querySelector(".menu-icon");
  const menuWrapper = document.querySelector(".menu-wrapper");
  const backdrop = document.querySelector(".menu-backdrop");
  const body = document.body;

  if (!burgerBtn || !menuWrapper) return;

  let isMenuOpen = false;
  const animationDuration = 400;

  const isMobile = () => window.innerWidth <= 991;

  const playForward = () => {
    isMenuOpen = true;
    body.classList.add("is-menu-open");

    if (isMobile()) {
      menuWrapper.classList.add("with-events");
      menuWrapper.classList.remove("no-events");
      if (backdrop) {
        backdrop.classList.add("with-events");
        backdrop.classList.remove("no-events");
      }
    }

    if (isMobile() && lottieIcon) {
      lottieIcon.setDirection(1);
      setTimeout(() => lottieIcon.play(), 0);
    }
  };

  const playBackward = () => {
    isMenuOpen = false;
    body.classList.remove("is-menu-open");

    if (isMobile()) {
      menuWrapper.classList.remove("with-events");
      if (backdrop) backdrop.classList.remove("with-events");

      setTimeout(() => {
        menuWrapper.classList.add("no-events");
        if (backdrop) backdrop.classList.add("no-events");
      }, animationDuration);
    }

    if (isMobile() && lottieIcon) {
      lottieIcon.setDirection(-1);
      setTimeout(() => lottieIcon.play(), 0);
    }
  };

  const toggleMenu = () => (isMenuOpen ? playBackward() : playForward());

  burgerBtn.addEventListener("click", () => { if (isMobile()) toggleMenu(); });

  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      if (isMobile() && isMenuOpen) toggleMenu();
    });
  });

  if (backdrop) {
    backdrop.addEventListener("click", () => {
      if (isMobile() && isMenuOpen) toggleMenu();
    });
  }
}
  
// call it (kept separate for clarity)
document.addEventListener("DOMContentLoaded", initMobileMenu);
  
/* =========================================================
   FEATURED WORKS CHANGING THEME
========================================================= */

function initFeaturedWorks() {
  if (window.__featuredWorksInitialized) return;
  window.__featuredWorksInitialized = true;

  if (!window.gsap || !window.ScrollTrigger) return;

  const section = document.querySelector(".section-featured-works");
  if (!section) return;

  document.addEventListener("colorThemesReady", () => {
    // ✅ Single source of truth
    const { isMobile, isTablet, isDesktop } = App.getDevice();

    // Theme ScrollTrigger
    let startValue, endValue;
    if (isMobile) { startValue = "top 50%"; endValue = "bottom 70%"; }
    else if (isTablet) { startValue = "top 22%"; endValue = "bottom 65%"; }
    else { startValue = "top 38%"; endValue = "bottom 50%"; }

    ScrollTrigger.create({
      trigger: section,
      start: startValue,
      end: endValue,
      onEnter: () => gsap.to("body", { ...colorThemes.getTheme("dark"), duration: 0.3, ease: "power2.out", overwrite: "auto" }),
      onLeave: () => gsap.to("body", { ...colorThemes.getTheme("light"), duration: 0.3, ease: "power2.out", overwrite: "auto" }),
      onEnterBack: () => gsap.to("body", { ...colorThemes.getTheme("dark"), duration: 0.3, ease: "power2.out", overwrite: "auto" }),
      onLeaveBack: () => gsap.to("body", { ...colorThemes.getTheme("light"), duration: 0.3, ease: "power2.out", overwrite: "auto" })
    });

    // Heading (desktop)
    if (isDesktop) {
      gsap.fromTo(".featured-works-heading",
        { yPercent: 180 },
        {
          yPercent: -82.5,
          ease: "power3.out",
          duration: 0.8,
          scrollTrigger: { trigger: section, start: "top 52.5%", toggleActions: "play none none reverse" }
        }
      );
    }

    // Works wrapper (desktop)
    if (isDesktop) {
      gsap.fromTo(".works-wrapper",
        { yPercent: 0 },
        {
          yPercent: -50,
          ease: "power3.inOut",
          duration: 0.8,
          scrollTrigger: { trigger: section, start: "top 50%", toggleActions: "play none none reverse" }
        }
      );
    }

    // Cards appear
    const itemsPerRow = 2;

    document.querySelectorAll(".featured-work").forEach((el, i) => {
      const isFirstRow = i === 0 || i === 1;
      let startTrigger, yValue;

      if (isMobile) { startTrigger = "top 98%"; yValue = 16; }
      else if (isTablet) { startTrigger = "top 96%"; yValue = 20; }
      else { startTrigger = isFirstRow ? "top 58%" : "top 94%"; yValue = 24; }

      const delay = (i % itemsPerRow) * 0.15;

      gsap.fromTo(
        el,
        { y: yValue, autoAlpha: 0, willChange: "transform, opacity" },
        {
          y: 0,
          autoAlpha: 1,
          delay,
          duration: 1,
          ease: "power2.out",
          clearProps: "willChange",
          scrollTrigger: { trigger: el, start: startTrigger, toggleActions: "play none none reverse" }
        }
      );
    });
  });
}


/* =========================================================
   FOOTER CTA
========================================================= */

function initFooterCtaAnimation() {
    if (!window.gsap || !window.ScrollTrigger || !window.SplitType) return;
  
    const footerCta = document.querySelector(".footer-cta");
    const footerButton = document.querySelector(".footer-button-wrapper");
    if (!footerCta || !footerButton) return;
  
    new SplitType(footerCta, { types: "words, chars", tagName: "span" });
  
    const chars = footerCta.querySelectorAll(".char");
  
    gsap.set(chars, {
      opacity: 0,
      y: 120,
      rotateX: 40,
      transformPerspective: 1000,
      display: "inline-block"
    });
  
    gsap.set(footerButton, { opacity: 0, y: 120 });
  
    const viewportHeight = window.innerHeight;
    const scrollStart = viewportHeight > 1200 ? "bottom 35%" : "bottom 22%";
  
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: ".main-wrapper",
        start: scrollStart,
        once: true
      }
    });
  
    tl.to(chars, {
      opacity: 1,
      y: 0,
      rotateX: 0,
      duration: 0.6,
      ease: "power2.out",
      stagger: { each: 0.02 }
    });
  
    tl.to(
      footerButton,
      {
        opacity: 1,
        y: 0,
        duration: 0.4,
        ease: "power2.out"
      },
      "-=0.5"
    );
  }
  
  
/* =========================================================
   COUNT UP (attribute-driven)
   Wrapper:        [data-count]
   Number element: [data-count-number]
   Suffix element: [data-count-suffix] (optional)

   REQUIRED:
   - data-count                     (wrapper)
   - data-count-number              (number element)

   OPTIONAL — SCROLL TRIGGER:
   - data-count-start="top 90%" OR "90%"          (desktop trigger)
   - data-count-start-tablet="92%"                (<=1024 trigger)
   - data-count-start-mobile="94%"                (<=767 trigger)
   - data-count-once="true|false"                 (default: true)

   OPTIONAL — ANIMATION:
   - data-count-duration="1.2"                    (seconds, default: 1.2)
   - data-count-ease="power1.out"                 (⚠️ reserved for future use)

   OPTIONAL — NUMBER LOGIC:
   - data-count-target="230"                      (target number)
   - data-count-from="0"                          (start value)
   - data-count-pad="0"                           (leading zeros)
   - data-count-decimals="0"                      (decimal places)

   OPTIONAL — SUFFIX:
   - data-count-suffix-delay="0.9"                (seconds; default: duration - 0.3)
   - data-count-suffix-y="30"                     (px; default: 30)

   NOTES:
   - Attributes can be set on wrapper OR number element
     (number element has priority if both exist).
   - All breakpoints are resolved via global App.getDevice().
   - Trigger logic matches other attribute-driven engines.
========================================================= */


function initCountUp() {
  if (!window.gsap || !window.ScrollTrigger || !window.App) return;

  // --- Global defaults (single source of truth)
  const DEFAULTS = {
    // ✅ Responsive starts
    startDesktop: "top 90%",
    startTablet:  "top 92%",
    startMobile:  "top 94%",

    duration: 1.2,
    once: true,
    from: 0,
    pad: 0,
    decimals: 0,
    suffixDelayFromEnd: 0.3, // suffix shows duration - 0.3
    suffixYOffset: 30
  };

  // --- Helpers (English comments as you requested)
  const toNumber = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const toInt = (v, fallback) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
  };

  const normalizeStart = (raw, fallback) => {
    // Accept:
    // - "top 90%" (default GSAP)
    // - "90%"     (shorthand -> "top 90%")
    // - "center 80%" etc.
    if (!raw) return fallback;
    return raw.includes(" ") ? raw : `top ${raw}`;
  };

  const getAttr = (el, name) => el ? el.getAttribute(name) : null;

  // ✅ Responsive start (uses global App.getDevice)
  const getResponsiveStart = (wrapper) => {
    const { isMobile, isTablet } = App.getDevice();

    const mobileRaw  = getAttr(wrapper, "data-count-start-mobile");
    const tabletRaw  = getAttr(wrapper, "data-count-start-tablet");
    const desktopRaw = getAttr(wrapper, "data-count-start");

    if (isMobile && mobileRaw) return normalizeStart(mobileRaw, DEFAULTS.startMobile);
    if (isTablet && tabletRaw) return normalizeStart(tabletRaw, DEFAULTS.startTablet);
    if (desktopRaw) return normalizeStart(desktopRaw, DEFAULTS.startDesktop);

    if (isMobile) return DEFAULTS.startMobile;
    if (isTablet) return DEFAULTS.startTablet;
    return DEFAULTS.startDesktop;
  };

  document.querySelectorAll("[data-count]").forEach((wrapper) => {
    // Prevent double init
    if (wrapper.dataset.countInited === "true") return;
    wrapper.dataset.countInited = "true";

    const numberEl = wrapper.querySelector("[data-count-number]");
    if (!numberEl) return;

    const suffixEl = wrapper.querySelector("[data-count-suffix]");

    // --- START / ONCE / DURATION (wrapper-only)
    const start = getResponsiveStart(wrapper);

    const onceAttr = getAttr(wrapper, "data-count-once");
    const once = onceAttr === null ? DEFAULTS.once : onceAttr !== "false";

    const duration = (() => {
      const d = toNumber(getAttr(wrapper, "data-count-duration"), DEFAULTS.duration);
      // Avoid 0 or negative duration (would look like "no animation")
      return d > 0 ? d : DEFAULTS.duration;
    })();

    // --- TARGET: number OR wrapper OR fallback to DOM text
    const targetAttr =
      getAttr(numberEl, "data-count-target") ??
      getAttr(wrapper, "data-count-target");

    const target = (() => {
      if (targetAttr !== null) return toNumber(targetAttr, NaN);

      // Fallback: try to read current text
      const text = (numberEl.textContent || "").trim();
      const cleaned = text.replace(/[^\d.\-]/g, "");
      return toNumber(cleaned, NaN);
    })();

    // --- FROM: number OR wrapper OR default 0
    const fromAttr =
      getAttr(numberEl, "data-count-from") ??
      getAttr(wrapper, "data-count-from");

    const from = fromAttr !== null ? toNumber(fromAttr, DEFAULTS.from) : DEFAULTS.from;

    // --- PAD: number OR wrapper OR default 0
    const padAttr =
      getAttr(numberEl, "data-count-pad") ??
      getAttr(wrapper, "data-count-pad");

    const pad = padAttr !== null ? toInt(padAttr, DEFAULTS.pad) : DEFAULTS.pad;

    // --- DECIMALS: number OR wrapper OR default 0
    const decimalsAttr =
      getAttr(numberEl, "data-count-decimals") ??
      getAttr(wrapper, "data-count-decimals");

    const decimals = decimalsAttr !== null ? toInt(decimalsAttr, DEFAULTS.decimals) : DEFAULTS.decimals;

    // If target is invalid, render safe and stop
    if (!Number.isFinite(target) || !Number.isFinite(from)) {
      numberEl.textContent = String(Number.isFinite(target) ? target : DEFAULTS.from);
      return;
    }

    // --- SUFFIX DELAY (wrapper-only)
    const suffixDelayAttr = getAttr(wrapper, "data-count-suffix-delay");
    const suffixDelay = suffixDelayAttr !== null
      ? toNumber(suffixDelayAttr, Math.max(0, duration - DEFAULTS.suffixDelayFromEnd))
      : Math.max(0, duration - DEFAULTS.suffixDelayFromEnd);

    const formatNumber = (v) => {
      if (!Number.isFinite(v)) v = 0;

      if (decimals > 0) {
        return v.toFixed(decimals);
      }

      const s = String(Math.floor(v));
      return pad > 0 ? s.padStart(pad, "0") : s;
    };

    // Initial render
    numberEl.textContent = formatNumber(from);

    if (suffixEl) {
      gsap.set(suffixEl, {
        opacity: 0,
        y: DEFAULTS.suffixYOffset,
        force3D: true
      });
    }

    // Animate a plain object (stable)
    const counter = { value: from };

    const tween = gsap.to(counter, {
      value: target,
      duration,
      ease: "power1.out",
      paused: true,
      onUpdate: () => {
        numberEl.textContent = formatNumber(counter.value);
      },
      onComplete: () => {
        numberEl.textContent = formatNumber(target);
      }
    });

    ScrollTrigger.create({
      trigger: wrapper,
      start,
      once,
      onEnter: () => {
        // Start on next frame to avoid jumps on refresh
        requestAnimationFrame(() => tween.restart(true));

        if (suffixEl) {
          gsap.to(suffixEl, {
            delay: suffixDelay,
            y: 0,
            opacity: 1,
            duration: 0.3,
            ease: "power1.out"
          });
        }
      }
    });
  });
}


  
/* =========================================================
   TEXT REVEAL ENGINE (MASK + yPercent + responsive start + dir)
   Required:
   - data-text-reveal="lines|words|chars"

   Optional:
   - data-text-reveal-mask="true|false"              (default: true)
   - data-text-reveal-dir="up|down"                  (default: up)
   - data-text-reveal-y="120" OR "120%"              (ONLY percent; default: 120)

   Opacity:
   - data-text-reveal-opacity="0|0.5|1"              (if set -> uses that as start opacity)
   - if NOT set -> uses DEFAULTS.opacityFrom

   ScrollTrigger start (responsive):
   - data-text-reveal-start="top 90%" OR "90%"       (desktop override)
   - data-text-reveal-start-tablet="92%"             (<=1024 override)
   - data-text-reveal-start-mobile="94%"             (<=767 override)

   Other:
   - data-text-reveal-once="true|false"              (default: true)
   - data-text-reveal-delay="0.0"                    (seconds, default: 0)
   - data-text-reveal-duration="0.7"                 (default depends on type)
   - data-text-reveal-stagger="0.08"                 (default depends on type)

   Mask clipping fix:
   - wraps get: data-text-reveal-mask-wrap="true"
   - maskPadEm applied inline (no CSS required)

   - data-text-reveal-device="tablet-down|mobile-only|tablet-only|desktop-only|all"
========================================================= */

function initTextRevealEngine() {
  if (!window.gsap || !window.ScrollTrigger || !window.SplitType) return;
  if (!window.App || typeof App.getDevice !== "function") return;

  gsap.registerPlugin(ScrollTrigger);

  const DEFAULTS = {
    // Responsive starts
    startDesktop: "top 92%",
    startTablet:  "top 94%",
    startMobile:  "top 96%",

    once: true,
    delay: 0,

    // Motion
    yPercent: 120,          // ONLY percent
    ease: "power1.out",

    duration: { lines: 0.6, words: 0.6, chars: 0.6 },
    stagger:  { lines: 0.1, words: 0.05, chars: 0.01 },

    // Mask
    mask: true,
    maskPadEm: 0.18,        // tweak 0.12–0.25 if needed

    // Opacity (global default start point)
    opacityFrom: 1
  };

  const els = document.querySelectorAll("[data-text-reveal]");
  if (!els.length) return;

  const toNum = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const normalizeStart = (raw, fallback) => {
    const v = (raw || "").trim();
    if (!v) return fallback;
    return v.includes(" ") ? v : `top ${v}`;
  };

  // ONLY percent input: "120" or "120%"
  const parsePercent = (raw, fallback) => {
    if (raw == null) return fallback;
    const s = String(raw).trim().replace("%", "");
    return toNum(s, fallback);
  };

  const attrBool = (el, name, fallback) => {
    const v = el.getAttribute(name);
    if (v === null) return fallback;
    return v !== "false";
  };

  const getResponsiveStart = (el) => {
    const { isMobile, isTablet } = App.getDevice();

    const mobileRaw  = el.getAttribute("data-text-reveal-start-mobile");
    const tabletRaw  = el.getAttribute("data-text-reveal-start-tablet");
    const desktopRaw = el.getAttribute("data-text-reveal-start");

    if (isMobile && mobileRaw) return normalizeStart(mobileRaw, DEFAULTS.startMobile);
    if (isTablet && tabletRaw) return normalizeStart(tabletRaw, DEFAULTS.startTablet);
    if (desktopRaw) return normalizeStart(desktopRaw, DEFAULTS.startDesktop);

    if (isMobile) return DEFAULTS.startMobile;
    if (isTablet) return DEFAULTS.startTablet;
    return DEFAULTS.startDesktop;
  };

  // ✅ Device filter
  const shouldRunOnDevice = (el) => {
    const mode = (el.getAttribute("data-text-reveal-device") || "all").trim().toLowerCase();
    const { isMobile, isTablet, isDesktop } = App.getDevice();

    switch (mode) {
      case "all":
        return true;

      case "tablet-down":
      case "tablet-and-down":
      case "mobile-and-tablet":
        return isMobile || isTablet;

      case "mobile-only":
        return isMobile;

      case "tablet-only":
        return isTablet;

      case "desktop-only":
        return isDesktop;

      default:
        // якщо помилка/невалідне значення — краще не ламати і працювати всюди
        return true;
    }
  };

  // Wrap each split piece into a mask wrapper (once)
  const applyMaskWrap = (targets) => {
    targets.forEach((t) => {
      const parent = t.parentElement;
      if (parent && parent.hasAttribute("data-text-reveal-mask-wrap")) return;

      const wrap = document.createElement("span");
      wrap.setAttribute("data-text-reveal-mask-wrap", "true");

      wrap.style.display = "inline-block";
      wrap.style.overflow = "hidden";
      wrap.style.verticalAlign = "bottom";
      wrap.style.lineHeight = "inherit";

      // Clipping fix for tight line-height
      const pad = DEFAULTS.maskPadEm;
      wrap.style.paddingBottom = `${pad}em`;
      wrap.style.marginBottom  = `-${pad}em`;

      // For lines we want full width
      if (t.classList.contains("line")) {
        wrap.style.display = "block";
        wrap.style.width = "100%";
      }

      parent.insertBefore(wrap, t);
      wrap.appendChild(t);

      // Ensure target is animatable
      t.style.display = t.classList.contains("line") ? "block" : "inline-block";
    });
  };

  els.forEach((el) => {
    // ✅ If not allowed on this device — skip (and DON'T mark inited)
    if (!shouldRunOnDevice(el)) return;

    if (el.dataset.textRevealInited === "true") return;
    el.dataset.textRevealInited = "true";

    const type = (el.getAttribute("data-text-reveal") || "").trim();
    if (!type) return;

    // SplitType
    new SplitType(el, { types: type, tagName: "span" });

    // Targets
    let targets = [];
    if (type === "lines") targets = el.querySelectorAll(".line");
    if (type === "words") targets = el.querySelectorAll(".word");
    if (type === "chars") targets = el.querySelectorAll(".char");
    if (!targets.length) return;

    // Config
    const start = getResponsiveStart(el);

    const onceAttr = el.getAttribute("data-text-reveal-once");
    const once = onceAttr === null ? DEFAULTS.once : onceAttr !== "false";

    const delay = toNum(el.getAttribute("data-text-reveal-delay"), DEFAULTS.delay);

    const durationAttr = el.getAttribute("data-text-reveal-duration");
    const staggerAttr  = el.getAttribute("data-text-reveal-stagger");

    const duration = durationAttr
      ? toNum(durationAttr, DEFAULTS.duration[type] ?? 0.6)
      : (DEFAULTS.duration[type] ?? 0.6);

    const stagger = staggerAttr
      ? toNum(staggerAttr, DEFAULTS.stagger[type] ?? 0.06)
      : (DEFAULTS.stagger[type] ?? 0.06);

    const dir = (el.getAttribute("data-text-reveal-dir") || "up").trim().toLowerCase();
    const sign = dir === "down" ? -1 : 1;

    const yPercent = parsePercent(el.getAttribute("data-text-reveal-y"), DEFAULTS.yPercent) * sign;

    const useMask = attrBool(el, "data-text-reveal-mask", DEFAULTS.mask);
    if (useMask) applyMaskWrap(targets);

    // Opacity start:
    const opacityAttr = el.getAttribute("data-text-reveal-opacity");
    const opacityFrom = (opacityAttr !== null)
      ? toNum(opacityAttr, DEFAULTS.opacityFrom)
      : DEFAULTS.opacityFrom;

    // Initial state
    gsap.set(targets, { yPercent, opacity: opacityFrom, force3D: true });

    const tween = gsap.to(targets, {
      yPercent: 0,
      opacity: 1,
      duration,
      delay,
      ease: DEFAULTS.ease,
      stagger: { each: stagger },
      paused: true,
      overwrite: "auto",
      onStart: () => gsap.set(targets, { willChange: "transform, opacity" }),
      onComplete: () => gsap.set(targets, { clearProps: "willChange" })
    });

    ScrollTrigger.create({
      trigger: el,
      start,
      once,
      onEnter: () => tween.restart(true),
      onEnterBack: () => { if (!once) tween.restart(true); }
    });
  });

  requestAnimationFrame(() => ScrollTrigger.refresh());
}

/* =========================================================
   ELEMENT REVEAL ENGINE (fade | fade-up | fade-scale)
   Required:
   - data-reveal="fade|fade-up|fade-scale"

   Optional (per element):
   - data-reveal-start="top 90%" OR "90%"          (desktop override)
   - data-reveal-start-tablet="92%"                (<=1024 override)
   - data-reveal-start-mobile="94%"                (<=767 override)

   - data-reveal-trigger=".selector"               (use another trigger element)
   - data-reveal-once="true|false"                 (default: true)
   - data-reveal-delay="0.0"                       (seconds, default: 0)
   - data-reveal-duration="0.8"                    (seconds, default depends on type)
   - data-reveal-ease="power2.out"                 (default: power2.out)

   Motion params:
   - data-reveal-y="40"                            (px, only for fade-up; default depends on device/type)
   - data-reveal-scale-from="0.96"                 (only for fade-scale; default: 0.96)
   - data-reveal-opacity-from="0"                  (default: 0)

   Disable by breakpoint:
   - data-reveal-disable="mobile|tablet|desktop"
   - data-reveal-disable="mobile,tablet"
========================================================= */

function initRevealElementsEngine() {
  if (!window.gsap || !window.ScrollTrigger || !window.App) return;
  gsap.registerPlugin(ScrollTrigger);

  const DEFAULTS = {
    startDesktop: "top 94%",
    startTablet:  "top 96%",
    startMobile:  "top 98%",

    once: true,
    delay: 0,
    ease: "power2.out",
    opacityFrom: 0,

    duration: {
      fade: 0.6,
      "fade-up": 0.8,
      "fade-scale": 0.6
    },

    // px defaults for fade-up
    yDesktop: 24,
    yTablet:  20,
    yMobile:  16,

    // default for fade-scale
    scaleFrom: 0.5
  };

  // Helpers (English comments)
  const toNum = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const normalizeStart = (raw, fallback) => {
    const v = (raw || "").trim();
    if (!v) return fallback;
    return v.includes(" ") ? v : `top ${v}`;
  };

  const getResponsiveStart = (el) => {
    const { isMobile, isTablet } = App.getDevice();

    const mobileRaw  = el.getAttribute("data-reveal-start-mobile");
    const tabletRaw  = el.getAttribute("data-reveal-start-tablet");
    const desktopRaw = el.getAttribute("data-reveal-start");

    if (isMobile && mobileRaw) return normalizeStart(mobileRaw, DEFAULTS.startMobile);
    if (isTablet && tabletRaw) return normalizeStart(tabletRaw, DEFAULTS.startTablet);
    if (desktopRaw) return normalizeStart(desktopRaw, DEFAULTS.startDesktop);

    if (isMobile) return DEFAULTS.startMobile;
    if (isTablet) return DEFAULTS.startTablet;
    return DEFAULTS.startDesktop;
  };

  const isDisabledForThisDevice = (el) => {
    const v = (el.getAttribute("data-reveal-disable") || "").toLowerCase();
    if (!v) return false;

    const parts = v.split(",").map(s => s.trim()).filter(Boolean);
    const { isMobile, isTablet, isDesktop } = App.getDevice();

    if (isMobile && parts.includes("mobile")) return true;
    if (isTablet && parts.includes("tablet")) return true;
    if (isDesktop && parts.includes("desktop")) return true;

    return false;
  };

  const els = document.querySelectorAll("[data-reveal]");
  if (!els.length) return;

  els.forEach((el) => {
    // Prevent double init
    if (el.dataset.revealInited === "true") return;
    if (isDisabledForThisDevice(el)) return;

    const type = (el.getAttribute("data-reveal") || "").trim();
    if (!type) return;

    el.dataset.revealInited = "true";

    const start = getResponsiveStart(el);

    const onceAttr = el.getAttribute("data-reveal-once");
    const once = onceAttr === null ? DEFAULTS.once : onceAttr !== "false";

    const delay = toNum(el.getAttribute("data-reveal-delay"), DEFAULTS.delay);

    const durationAttr = el.getAttribute("data-reveal-duration");
    const duration = durationAttr
      ? toNum(durationAttr, DEFAULTS.duration[type] ?? 0.7)
      : (DEFAULTS.duration[type] ?? 0.7);

    const ease = (el.getAttribute("data-reveal-ease") || DEFAULTS.ease).trim();

    const opacityFromAttr = el.getAttribute("data-reveal-opacity-from");
    const opacityFrom = opacityFromAttr !== null
      ? toNum(opacityFromAttr, DEFAULTS.opacityFrom)
      : DEFAULTS.opacityFrom;

    // Trigger override
    const triggerSel = el.getAttribute("data-reveal-trigger");
    const triggerEl = triggerSel ? document.querySelector(triggerSel) : el;

    // ---- Build fromVars (set immediately => no flash)
    const fromVars = { opacity: opacityFrom, force3D: true };
    const toVars = {
      opacity: 1,
      duration,
      delay,
      ease,
      paused: true,
      overwrite: "auto",
      onStart: () => gsap.set(el, { willChange: "transform, opacity" }),
      onComplete: () => gsap.set(el, { clearProps: "willChange" })
    };

    if (type === "fade-up") {
      const { isMobile, isTablet } = App.getDevice();
      const yDefault = isMobile ? DEFAULTS.yMobile : (isTablet ? DEFAULTS.yTablet : DEFAULTS.yDesktop);

      const rawY = el.getAttribute("data-reveal-y");
      const y = (rawY === null || String(rawY).trim() === "")
        ? yDefault
        : toNum(rawY, yDefault);

      fromVars.y = y;
      toVars.y = 0;
    }

    if (type === "fade-scale") {
      const rawScale = el.getAttribute("data-reveal-scale-from");
      const scaleFrom = (rawScale === null || String(rawScale).trim() === "")
        ? DEFAULTS.scaleFrom
        : toNum(rawScale, DEFAULTS.scaleFrom);

      fromVars.scale = scaleFrom;
      toVars.scale = 1;
      toVars.transformOrigin = "50% 50%";
    }

    // ✅ Set initial state immediately (like text engine)
    gsap.set(el, fromVars);

    // Build tween
    const tween = gsap.to(el, toVars);

    ScrollTrigger.create({
      trigger: triggerEl,
      start,
      once,
      onEnter: () => tween.restart(true),
      onEnterBack: () => { if (!once) tween.restart(true); }
    });
  });

  requestAnimationFrame(() => ScrollTrigger.refresh());
}

/* =========================================================
   GROUP ENGINE (Compact presets: step | card)
   Wrapper:
   - data-group="step|card"

   Optional wrapper:
   - data-group-start / data-group-start-tablet / data-group-start-mobile
   - data-group-once="true|false" (default: true)
   - data-group-delay="0.0"       (base delay)
   - data-group-media-delay="0.12" (extra delay for media)

   Roles inside wrapper:
   - [data-g="title"] -> SplitType words (masked, yPercent)
   - [data-g="text"]  -> SplitType lines (masked, yPercent)
   - [data-g="media"] -> fade-up
   - [data-g="decor"] -> 4 corner lines (scale from center)
========================================================= */

function initGroupEngine() {
  if (!window.gsap || !window.ScrollTrigger || !window.SplitType) return;
  if (!window.App || typeof App.getDevice !== "function") return;

  gsap.registerPlugin(ScrollTrigger);

  // Aligned with your existing engines (text + reveal)
  const DEFAULTS = {
    // Responsive starts
    startDesktop: "top 92%",
    startTablet:  "top 94%",
    startMobile:  "top 96%",

    once: true,
    baseDelay: 0,
    mediaDelay: 0.12,

    // Text reveal (same principle as initTextRevealEngine)
    text: {
      yPercent: 120,
      ease: "power1.out",
      maskPadEm: 0.18,
      durationWords: 0.6,
      durationLines: 0.6,
      staggerWords: 0.05,
      staggerLines: 0.10
    },

    // Media fade-up (same idea as initRevealElementsEngine fade-up)
    media: {
      yDesktop: 24,
      yTablet:  20,
      yMobile:  16,
      duration: 0.9,
      ease: "power2.out"
    },

    // Decor corners (simple)
    decor: {
      duration: 0.55,
      ease: "power2.out",
      stagger: 0.03
    }
  };

  // ---------- helpers ----------
  const toNum = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const normalizeStart = (raw, fallback) => {
    const v = (raw || "").trim();
    if (!v) return fallback;
    return v.includes(" ") ? v : `top ${v}`;
  };

  const getResponsiveStart = (wrapper) => {
    const { isMobile, isTablet } = App.getDevice();

    const mobileRaw  = wrapper.getAttribute("data-group-start-mobile");
    const tabletRaw  = wrapper.getAttribute("data-group-start-tablet");
    const desktopRaw = wrapper.getAttribute("data-group-start");

    if (isMobile && mobileRaw) return normalizeStart(mobileRaw, DEFAULTS.startMobile);
    if (isTablet && tabletRaw) return normalizeStart(tabletRaw, DEFAULTS.startTablet);
    if (desktopRaw) return normalizeStart(desktopRaw, DEFAULTS.startDesktop);

    if (isMobile) return DEFAULTS.startMobile;
    if (isTablet) return DEFAULTS.startTablet;
    return DEFAULTS.startDesktop;
  };

  // Mask wrap for split pieces (clipping fix)
  const applyMaskWrap = (targets) => {
    targets.forEach((t) => {
      const parent = t.parentElement;
      if (parent && parent.hasAttribute("data-group-mask-wrap")) return;

      const wrap = document.createElement("span");
      wrap.setAttribute("data-group-mask-wrap", "true");

      wrap.style.display = "inline-block";
      wrap.style.overflow = "hidden";
      wrap.style.verticalAlign = "bottom";
      wrap.style.lineHeight = "inherit";

      const pad = DEFAULTS.text.maskPadEm;
      wrap.style.paddingBottom = `${pad}em`;
      wrap.style.marginBottom  = `-${pad}em`;

      if (t.classList.contains("line")) {
        wrap.style.display = "block";
        wrap.style.width = "100%";
      }

      parent.insertBefore(wrap, t);
      wrap.appendChild(t);

      t.style.display = t.classList.contains("line") ? "block" : "inline-block";
    });
  };

  const splitPrep = (el, type /* "words"|"lines" */) => {
    if (!el) return [];
    new SplitType(el, { types: type, tagName: "span" });

    const targets =
      type === "words" ? el.querySelectorAll(".word") :
      type === "lines" ? el.querySelectorAll(".line") : [];

    if (!targets.length) return [];

    applyMaskWrap(targets);
    gsap.set(targets, { yPercent: DEFAULTS.text.yPercent, opacity: 1, force3D: true });
    return targets;
  };

  const prepMedia = (el) => {
    if (!el) return null;
    const { isMobile, isTablet } = App.getDevice();
    const y = isMobile ? DEFAULTS.media.yMobile : (isTablet ? DEFAULTS.media.yTablet : DEFAULTS.media.yDesktop);
    gsap.set(el, { y, autoAlpha: 0, force3D: true });
    return el;
  };

  // Decor: 4 corner lines scale from center
  const buildDecorTween = (wrapper) => {
    const corners = wrapper.querySelectorAll('[data-g="decor"]');
    if (!corners.length) return null;

    corners.forEach((c) => {
      const r = c.getBoundingClientRect();
      const isHorizontal = r.width >= r.height;
      c.dataset.cornerAxis = isHorizontal ? "x" : "y";

      gsap.set(c, {
        opacity: 0,
        scaleX: isHorizontal ? 0 : 1,
        scaleY: isHorizontal ? 1 : 0,
        transformOrigin: "50% 50%",
        force3D: true
      });
    });

    return {
      play: (tl, atTime) => {
        tl.to(corners, {
          opacity: 1,
          scaleX: (i, el) => (el.dataset.cornerAxis === "x" ? 1 : 1),
          scaleY: (i, el) => (el.dataset.cornerAxis === "y" ? 1 : 1),
          duration: DEFAULTS.decor.duration,
          ease: DEFAULTS.decor.ease,
          stagger: { each: DEFAULTS.decor.stagger },
          onStart: () => gsap.set(corners, { willChange: "transform, opacity" }),
          onComplete: () => gsap.set(corners, { clearProps: "willChange" })
        }, atTime);
      }
    };
  };

  // ---------- presets ----------
  const PRESETS = {
    // Process step: title(words) + text(lines) + media(fade-up)
    step: (wrapper, cfg) => {
      const titleEl = wrapper.querySelector('[data-g="title"]');
      const textEl  = wrapper.querySelector('[data-g="text"]');
      const mediaEl = wrapper.querySelector('[data-g="media"]');

      const titleWords = splitPrep(titleEl, "words");
      const textLines  = splitPrep(textEl, "lines");
      const media = prepMedia(mediaEl);

      const tl = gsap.timeline({ paused: true });

      if (titleWords.length) {
        tl.to(titleWords, {
          yPercent: 0,
          opacity: 1,
          duration: DEFAULTS.text.durationWords,
          ease: DEFAULTS.text.ease,
          stagger: { each: DEFAULTS.text.staggerWords },
          onStart: () => gsap.set(titleWords, { willChange: "transform, opacity" }),
          onComplete: () => gsap.set(titleWords, { clearProps: "willChange" })
        }, cfg.baseDelay + 0.0);
      }

      if (textLines.length) {
        tl.to(textLines, {
          yPercent: 0,
          opacity: 1,
          duration: DEFAULTS.text.durationLines,
          ease: DEFAULTS.text.ease,
          stagger: { each: DEFAULTS.text.staggerLines },
          onStart: () => gsap.set(textLines, { willChange: "transform, opacity" }),
          onComplete: () => gsap.set(textLines, { clearProps: "willChange" })
        }, cfg.baseDelay + 0.06);
      }

      if (media) {
        tl.to(media, {
          y: 0,
          autoAlpha: 1,
          duration: DEFAULTS.media.duration,
          ease: DEFAULTS.media.ease,
          onStart: () => gsap.set(media, { willChange: "transform, opacity" }),
          onComplete: () => gsap.set(media, { clearProps: "willChange" })
        }, cfg.baseDelay + cfg.mediaDelay);
      }

      return tl;
    },

    // Card: decor(corners) + title(words) + text(lines) + media(optional)
    card: (wrapper, cfg) => {
      const titleEl = wrapper.querySelector('[data-g="title"]');
      const textEl  = wrapper.querySelector('[data-g="text"]');
      const mediaEl = wrapper.querySelector('[data-g="media"]');

      const decor = buildDecorTween(wrapper);

      const titleWords = splitPrep(titleEl, "words");
      const textLines  = splitPrep(textEl, "lines");
      const media = prepMedia(mediaEl);

      const tl = gsap.timeline({ paused: true });

      if (decor) decor.play(tl, cfg.baseDelay + 0.0);

      if (titleWords.length) {
        tl.to(titleWords, {
          yPercent: 0,
          opacity: 1,
          duration: DEFAULTS.text.durationWords,
          ease: DEFAULTS.text.ease,
          stagger: { each: DEFAULTS.text.staggerWords },
          onStart: () => gsap.set(titleWords, { willChange: "transform, opacity" }),
          onComplete: () => gsap.set(titleWords, { clearProps: "willChange" })
        }, cfg.baseDelay + 0.06);
      }

      if (textLines.length) {
        tl.to(textLines, {
          yPercent: 0,
          opacity: 1,
          duration: DEFAULTS.text.durationLines,
          ease: DEFAULTS.text.ease,
          stagger: { each: DEFAULTS.text.staggerLines },
          onStart: () => gsap.set(textLines, { willChange: "transform, opacity" }),
          onComplete: () => gsap.set(textLines, { clearProps: "willChange" })
        }, cfg.baseDelay + 0.10);
      }

      if (media) {
        tl.to(media, {
          y: 0,
          autoAlpha: 1,
          duration: DEFAULTS.media.duration,
          ease: DEFAULTS.media.ease,
          onStart: () => gsap.set(media, { willChange: "transform, opacity" }),
          onComplete: () => gsap.set(media, { clearProps: "willChange" })
        }, cfg.baseDelay + cfg.mediaDelay);
      }

      return tl;
    }
  };

  // ---------- init ----------
  const groups = document.querySelectorAll("[data-group]");
  if (!groups.length) return;

  groups.forEach((wrapper) => {
    if (wrapper.dataset.groupInited === "true") return;
    wrapper.dataset.groupInited = "true";

    const presetName = (wrapper.getAttribute("data-group") || "").trim();
    const preset = PRESETS[presetName];
    if (!preset) return;

    const start = getResponsiveStart(wrapper);

    const onceAttr = wrapper.getAttribute("data-group-once");
    const once = onceAttr === null ? DEFAULTS.once : onceAttr !== "false";

    const baseDelay = toNum(wrapper.getAttribute("data-group-delay"), DEFAULTS.baseDelay);
    const mediaDelay = toNum(wrapper.getAttribute("data-group-media-delay"), DEFAULTS.mediaDelay);

    const tl = preset(wrapper, { baseDelay, mediaDelay });
    if (!tl) return;

    ScrollTrigger.create({
      trigger: wrapper,
      start,
      once,
      onEnter: () => tl.restart(true),
      onEnterBack: () => { if (!once) tl.restart(true); }
    });
  });

  requestAnimationFrame(() => ScrollTrigger.refresh());
}

</script>
