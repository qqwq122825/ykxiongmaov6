(function () {
    'use strict';

    function $(id) { return document.getElementById(id); }

    function initNav() {
        var toggle = $('nav-toggle');
        var nav = $('main-nav');
        var overlay = $('nav-overlay');
        if (!toggle || !nav || !overlay) return;

        function open() {
            nav.classList.add('is-open');
            overlay.classList.add('is-open');
            toggle.setAttribute('aria-expanded', 'true');
        }
        function close() {
            nav.classList.remove('is-open');
            overlay.classList.remove('is-open');
            toggle.setAttribute('aria-expanded', 'false');
        }
        toggle.addEventListener('click', function () {
            nav.classList.contains('is-open') ? close() : open();
        });
        overlay.addEventListener('click', close);
        nav.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', close); });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') close();
        });
    }

    function initSearch() {
        var wrap = $('search');
        var input = $('search-input');
        var openBtn = $('mobile-search-toggle');
        var closeBtn = $('search-close');
        if (!wrap || !input) return;

        function open() { wrap.classList.add('is-open'); input.focus(); }
        function close() {
            wrap.classList.remove('is-open');
            input.blur();
        }
        if (openBtn) openBtn.addEventListener('click', open);
        if (closeBtn) closeBtn.addEventListener('click', close);
    }

    function initCarousels() {
        document.querySelectorAll('.carousel').forEach(function (carousel) {
            var track = carousel.querySelector('.carousel__track');
            var prev = carousel.querySelector('.carousel__btn--prev');
            var next = carousel.querySelector('.carousel__btn--next');
            if (!track) return;

            function update() {
                var max = track.scrollWidth - track.clientWidth - 1;
                if (prev) prev.hidden = track.scrollLeft <= 0;
                if (next) next.hidden = track.scrollLeft >= max;
            }
            function stride() {
                var c = track.children;
                if (c.length > 1) { var s = c[1].offsetLeft - c[0].offsetLeft; if (s > 0) return s; }
                return c.length ? c[0].offsetWidth : 200;
            }
            function page(dir) {
                var st = stride();
                var per = Math.max(1, Math.floor(track.clientWidth / st)) * st;
                track.scrollBy({ left: dir * per, behavior: 'smooth' });
            }
            if (prev) prev.addEventListener('click', function () { page(-1); });
            if (next) next.addEventListener('click', function () { page(1); });
            track.addEventListener('scroll', update, { passive: true });
            window.addEventListener('resize', update);
            update();

            var down = false, moved = false, startX = 0, startScroll = 0, vel = 0, lastX = 0, lastT = 0;
            track.addEventListener('pointerdown', function (e) {
                if (e.pointerType === 'touch' || e.button !== 0) return;
                down = true; moved = false; vel = 0;
                startX = lastX = e.clientX; startScroll = track.scrollLeft; lastT = e.timeStamp;
            });
            track.addEventListener('pointermove', function (e) {
                if (!down) return;
                var dx = e.clientX - startX;
                if (!moved && Math.abs(dx) > 5) { moved = true; track.classList.add('is-dragging'); }
                if (!moved) return;
                track.scrollLeft = startScroll - dx;
                var dt = e.timeStamp - lastT;
                if (dt > 0) { vel = (e.clientX - lastX) / dt; lastX = e.clientX; lastT = e.timeStamp; }
            });
            function release() {
                if (!down) return;
                down = false;
                track.classList.remove('is-dragging');
                if (moved && Math.abs(vel) > 0.1) {
                    track.scrollBy({ left: -vel * 180, behavior: 'smooth' });
                }
                update();
            }
            track.addEventListener('pointerup', release);
            track.addEventListener('pointercancel', release);
            track.addEventListener('pointerleave', release);
            track.addEventListener('click', function (e) {
                if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; }
            }, true);
            track.addEventListener('dragstart', function (e) { e.preventDefault(); });
        });
    }

    function initHero() {
        var hero = document.querySelector('.hero');
        if (!hero) return;
        var slides = Array.prototype.slice.call(hero.querySelectorAll('.hero-slide'));
        var dots = Array.prototype.slice.call(hero.querySelectorAll('.hero-dot'));
        if (slides.length < 2) return;

        var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        var DURATION = 6500;
        var idx = Math.max(0, slides.findIndex(function (s) { return s.classList.contains('is-active'); }));
        var timer = null;

        function show(n) {
            var next = (n + slides.length) % slides.length;
            if (next === idx) return;
            slides[idx].classList.remove('is-active');
            slides[idx].setAttribute('aria-hidden', 'true');
            if (dots[idx]) { dots[idx].classList.remove('is-active'); dots[idx].removeAttribute('aria-selected'); }
            idx = next;
            slides[idx].classList.add('is-active');
            slides[idx].removeAttribute('aria-hidden');
            if (dots[idx]) { dots[idx].classList.add('is-active'); dots[idx].setAttribute('aria-selected', 'true'); }
        }
        function start() { if (reduce) return; stop(); timer = setInterval(function () { show(idx + 1); }, DURATION); }
        function stop() { if (timer) { clearInterval(timer); timer = null; } }

        var nextBtn = hero.querySelector('.hero-arrow--next');
        var prevBtn = hero.querySelector('.hero-arrow--prev');
        if (nextBtn) nextBtn.addEventListener('click', function () { show(idx + 1); start(); });
        if (prevBtn) prevBtn.addEventListener('click', function () { show(idx - 1); start(); });
        dots.forEach(function (d, i) { d.addEventListener('click', function () { show(i); start(); }); });

        var startX = 0, startY = 0, swiping = false;
        hero.addEventListener('pointerdown', function (e) {
            if (e.target.closest('a, button')) return;
            startX = e.clientX; startY = e.clientY; swiping = true;
        });
        hero.addEventListener('pointerup', function (e) {
            if (!swiping) return;
            swiping = false;
            var dx = e.clientX - startX, dy = e.clientY - startY;
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { show(idx + (dx < 0 ? 1 : -1)); start(); }
        });
        hero.addEventListener('pointercancel', function () { swiping = false; });

        hero.addEventListener('mouseenter', stop);
        hero.addEventListener('mouseleave', start);
        hero.addEventListener('focusin', stop);
        hero.addEventListener('focusout', start);
        document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
        start();
    }

    function init() {
        initNav();
        initSearch();
        initCarousels();
        initHero();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
