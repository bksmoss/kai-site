// Header scroll: transparent -> solid
const header = document.querySelector('.header');
window.addEventListener('scroll', () => {
  header.classList.toggle('scrolled', window.scrollY > 50);
});

// Mobile menu toggle
const hamburger = document.querySelector('.nav__hamburger');
const mobileMenu = document.querySelector('.nav__mobile-menu');

if (hamburger && mobileMenu) {
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    mobileMenu.classList.toggle('active');
  });

  mobileMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('active');
      mobileMenu.classList.remove('active');
    });
  });
}

// FAQ accordion
document.querySelectorAll('.faq-item__question').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.faq-item');
    const isActive = item.classList.contains('active');
    document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('active'));
    if (!isActive) {
      item.classList.add('active');
    }
  });
});

// Lightbox (portfolio page)
const lightbox = document.querySelector('.lightbox');
if (lightbox) {
  const lightboxImg = lightbox.querySelector('.lightbox__img');
  const lightboxClose = lightbox.querySelector('.lightbox__close');

  document.querySelectorAll('.portfolio-grid__item img').forEach(img => {
    img.addEventListener('click', () => {
      lightboxImg.src = img.src;
      lightboxImg.alt = img.alt;
      lightbox.classList.add('active');
      document.body.style.overflow = 'hidden';
    });
  });

  lightboxClose.addEventListener('click', () => {
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
  });

  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) {
      lightbox.classList.remove('active');
      document.body.style.overflow = '';
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lightbox.classList.contains('active')) {
      lightbox.classList.remove('active');
      document.body.style.overflow = '';
    }
  });
}

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// ===== CONTACT FORM (AJAX + success animation) =====
const contactForm = document.querySelector('.contact__form');
if (contactForm) {
  const successEl = document.querySelector('.contact__success');
  const submitBtn = contactForm.querySelector('.contact__submit-btn');
  const submitText = contactForm.querySelector('.contact__submit-text');
  const submitLoading = contactForm.querySelector('.contact__submit-loading');

  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Show loading
    submitText.style.display = 'none';
    submitLoading.style.display = 'inline';
    submitBtn.disabled = true;

    try {
      const formData = new FormData(contactForm);
      await fetch(contactForm.action, {
        method: 'POST',
        body: formData,
        headers: { 'Accept': 'application/json' }
      });

      // Hide form, show success
      contactForm.style.display = 'none';
      successEl.style.display = 'block';

      // Reset after 5 seconds
      setTimeout(() => {
        contactForm.reset();
        contactForm.style.display = 'flex';
        successEl.style.display = 'none';
        submitText.style.display = 'inline';
        submitLoading.style.display = 'none';
        submitBtn.disabled = false;
      }, 5000);

    } catch (err) {
      // If fetch fails, still show success (formsubmit may block CORS)
      contactForm.style.display = 'none';
      successEl.style.display = 'block';

      setTimeout(() => {
        contactForm.reset();
        contactForm.style.display = 'flex';
        successEl.style.display = 'none';
        submitText.style.display = 'inline';
        submitLoading.style.display = 'none';
        submitBtn.disabled = false;
      }, 5000);
    }
  });
}

// ===== WORK CAROUSEL (Home page) =====
const carouselSlides = document.querySelectorAll('.work-carousel__slide');
const carouselDots = document.querySelectorAll('.work-carousel__dot');
let currentSlide = 0;
let carouselInterval;

function goToSlide(index) {
  carouselSlides.forEach(s => s.classList.remove('active'));
  carouselDots.forEach(d => d.classList.remove('active'));
  currentSlide = index;
  carouselSlides[currentSlide].classList.add('active');
  carouselDots[currentSlide].classList.add('active');
}

function nextSlide() {
  goToSlide((currentSlide + 1) % carouselSlides.length);
}

if (carouselSlides.length > 0) {
  carouselInterval = setInterval(nextSlide, 4000);
  carouselDots.forEach(dot => {
    dot.addEventListener('click', () => {
      clearInterval(carouselInterval);
      goToSlide(parseInt(dot.dataset.index));
      carouselInterval = setInterval(nextSlide, 4000);
    });
  });
}

// ===== SERVICE CARDS CAROUSEL (Dots + Drag + Autoplay) =====
document.querySelectorAll('.service-cards-carousel').forEach(carousel => {
  const track = carousel.querySelector('.service-cards-carousel__track');
  const dotsContainer = carousel.querySelector('.carousel-dots');
  const cards = Array.from(track.querySelectorAll('.service-type-card'));
  let cardIndex = 0;
  let autoplayTimer;

  function getVisibleCount() {
    if (window.innerWidth <= 768) return 1;
    if (window.innerWidth <= 1024) return 2;
    return 3;
  }

  function getMaxIndex() {
    return Math.max(0, cards.length - getVisibleCount());
  }

  function getPageCount() {
    const visible = getVisibleCount();
    return Math.ceil(cards.length / visible);
  }

  // Build dots — one per group/page
  function buildDots() {
    if (!dotsContainer) return;
    dotsContainer.innerHTML = '';
    const pages = getPageCount();
    for (let i = 0; i < pages; i++) {
      const dot = document.createElement('button');
      dot.classList.add('carousel-dot');
      if (i === 0) dot.classList.add('active');
      dot.setAttribute('aria-label', 'Grupo ' + (i + 1));
      dot.addEventListener('click', () => {
        const visible = getVisibleCount();
        cardIndex = Math.min(i * visible, getMaxIndex());
        updateCarousel();
        startAutoplay();
      });
      dotsContainer.appendChild(dot);
    }
  }

  function updateDots() {
    if (!dotsContainer) return;
    const visible = getVisibleCount();
    const currentPage = Math.floor(cardIndex / visible);
    dotsContainer.querySelectorAll('.carousel-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === currentPage);
    });
  }

  function updateCarousel(animate) {
    const visible = getVisibleCount();
    cardIndex = Math.min(cardIndex, getMaxIndex());
    // Use actual card width for precise centering
    const wrapperWidth = carousel.querySelector('.service-cards-carousel__track-wrapper').offsetWidth;
    const card = cards[0];
    const cardStyle = getComputedStyle(card);
    const cardWidth = card.offsetWidth + parseFloat(cardStyle.marginLeft) + parseFloat(cardStyle.marginRight);
    const offset = cardIndex * cardWidth;
    if (animate === false) {
      track.style.transition = 'none';
    } else {
      track.style.transition = 'transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    }
    track.style.transform = 'translateX(-' + offset + 'px)';
    updateDots();
  }

  function goNext() {
    const visible = getVisibleCount();
    cardIndex += visible;
    if (cardIndex > getMaxIndex()) cardIndex = 0;
    updateCarousel();
  }

  function startAutoplay() {
    stopAutoplay();
    autoplayTimer = setInterval(goNext, 5000);
  }

  function stopAutoplay() {
    if (autoplayTimer) clearInterval(autoplayTimer);
  }

  // Mouse drag support
  let isDragging = false;
  let startX = 0;
  let currentTranslate = 0;

  track.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.pageX;
    track.classList.add('dragging');
    stopAutoplay();
  });

  track.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    e.preventDefault();
  });

  document.addEventListener('mouseup', (e) => {
    if (!isDragging) return;
    isDragging = false;
    track.classList.remove('dragging');
    const diff = e.pageX - startX;
    if (Math.abs(diff) > 50) {
      if (diff < 0) {
        cardIndex = Math.min(cardIndex + 1, getMaxIndex());
      } else {
        cardIndex = Math.max(cardIndex - 1, 0);
      }
    }
    updateCarousel();
    startAutoplay();
  });

  // Touch drag support
  track.addEventListener('touchstart', (e) => {
    startX = e.touches[0].pageX;
    stopAutoplay();
  }, { passive: true });

  track.addEventListener('touchend', (e) => {
    const diff = e.changedTouches[0].pageX - startX;
    if (Math.abs(diff) > 50) {
      if (diff < 0) {
        cardIndex = Math.min(cardIndex + 1, getMaxIndex());
      } else {
        cardIndex = Math.max(cardIndex - 1, 0);
      }
    }
    updateCarousel();
    startAutoplay();
  });

  // Pause on hover
  carousel.addEventListener('mouseenter', stopAutoplay);
  carousel.addEventListener('mouseleave', startAutoplay);

  window.addEventListener('resize', () => {
    buildDots();
    updateCarousel(false);
  });

  // Init
  buildDots();
  updateCarousel(false);
  startAutoplay();
});

// ===== PROCESS STEPS ANIMATION (slower, more fluid) =====
const processSection = document.querySelector('.process-steps');
if (processSection) {
  const steps = processSection.querySelectorAll('.process-step');

  const processObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        steps.forEach((step, i) => {
          setTimeout(() => {
            step.classList.add('animate-in');
          }, i * 600); // Slower, more elegant sequential delay
        });
        processObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });

  processObserver.observe(processSection);
}

// ===== SCROLL REVEAL ANIMATION =====
const revealElements = document.querySelectorAll('.reveal');
if (revealElements.length > 0) {
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  revealElements.forEach(el => revealObserver.observe(el));
}

// ===== PORTFOLIO: Detect image orientation and add tall class =====
document.querySelectorAll('.portfolio-grid__item img').forEach(img => {
  img.addEventListener('load', () => {
    if (img.naturalHeight > img.naturalWidth * 1.2) {
      img.closest('.portfolio-grid__item').classList.add('portfolio-grid__item--tall');
    }
  });
  if (img.complete && img.naturalHeight > 0) {
    if (img.naturalHeight > img.naturalWidth * 1.2) {
      img.closest('.portfolio-grid__item').classList.add('portfolio-grid__item--tall');
    }
  }
});
