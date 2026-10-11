// 彈窗
function PopUp({
  title = "",
  content = "",
  confirm = true,
  cancel = false,
  confirmCallback = null,
  cancelCallback = null,
  overlay = true,
  overlayClose = false,
}) {
  var popHtml = `
    <div class="pop-content fixed inset-0 flex justify-center items-center z-[100]">
      <div class="overlay absolute w-full h-full bg-lu-black/70 -z-[1]"></div>
      <div class="w-[260px] bg-[#181818] shadow-[0_1px_2px_0_black]">
        <div class="pt-[25px] pb-[15px] px-[15px]">
          <h3 class="title mb-4 text-xl text-white font-medium"></h3>
          <p class="des text-white text-sm"></p>
        </div>
        <div class="flex text-center border-t border-white/30">
          <div class="cancel relative flex-1 text-gray-400 px-2.5 py-3.5 text-sm border-r border-white/30 cursor-pointer hidden">取消</div>
          <div class="confirm relative flex-1 text-lutube px-2.5 py-3.5 text-sm cursor-pointer">确定</div>
        </div>
      </div>
    </div>
  `;

  var popUp = $(popHtml);
  if (!overlay) popUp.find(".overlay").remove();
  if (cancel) popUp.find(".cancel").removeClass("hidden");
  if (typeof cancel === "string") popUp.find(".cancel").html(cancel);
  if (typeof confirm === "string") popUp.find(".confirm").html(confirm);
  if (title) popUp.find(".title").html(title);
  if (content) popUp.find(".des").html(content);

  if (overlay && overlayClose) popUp.find(".overlay").on("click", close);

  popUp.find(".confirm").on("click", function () {
    if (confirmCallback && typeof confirmCallback === "function")
      confirmCallback();
    close();
  });

  popUp.find(".cancel").on("click", function () {
    if (cancelCallback && typeof cancelCallback === "function")
      cancelCallback();
    close();
  });

  function close() {
    $("body").removeClass("overflow-hidden");
    popUp.remove();
  }

  $("body").addClass("overflow-hidden");
  $("body").append(popUp);
}
