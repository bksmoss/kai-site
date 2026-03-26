// Header scroll: transparent → solid
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

  // Close mobile menu on link click
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

    // Close all
    document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('active'));

    // Toggle current
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

// ===== WORK CAROUSEL =====
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
  // Auto-play every 4 seconds
  carouselInterval = setInterval(nextSlide, 4000);

  // Dot click navigation
  carouselDots.forEach(dot => {
    dot.addEventListener('click', () => {
      clearInterval(carouselInterval);
      goToSlide(parseInt(dot.dataset.index));
      carouselInterval = setInterval(nextSlide, 4000);
    });
  });
}
