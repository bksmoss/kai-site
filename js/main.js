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

// ===== SERVICE CARDS CAROUSEL =====
document.querySelectorAll('.service-cards-carousel').forEach(carousel => {
  const track = carousel.querySelector('.service-cards-carousel__track');
  const prevBtn = carousel.querySelector('.carousel-arrow--prev');
  const nextBtn = carousel.querySelector('.carousel-arrow--next');
  const cards = track.querySelectorAll('.service-type-card');
  let cardIndex = 0;

  function getVisibleCount() {
    if (window.innerWidth <= 768) return 1;
    if (window.innerWidth <= 1024) return 2;
    return 3;
  }

  function updateCarousel() {
    const visible = getVisibleCount();
    const maxIndex = Math.max(0, cards.length - visible);
    cardIndex = Math.min(cardIndex, maxIndex);
    const gap = 24; // 1.5rem
    const cardWidth = cards[0].offsetWidth + gap;
    track.style.transform = `translateX(-${cardIndex * cardWidth}px)`;
  }

  if (prevBtn && nextBtn) {
    prevBtn.addEventListener('click', () => {
      if (cardIndex > 0) {
        cardIndex--;
        updateCarousel();
      }
    });

    nextBtn.addEventListener('click', () => {
      const visible = getVisibleCount();
      const maxIndex = Math.max(0, cards.length - visible);
      if (cardIndex < maxIndex) {
        cardIndex++;
        updateCarousel();
      }
    });

    window.addEventListener('resize', updateCarousel);
  }
});

// ===== PROCESS STEPS ANIMATION (Intersection Observer) =====
const processSection = document.querySelector('.process-steps');
if (processSection) {
  const steps = processSection.querySelectorAll('.process-step');

  const processObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        steps.forEach((step, i) => {
          setTimeout(() => {
            step.classList.add('animate-in');
          }, i * 300);
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
  // For cached images
  if (img.complete && img.naturalHeight > 0) {
    if (img.naturalHeight > img.naturalWidth * 1.2) {
      img.closest('.portfolio-grid__item').classList.add('portfolio-grid__item--tall');
    }
  }
});
