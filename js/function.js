window.addEventListener('DOMContentLoaded', () => {

  if (typeof Swiper === 'undefined') {
    console.warn('[message-carousel] Swiperが読み込まれていないため、このページではスキップします。');
    return;
  }

  const messageSwiper = new Swiper('.message_swiper', {

    direction: 'horizontal',
    loop: true,
    speed: 400,

    autoplay: {
      delay: 2500,
    },

    navigation: {
      nextEl: '.message .me_next',
      prevEl: '.message .me_prev',
    },


    breakpoints: {
      0: {
        slidesPerView: 1.5,
        centeredSlides: true,
        spaceBetween: 54,
      },
      801: {
        slidesPerView: 2.5,
        centeredSlides: true,
        spaceBetween: 90,

      },
    },
  });
});



document.addEventListener('DOMContentLoaded', () => {
  const qaCards = document.querySelectorAll('.QandA .qa_card');

  if (!qaCards.length) {
    console.warn('[qa-accordion] .QandA .qa_card が見つかりません。');
    return;
  }

  qaCards.forEach((card) => {
    const trigger = card.querySelector('.qa_card-q');
    if (!trigger) return;

    trigger.addEventListener('click', () => {
      const isOpen = card.classList.toggle('is-open');
      trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
  });
});


document.addEventListener('DOMContentLoaded', () => {
  const menuBt = document.querySelector('.menu_bt');
  const modalMenu = document.querySelector('.modal_menu');
  const closeBt = document.querySelector('.modal_menu_close');

  if (!menuBt || !modalMenu) {
    console.warn('[menu] .menu_bt または .modal_menu が見つかりません。');
    return;
  }

  function openMenu() {
    modalMenu.classList.add('is-open');
    menuBt.setAttribute('aria-expanded', 'true');
  }

  function closeMenu() {
    modalMenu.classList.remove('is-open');
    menuBt.setAttribute('aria-expanded', 'false');
  }

  menuBt.addEventListener('click', () => {
    const isOpen = menuBt.getAttribute('aria-expanded') === 'true';
    isOpen ? closeMenu() : openMenu();
  });

  if (closeBt) {
    closeBt.addEventListener('click', closeMenu);
  }

  modalMenu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', closeMenu);
  });
});


document.addEventListener('DOMContentLoaded', () => {
  const cards = document.querySelectorAll('.message_card');
  const modal = document.querySelector('.message_modal');
  const closeBt = document.querySelector('.message_modal_close');
  const nameEl = document.querySelector('.message_modal_name');
  const textEl = document.querySelector('.message_modal_text');

  if (!cards.length || !modal) {
    console.warn('[message-modal] 必要な要素が見つかりません。');
    return;
  }

  function openModal(name, text) {
    nameEl.textContent = name;
    textEl.textContent = text;
    modal.classList.add('is-open');
  }

  function closeModal() {
    modal.classList.remove('is-open');
  }

  cards.forEach((card) => {
    card.addEventListener('click', () => {
      // 中央（アクティブ）のカードだけモーダルを開く。
      // 端に見えている前後のカードをクリックしても何も起きない。
      const slide = card.closest('.swiper-slide');
      if (!slide || !slide.classList.contains('swiper-slide-active')) return;

      openModal(card.dataset.name, card.dataset.message);
    });
  });

  if (closeBt) {
    closeBt.addEventListener('click', closeModal);
  }


  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
});


document.addEventListener('DOMContentLoaded', () => {
  // FVの花吹雪演出
  const petalLayer = document.querySelector('.fv .petals');
  if (!petalLayer) return;

  const colors = ['#FF9EC4', '#FFC2DD', '#FFFFFF', '#FFE38A'];
  const PETAL_COUNT = 22;

  for (let i = 0; i < PETAL_COUNT; i++) {
    const petal = document.createElement('span');
    petal.className = 'petal';

    const size = 8 + Math.random() * 10; // 8px〜18px
    const left = Math.random() * 100; // %
    const duration = 6 + Math.random() * 6; // 6s〜12s
    const delay = -Math.random() * duration; // マイナス遅延で最初から画面内に散らす
    const color = colors[Math.floor(Math.random() * colors.length)];

    petal.style.left = left + '%';
    petal.style.width = size + 'px';
    petal.style.height = size + 'px';
    petal.style.background = color;
    petal.style.animationDuration = duration + 's';
    petal.style.animationDelay = delay + 's';

    petalLayer.appendChild(petal);
  }
});
