$(document).ready(function () {
    const speed = 100; //transition speed - fade
    const autoSwitch = true; //auto slider options
    const autoSwitch_speed = 3000; //auto slider speed

    $(".slide").first().addClass("active");
    $(".slide").hide();

    // show only active class slide
    $(".active").show();

    if(autoSwitch == true){
        setInterval(nextSlide,autoSwitch_speed);
    }

    // Switch to next slide
    function nextSlide() {
        $('.active').removeClass('active').addClass('oldActive');
        if ($('.oldActive').is(':last-child')) {
            $('.slide').first().addClass('active');
        } else {
            $('.oldActive').next().addClass('active');
        }
        $('.oldActive').removeClass('oldActive');
        $('.slide').fadeOut(speed);
        $('.active').fadeIn(speed);
    }
});