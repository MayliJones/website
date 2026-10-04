// Mobile nav toggle
const navToggle = document.querySelector(".nav-toggle");
const primaryNav = document.querySelector(".primary-nav");

if (navToggle && primaryNav) {
  navToggle.addEventListener("click", () => {
    const isOpen = primaryNav.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });
}

// About section skills tabs
const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabButtons.forEach((b) => {
      b.classList.remove("is-active");
      b.setAttribute("aria-selected", "false");
      b.setAttribute("tabindex", "-1");
    });
    tabPanels.forEach((p) => {
      p.classList.remove("is-active");
      p.hidden = true;
    });

    btn.classList.add("is-active");
    btn.setAttribute("aria-selected", "true");
    btn.setAttribute("tabindex", "0");

    const panel = document.getElementById(btn.getAttribute("aria-controls"));
    if (panel) {
      panel.hidden = false;
      panel.classList.add("is-active");
    }
  });
});

// Contact section: copy email to clipboard
const emailButton = document.querySelector(".contact-email");

if (emailButton) {
  const emailText = emailButton.querySelector(".contact-email-text");
  const originalText = emailText.textContent;
  let revertTimeout = null;

  emailButton.addEventListener("click", () => {
    navigator.clipboard.writeText(emailButton.dataset.email).then(() => {
      clearTimeout(revertTimeout);
      emailText.textContent = "Copied!";
      revertTimeout = setTimeout(() => {
        emailText.textContent = originalText;
      }, 1500);
    });
  });
}

// Media carousel (project pages): arrows step through the images one at a time and wrap round at either end.
// Optional: a .media-carousel-caption element shows each image's data-caption. Exposed as
// window.initMediaCarousel for carousels built later by other scripts (e.g. js/part-section.js);
// onChange(activeImg) runs whenever the slide changes.
function initMediaCarousel(carousel, onChange) {
  const slides = Array.from(carousel.querySelectorAll(".media-carousel-frame img"));
  const dotsRow = carousel.querySelector(".media-carousel-dots");
  const caption = carousel.querySelector(".media-carousel-caption");
  const dots = slides.map(() => dotsRow.appendChild(document.createElement("span")));
  let current = Math.max(0, slides.findIndex((s) => s.classList.contains("is-active")));

  const show = (n) => {
    current = (n + slides.length) % slides.length;
    slides.forEach((s, k) => s.classList.toggle("is-active", k === current));
    dots.forEach((d, k) => d.classList.toggle("is-active", k === current));
    if (caption) caption.textContent = slides[current].dataset.caption || "";
    if (onChange) onChange(slides[current]);
  };

  carousel.querySelector(".gallery-arrow--prev").addEventListener("click", () => show(current - 1));
  carousel.querySelector(".gallery-arrow--next").addEventListener("click", () => show(current + 1));
  show(current);
}

window.initMediaCarousel = initMediaCarousel;
document.querySelectorAll(".media-carousel").forEach((carousel) => initMediaCarousel(carousel));

// Footer: auto-update copyright year
const currentYear = document.getElementById("current-year");

if (currentYear) {
  currentYear.textContent = new Date().getFullYear();
}
