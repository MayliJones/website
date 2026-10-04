// Part sections (project pages): builds a detailed "part of the machine" section from a data object.
//
// In the page:   <section class="editorial-section part-section" data-part="tower"></section>
// In a data file: window.PART_SECTIONS.tower = { title, intro, groups: [...] }  (see js/mindmeter-parts.js)
//
// Each row has either media (images shown as they are, capped in height) or carousel (slides in the
// site's carousel, with captions, always click-to-enlarge), plus text blocks. Rows alternate
// automatically (first row image left, next image right, and so on through the whole section); set
// side: "left" or "right" on a row to override. Media with zoom: true open full size in a lightbox.
// Media images are compact by default (capped in height); size: "large" makes one fill its column at
// full height instead, for labelled diagrams that need the room. A row with a large image uses the same
// columns as the row above it (or the 50/50 intro grid if it comes first); maxWidth (e.g. "400px") caps
// how wide it gets, keeping its edge lined up with the column. A carousel row can set ratio (e.g. "16 / 10") to suit wide images; the
// default frame is 5 / 4.
// introBlocks (optional) are short subheaded blocks under the intro, side by side on desktop.
// Add wide: true to a block to place it under the whole row, spanning the full width.
// Text strings may contain simple inline HTML (<em>, <strong>, &times;...).
(function () {
  const parts = window.PART_SECTIONS || {};
  const sections = document.querySelectorAll(".part-section[data-part]");
  if (!sections.length) return;

  const el = (tag, className, html) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (html != null) node.innerHTML = html;
    return node;
  };

  // ---- Lightbox: one shared <dialog> per page
  let dialog = null;
  let dialogImg = null;

  const openLightbox = (img) => {
    if (!dialog) {
      dialog = el("dialog", "part-lightbox");
      dialog.setAttribute("aria-label", "Full size image");
      const close = el("button", "part-lightbox-close", '<span aria-hidden="true">&times;</span>');
      close.type = "button";
      close.setAttribute("aria-label", "Close");
      close.addEventListener("click", () => dialog.close());
      dialogImg = el("img");
      dialog.append(close, dialogImg);
      // Click outside the image (on the backdrop) closes it; Esc is handled by <dialog>
      dialog.addEventListener("click", (e) => {
        if (e.target === dialog) dialog.close();
      });
      dialog.addEventListener("close", () => document.documentElement.classList.remove("part-lightbox-open"));
      document.body.append(dialog);
    }
    dialogImg.src = img.currentSrc || img.src;
    dialogImg.alt = img.alt;
    document.documentElement.classList.add("part-lightbox-open");
    dialog.showModal();
  };

  const buildMedia = (m) => {
    const img = el("img");
    img.src = m.src;
    img.alt = m.alt || "";
    img.loading = "lazy";
    img.decoding = "async";
    if (m.width) img.width = m.width;
    if (m.height) img.height = m.height;

    const sizeClass = m.size === "large" ? " part-media-frame--large" : "";
    const capWidth = (frame) => { if (m.maxWidth) frame.style.maxWidth = m.maxWidth; return frame; };
    if (!m.zoom) {
      const frame = el("div", "part-media-frame" + sizeClass);
      frame.append(img);
      return capWidth(frame);
    }
    const btn = el("button", "part-media-frame part-media-zoom" + sizeClass);
    btn.type = "button";
    btn.setAttribute("aria-label", "Open full size: " + (m.alt || "image"));
    btn.append(img, el("span", "part-media-hint", "Click to enlarge"));
    btn.addEventListener("click", () => openLightbox(img));
    return capWidth(btn);
  };

  // Same markup as the My Role carousel; initMediaCarousel (js/script.js) wires up arrows, dots and captions
  const arrow = (dir) =>
    '<button type="button" class="gallery-arrow gallery-arrow--' + dir + '" aria-label="' +
    (dir === "prev" ? "Previous" : "Next") + ' image"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="' +
    (dir === "prev" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6") +
    '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';

  const buildCarousel = (slides, label, ratio) => {
    const carousel = el("div", "media-carousel part-carousel");
    carousel.setAttribute("aria-roledescription", "carousel");
    carousel.setAttribute("aria-label", label);
    const stage = el("div", "media-carousel-stage");
    const frame = el("div", "media-carousel-frame");
    if (ratio) frame.style.aspectRatio = ratio;
    slides.forEach((m, i) => {
      const img = el("img", "is-contain" + (i === 0 ? " is-active" : ""));
      img.src = m.src;
      img.alt = m.alt || "";
      img.loading = "lazy";
      img.decoding = "async";
      if (m.width) img.width = m.width;
      if (m.height) img.height = m.height;
      if (m.caption) img.dataset.caption = m.caption;
      frame.append(img);
    });
    // One button over the frame opens whichever slide is showing
    const zoom = el("button", "part-carousel-zoom", '<span class="part-media-hint">Click to enlarge</span>');
    zoom.type = "button";
    frame.append(zoom);
    stage.append(frame);
    stage.insertAdjacentHTML("afterbegin", arrow("prev"));
    stage.insertAdjacentHTML("beforeend", arrow("next"));
    const caption = el("p", "media-carousel-caption");
    caption.setAttribute("aria-live", "polite");
    carousel.append(stage, caption, el("div", "media-carousel-dots"));
    carousel.lastChild.setAttribute("aria-hidden", "true");

    let active = frame.querySelector("img");
    const sync = (img) => {
      active = img;
      zoom.setAttribute("aria-label", "Open full size: " + (img.alt || "image"));
    };
    zoom.addEventListener("click", () => openLightbox(active));
    if (window.initMediaCarousel) window.initMediaCarousel(carousel, sync);
    else sync(active);
    return carousel;
  };

  const buildBlock = (b) => {
    const block = el("div", "part-block");
    if (b.heading) block.append(el("h4", "part-block-heading", b.heading));
    (b.paragraphs || []).forEach((p) => block.append(el("p", null, p)));
    if (b.list) {
      const ul = el("ul", "ed-list");
      b.list.forEach((item) => ul.append(el("li", null, item)));
      block.append(ul);
    }
    return block;
  };

  sections.forEach((section) => {
    const data = parts[section.dataset.part];
    if (!data) return;
    let rowIndex = 0;

    const frag = document.createDocumentFragment();
    if (data.title) frag.append(el("h2", null, data.title));
    if (data.intro) {
      const intro = el("div", "part-intro");
      [].concat(data.intro).forEach((p) => intro.append(el("p", null, p)));
      frag.append(intro);
    }
    if (data.introBlocks) {
      const blocks = el("div", "part-intro-blocks");
      data.introBlocks.forEach((b) => blocks.append(buildBlock(b)));
      frag.append(blocks);
    }

    (data.groups || []).forEach((group) => {
      const g = el("div", "part-group");
      if (group.heading) g.append(el("h3", "part-group-heading", group.heading));
      (group.rows || []).forEach((row) => {
        const side = row.side || (rowIndex % 2 === 0 ? "left" : "right");
        rowIndex++;
        const large = (row.media || []).some((m) => m.size === "large");
        const r = el("div", "part-row part-row--media-" + side +
          (row.carousel ? " part-row--carousel" : "") + (large ? " part-row--large" : ""));
        const media = el("div", "part-media");
        if (row.carousel) media.append(buildCarousel(row.carousel, (data.title || "") + " images", row.ratio));
        else (row.media || []).forEach((m) => media.append(buildMedia(m)));
        const text = el("div", "part-text");
        const wide = el("div", "part-wide");
        (row.blocks || []).forEach((b) => (b.wide ? wide : text).append(buildBlock(b)));
        r.append(media, text);
        if (wide.childElementCount) r.append(wide);
        g.append(r);
      });
      frag.append(g);
    });

    section.replaceChildren(frag);
  });
})();
