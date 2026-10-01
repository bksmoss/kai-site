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

  const resetButton = () => {
    submitText.style.display = 'inline';
    submitLoading.style.display = 'none';
    submitBtn.disabled = false;
  };

  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Show loading
    submitText.style.display = 'none';
    submitLoading.style.display = 'inline';
    submitBtn.disabled = true;

    try {
      const dados = Object.fromEntries(new FormData(contactForm).entries());
      const resp = await fetch(contactForm.action, {
        method: 'POST',
        body: JSON.stringify(dados),
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
      });
      const corpo = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(corpo.erro || 'Não foi possível enviar agora.');

      // Hide form, show success
      contactForm.style.display = 'none';
      successEl.style.display = 'block';

      // Reset after 5 seconds
      setTimeout(() => {
        contactForm.reset();
        contactForm.style.display = 'flex';
        successEl.style.display = 'none';
        resetButton();
      }, 5000);

    } catch (err) {
      resetButton();
      alert((err && err.message ? err.message : 'Não foi possível enviar agora.') +
        '\nSe preferir, fale com a gente pelo WhatsApp: (11) 92504-9959.');
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
