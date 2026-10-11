$(document).ready(function () {
    const fullUrl = window.location.href;
    var ref = '';
    if (document.referrer.length > 0) {
        ref = document.referrer;
    }
    try {
        if (ref.length == 0 && opener.location.href.length > 0) {
            ref = opener.location.href;
        }
    } catch (e) { }
    function getDeviceType() {
        const userAgent = navigator.userAgent.toLowerCase() || navigator.vendor || window.opera;
        if (Boolean(userAgent.match(/android|mobile|pad/i) && Boolean(userAgent.match(/ipad/i)) === false && Boolean(userAgent.match(/mac/i)) === false)) {
            return 'Android';
        }
        if (Boolean(userAgent.match(/iphone/i))) {
            return 'iOS';
        }
        if (Boolean(userAgent.match(/ipad|pad/i))) {
            return 'pad';
        }
        if (Boolean(userAgent.match(/mobile|android|iphone/i)) === false) {
            return 'PC'
        }
        return 'Unknown';
    }

    const deviceType = getDeviceType();

    let swiper = new Swiper(".mySwiper", {
        direction: "vertical",
        slidesPerView: 1,
        spaceBetween: 30,
        mousewheel: true,
        autoplay: true,
        pagination: {
            el: ".swiper-pagination",
            clickable: true,
        },
    });

    if (deviceType == 'PC' || deviceType == 'pad') {
        $(".qr").each(function () {
            $(this).qrcode({
                correctLevel: 1,
                text: location.href,
            });
        });
    }


    $('.setup-tips').on('click', function () {
        $('#platform-list').fadeIn().css('display', 'flex');
    });

    $('.platform-item').on('click', function () {
        const imgSrc = $(this).data('src');
        const imgSrc2 = $(this).data('src2');
        const platformDetail = $('#platform-detail')
        platformDetail.find('.modal-common-img').remove();
        platformDetail.find('.modal-common-img-2').remove();
        if (imgSrc) {
            const img1 = $('<img>', {
                class: 'modal-common-img',
                src: imgSrc
            });
            platformDetail.append(img1);
        }
        if (imgSrc2) {
            const img2 = $('<img>', {
                class: 'modal-common-img-2',
                src: imgSrc2
            });
            platformDetail.append(img2);
        }
        platformDetail.fadeIn().css('display', 'flex');
    });

    $('.android-modal-arrow').on('click', function () {
        const type = $(this).data('type')
        if (type === 1) {
            $('#platform-list').fadeOut()
        }
        if (type === 2) {
            $('#platform-detail').fadeOut();
            const platformDetail = $('#platform-detail');
            platformDetail.find('.modal-common-img').remove();
            platformDetail.find('.modal-common-img-2').remove();
        }
        if (type === 3) {
            $('#ios-detail').fadeOut();
        }
    });



});
