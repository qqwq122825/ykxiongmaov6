function handleImageError(imgElement) {
    imgElement.src = 'images/logo.png';
    imgElement.onerror = null;
}

function initCarousel() {
    const slides = document.querySelectorAll('.carousel-slide');
    const dots = document.querySelectorAll('.indicator-dot');
    if (!slides.length || !dots.length) return;

    let currentSlide = 0;

    function switchCarouselSlide(targetIndex) {
        slides[currentSlide].classList.remove('active');
        dots[currentSlide].classList.remove('active');
        currentSlide = targetIndex;
        slides[currentSlide].classList.add('active');
        dots[currentSlide].classList.add('active');
    }

    dots.forEach((dot, idx) => {
        dot.addEventListener('click', () => {
            switchCarouselSlide(idx);
        });
    });

    setInterval(() => {
        const nextIndex = (currentSlide + 1) % slides.length;
        switchCarouselSlide(nextIndex);
    }, 3000);
}

function initAdClose() {
    const adElement = document.getElementById('bottomAd');
    const closeBtn = document.getElementById('closeAdBtn');

    closeBtn.addEventListener('click', () => {
        adElement.style.display = 'none';
        document.body.style.paddingBottom = '0';
    });
}

function initStaticImageErrorHandler() {
    const logoImg = document.querySelector('.logo');
    if (logoImg) {
        logoImg.onerror = function() {
            handleImageError(this);
        };
    }
}

(function() {
    const jsonPath = 'hsjt188/link.json';

    if (window.location.protocol === 'file:') {
        console.warn('ERROR：本地文件协议无法读取JSON，请通过HTTP服务器访问');
        setDefaultLinkAndAd();
        return;
    }

    fetch(jsonPath, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-cache'
    })
    .then(response => {
        if (!response.ok) throw new Error('ERROR：' + response.status);
        return response.json();
    })
    .then(data => {
        const baseLink = data.baseLink || '#';
        updateAllLinks(baseLink);

        const adContent = data.adContent || '默认广告内容：अपने मोबाइल पर Ultra Play का अनुभव लें!';
        updateAdContent(adContent);
    })
    .catch(error => {
        console.error('ERROR：读取link.json失败', error);
        setDefaultLinkAndAd();
    });

    function updateAllLinks(link) {
        const links = document.querySelectorAll('a[href]');
        links.forEach(linkEl => {
            linkEl.href = link;
        });
    }

    function updateAdContent(content) {
        const adContentEl = document.getElementById('adContent');
        if (adContentEl) {
            adContentEl.textContent = content;
        }
    }

    function setDefaultLinkAndAd() {
        updateAllLinks('#');
        updateAdContent('अपने मोबाइल पर Ultra Play का अनुभव लें - हर रोज नई वेब सीरीज़ और मूवीज़!');
    }
})();

window.onload = function() {
    initCarousel();
    initAdClose();
    initStaticImageErrorHandler();
};
