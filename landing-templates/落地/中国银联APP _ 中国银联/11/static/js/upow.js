$(function(){
    //判断ie
    ieAlert();
    //导航初始化
    navigation_Init(hrefShow);
    //一级导航控制
    $("#Components-header").delegate(".nav .nav-list-1 li a","click",function () {
        $(this).parent().siblings().removeClass("selected");
        $(".nav .nav-list-2").removeClass("open");
        $(".nav .nav-list-3").removeClass("open");
        if ($(this).parent().hasClass("selected")){
            $(this).parent().removeClass("selected");
            $("#nav-cover").height(0);
            $(".page-content").height("auto");
            $("body").removeClass("body-cover");
            return false;
        }else{
            var pageHeight = window.innerHeight || Math.max(document.documentElement.clientHeight,document.body.clientHeight);
            $("#nav-cover").height(pageHeight);
            $("body").addClass("body-cover");
            $(this).parent().addClass("selected");
            var level = $(this).attr("data-level");
            var target = $(".nav .nav-list-2").find("ul[data-level='"+level+"']");
            if (target.length>0){
                target.siblings().removeClass("selected");
                target.addClass("selected");
                $(".nav .nav-list-2").addClass("open");
                return false;
            }else{
                $(".nav .nav-list-2").removeClass("open");
            }
        }
    })
    //二级导航控制
    $("#Components-header").delegate(".nav .nav-list-2 li","mouseover",function () {
        $(this).siblings().removeClass("selected");
        $(this).addClass("selected");
        var level = $(this).parent().attr("data-level");
        var index = String($(this).index()+1);
        var target = $(".nav .nav-list-3 .nav-level-3").find("."+level+"-"+index);
        if (target.length>0){
            target.siblings().removeClass("selected");
            target.addClass("selected");
            $(".nav .nav-list-3").addClass("open");
            return false;
        }else{
            $(".nav .nav-list-3").removeClass("open");
        }
    })
    //导航阴影部分控制
    $("body").delegate("#nav-cover","click",function () {
        $(this).height(0);
        $(".nav .nav-list-1 li").removeClass("selected");
        $(".nav .nav-list-2").removeClass("open");
        $(".nav .nav-list-3").removeClass("open");
        $("#nav-icon-fold").removeClass("open");
        $("#m-nav-list").hide();
        $(".m-nav-block").hide();
        $("body").removeClass("body-cover");
        $(".page-content").css({
            height:"auto",
            minHeight:"600px",
            overflow:"visible"
        })
        $(".m-footer").css("visibility","visible");
    })

    var mActionDelay =500;
    //移动端导航控制
    $("#Components-header").delegate("#nav-icon-fold","click",function () {
        if ($(this).hasClass("open")) {
            $(this).removeClass("open");
            $(".m-nav-block").hide();
            $("#m-nav-list").hide();
            $("#nav-cover").height(0);
            $(".page-content").css({
                height:"auto",
                minHeight:"600px",
                overflow:"visible"
            })
            $(".m-footer").css("visibility","visible");
        }else{
            var pageHeight = window.innerHeight;
            $("#nav-cover").height(pageHeight*1.4);
            $(".page-content").css({
                height:pageHeight*0,
                minHeight:0,
                overflow:"hidden"
            })
            $(".m-footer").css("visibility","hidden");
            $(this).addClass("open");
            $(".m-nav-block").show();
            $("#m-nav-list").show();
        }
    })

    //移动端一级导航控制
    $("#Components-header").delegate("#m-nav-list .m-nav-list-1-title","click",function () {
        var $this = $(this).parent();
        var target = $this.find(".m-nav-list-2");
        if ( $this.hasClass("on")){
            $this.removeClass("on");
            target.slideUp(mActionDelay);
            return false;
        } else{
            if (target.length>0){
                $this.siblings(".on").find(".m-nav-list-2").slideUp(mActionDelay);
                $this.siblings(".on").removeClass("on");
                $this.addClass("on");
                target.slideDown(mActionDelay)
                return false;
            }
        }
    })
    //移动端二级导航控制
    $("#Components-header").delegate("#m-nav-list .m-nav-list-2-title","click",function () {
        var $this = $(this).parent();
        var target = $this.find(".m-nav-list-3");
        if ($this.hasClass("on")){
            $this.removeClass("on");
            target.slideUp(mActionDelay);
            return false
        } else{
            if (target.length>0){
                $this.siblings(".on").find(".m-nav-list-3").slideUp(mActionDelay);
                $this.siblings(".on").removeClass("on");
                $this.addClass("on");
                target.slideDown(mActionDelay);
                return false;
            }
        }

    })

    //移动端底部导航控制
    $("#Components-footer").delegate("#m-footer-nav .footer-list-1-title","click",function () {
        var $this = $(this).parent()
        var target = $this.find(".footer-list-2");
        if( $this.hasClass("on")){
            $this.removeClass("on");
            target.slideUp(mActionDelay);
            return false;
        }else{
            if (target.length>0){
                $this.siblings(".on").find(".footer-list-2").slideUp(mActionDelay);
                $this.siblings(".on").removeClass("on");
                $this.addClass("on");
                target.slideDown(mActionDelay);
                return false;
            }
        }
    })
    
    //回到顶部
    scrollToTop();
})

//初始化导航栏
function navigation_Init(hrefShow) {
    // 如果hrefShow为0，不加载组件（用于独立落地页）
    if (hrefShow === 0) {
        console.log('独立落地页模式：已禁用header/footer组件加载');
        return;
    }
    
    var timestamp = (new Date().valueOf());

    //创建导航框架
    $.ajax({
        type:"get",
        url:webRoot+"/resources/components/header.ftl",
        async:true,
        success:function (data) {
            $("#Components-header").after(data);
            var htmlStr = "";
            htmlStr = $("#tmpl-nav-layout").tmpl(data);
            $("#Components-header").html(htmlStr);
            $.getScript(webRoot+"/resources/js/common/navigationList.js").done(function () {
                if (navigationList) {
                    var data = {
                        "top": navigationList.top,
                        "webRoot": webRoot,
						"noWebsiteRoot":noWebsiteRoot
                    };
                    //创建一级导航样式
                    htmlStr = $("#tmpl-nav-list-1").tmpl(data);
                    $(".device-pc .nav .nav-list-1").html(htmlStr);
                    //创建二级导航样式
                    htmlStr = $("#tmpl-nav-list-2").tmpl(data);
                    $(".device-pc .nav .nav-list-2 .wrapper").html(htmlStr);
                    //创建三级导航样式
                    htmlStr = $("#tmpl-nav-list-3").tmpl(data);
                    $(".device-pc .nav .nav-list-3 .wrapper .nav-level-3").html(htmlStr);
                    //创建移动端导航
                    htmlStr = $("#tmpl-nav-list-mobile").tmpl(data);
                    $("#m-nav-list").html(htmlStr);
                }
            })
        },
        error:function (data) {
            console.log(data);
        }
    });
    //创建底部框架
    $.ajax({
        type:"get",
        url:webRoot+"/resources/components/footer.ftl",
        async:true,
        success:function (data) {
            var htmlStr = "";
            $("#Components-footer").after(data);
            htmlStr = $("#tmpl-footer-layout").tmpl();
            $("#Components-footer").html(htmlStr);
            $.getScript(webRoot+"/resources/js/common/navigationList.js").done(function () {
                if (navigationList) {
                    var data = {
                        "footer": navigationList.footer,
                        "webRoot": webRoot
                    };
                    //创建footer导航
                    htmlStr = $("#tmpl-footer-list").tmpl(data);
                    $(".device-pc .footer .footer-nav-box").html(htmlStr);
                    //创建移动端footer导航
                    var t = data.footer;
                    var tmpF = [];
                    if(t.length>0){
                        var tt;
                        for(var i=0;i<t.length;i++){
                            if(t[i].name==""){
                                t[i].children.filter(function(a){
                                    tt.children.push(a);
                                });
                            }else{
                                tt = t[i];
                                tmpF.push(tt);
                            }
                        }
                    }
                    data.footer = tmpF;
                    htmlStr = $("#tmpl-m-footer-list").tmpl(data);
                    $("#m-footer-nav").html(htmlStr);

                    if(hrefShow == 0){
                        $(".device-pc").find("a").each(function(){
                            $(this).attr("href","javascript:;");
                        });
                        $("#m-nav-list").find("a").each(function(){
                            $(this).attr("href","javascript:;");
                        });
                        $("#m-footer-nav").find("a").each(function(){
                            $(this).attr("href","javascript:;");
                        });
                    }
                }
            })
        },
        error:function (data) {
            console.log(data);
        }
    });
    $.getScript(webRoot+"/resources/js/common/navigationList.js").done(function () {
        if (navigationList){
            var htmlStr = "";
            var data = {
                "top":navigationList.top,
                "webRoot":webRoot
            }

            data = {
                "footer":navigationList.footer,
                "webRoot":""
            }

        }
    })

}


//向上至页面顶部
function scrollToTop(options) {
    var defaultOption={
        showHeight:90,
        speed:1000,
        delay:200
    }
    var options = $.extend(defaultOption,options);
    $(this).scroll(function () {
        var scrollTop =  $(this).scrollTop();
        if (scrollTop >= options.showHeight){
            $(".floater").show(options.delay);
        } else{
            $(".floater").hide(options.delay);
        }
    })
    $("body").delegate("#toTop","click",function () {
        $("html,body").animate({ scrollTop:0},options.speed);
        return false;
    })
}


function ieAlert(){
    var version = $.ieVersion();
    if (version<10&&version>-1){
        var currentURL = window.location.pathname;
        if(currentURL.indexOf("index")>-1||currentURL.indexOf("newsList")>-1||currentURL.indexOf("newInfo")>-1){

        }else{
            alert("您使用的浏览器版本过低，建议您升级为IE 10及以上版本，或使用其他浏览器获得更佳浏览体验。");
        }
    }
}

