(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const characters = {
    v1: {
      name: "大肥鱼 v1",
      tag: "逐帧动画",
      desc: "106 个动作，从待机、吃饭到写代码和放烟花。",
      type: "video",
      src: "assets/chars/v1.webm",
    },
    v2: {
      name: "大肥鱼 v2",
      tag: "18 种表情",
      desc: "半身表情立绘，安安静静待在屏幕边上。",
      type: "image",
      src: "assets/chars/v2.webp",
    },
    v3: {
      name: "大肥鱼 v3",
      tag: "32 种表情",
      desc: "表情更丰富，开心、害羞和生气都写在脸上。",
      type: "image",
      src: "assets/chars/v3.webp",
    },
    v4: {
      name: "大肥鱼 v4",
      tag: "32 种姿势",
      desc: "全身立绘，伸懒腰、吃蛋糕，偶尔偷偷看你。",
      type: "image",
      src: "assets/chars/v4.webp",
    },
    v5: {
      name: "大肥鱼 v5",
      tag: "16 种姿势",
      desc: "打工、摸鱼、喝奶茶，日常感满满。",
      type: "image",
      src: "assets/chars/v5.webp",
    },
    v6: {
      name: "大肥鱼 v6",
      tag: "2 种姿势",
      desc: "来自余额鲸的平静立绘，还有摸摸头。",
      type: "image",
      src: "assets/chars/v6.webp",
    },
    gpt: {
      name: "GPT 娘",
      tag: "专属语录 · 测试",
      desc: "白发龙娘加专属语录，不带白饭梗。",
      type: "image",
      src: "assets/chars/gpt.webp",
    },
  };

  const video = document.getElementById("character-video");
  const image = document.getElementById("character-image");
  const tag = document.getElementById("character-tag");
  const name = document.getElementById("character-name");
  const desc = document.getElementById("character-desc");
  const options = [...document.querySelectorAll("[data-character]")];

  let characterInView = true;
  const preload = new Set();
  Object.values(characters).forEach((character) => {
    if (character.type !== "image" || preload.has(character.src)) return;
    preload.add(character.src);
    const img = new Image();
    img.src = character.src;
  });

  function selectCharacter(id) {
    const character = characters[id];
    if (!character) return;

    options.forEach((button) => {
      button.setAttribute("aria-selected", String(button.dataset.character === id));
    });

    tag.textContent = character.tag;
    name.textContent = character.name;
    desc.textContent = character.desc;

    if (character.type === "video") {
      image.classList.add("hide");
      video.classList.remove("hide");
      if (!reduceMotion && characterInView && !document.hidden) {
        const playback = video.play();
        if (playback && playback.catch) playback.catch(() => {});
      } else {
        video.pause();
      }
      return;
    }

    video.pause();
    video.classList.add("hide");
    image.src = character.src;
    image.alt = `${character.name} 立绘`;
    image.classList.remove("hide");
  }

  options.forEach((button) => {
    button.addEventListener("click", () => selectCharacter(button.dataset.character));
  });

  const characterSection = document.getElementById("characters");
  if (characterSection && "IntersectionObserver" in window && video) {
    const observer = new IntersectionObserver(
      ([entry]) => {
        characterInView = entry.isIntersecting;
        if (!characterInView || video.classList.contains("hide") || reduceMotion || document.hidden) {
          video.pause();
          return;
        }
        const playback = video.play();
        if (playback && playback.catch) playback.catch(() => {});
      },
      { threshold: 0.08 },
    );
    observer.observe(characterSection);
  }

  document.addEventListener("visibilitychange", () => {
    if (!video || video.classList.contains("hide") || reduceMotion) return;
    if (document.hidden || !characterInView) {
      video.pause();
      return;
    }
    const playback = video.play();
    if (playback && playback.catch) playback.catch(() => {});
  });

  if (reduceMotion && video) video.pause();

  const navToggle = document.querySelector(".menu-toggle");
  const navLinks = document.getElementById("nav-links");

  function closeNav() {
    document.body.classList.remove("nav-open");
    if (navToggle) navToggle.setAttribute("aria-expanded", "false");
  }

  if (navToggle && navLinks) {
    navToggle.addEventListener("click", () => {
      const open = !document.body.classList.contains("nav-open");
      document.body.classList.toggle("nav-open", open);
      navToggle.setAttribute("aria-expanded", String(open));
    });

    navLinks.addEventListener("click", (event) => {
      if (event.target.closest("a")) closeNav();
    });

    document.addEventListener("click", (event) => {
      if (!document.body.classList.contains("nav-open")) return;
      if (event.target.closest(".nav-shell")) return;
      closeNav();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeNav();
    });
  }

  const header = document.querySelector(".site-header");
  let scrollTick = false;

  function updateHeader() {
    if (header) header.classList.toggle("is-scrolled", window.scrollY > 8);
    scrollTick = false;
  }

  window.addEventListener(
    "scroll",
    () => {
      if (scrollTick) return;
      scrollTick = true;
      window.requestAnimationFrame(updateHeader);
    },
    { passive: true },
  );

  updateHeader();

  const revealElements = [...document.querySelectorAll("[data-reveal]")];
  if (revealElements.length) {
    document.documentElement.classList.add("js");
    if ("IntersectionObserver" in window && !reduceMotion) {
      const revealObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
          });
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
      );
      revealElements.forEach((element) => revealObserver.observe(element));
    } else {
      revealElements.forEach((element) => element.classList.add("is-visible"));
    }
  }
})();
