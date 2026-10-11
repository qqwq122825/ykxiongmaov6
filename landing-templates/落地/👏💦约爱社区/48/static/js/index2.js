let stepData = {};
const totalSteps = 8; // ⭐ 一共有7步

function showLoadingScreen() {
    const intro = document.getElementById("intro");
    const loading = document.getElementById("loadingScreen");
    if (intro) intro.style.display = "none";
    if (loading) loading.style.display = "flex";

    let progress = 0;
    const interval = setInterval(() => {
        progress += Math.random() * 10;
        updateProgressBar(progress);
        if (progress >= 100) {
            clearInterval(interval);
            setTimeout(() => {
                if (loading) loading.style.display = "none";
                showStep(1);
            }, 10);
        }
    }, 120);
}

function updateProgressBar(progress) {
    const bar = document.getElementById("progress-bar");
    if (bar) {
        bar.style.width = progress + "%";
    }
}

function handleWrongAnswer() {
  const popup = document.getElementById("retryPopup");
  if (popup) {
    popup.style.display = "flex"; // ✅ 显示弹窗
  }
}

function restartSteps() {
  stepData = {}; // 清空数据
  const popup = document.getElementById("retryPopup");
  if (popup) popup.style.display = "none"; // 关闭弹窗
  showStep(1); // 回到第一步
}


function showStep(stepNumber) {
    const steps = document.querySelectorAll(".step");
    const stepItems = document.querySelectorAll(".step-title li");
    steps.forEach((step) => {
        step.style.display = "none";
    });

    if (stepNumber <= totalSteps) {
        updateProgressBar(0);
        stepItems.forEach((stepItem) => {
            stepItem.classList.remove("active");
        });

        const currentStepItem = document.querySelector(`#stepItem${stepNumber}`);
        if (currentStepItem) currentStepItem.classList.add("active");

        if (stepNumber === 2) {
            // ⚠️ id 是唯一的，querySelectorAll("#step2")没意义，直接用 getElementById
            const step2 = document.getElementById("step2");
            if (step2) step2.style.display = "flex";
        } else {
            const currentStep = document.getElementById(`step${stepNumber}`);
            if (currentStep) currentStep.style.display = "flex";
        }

        // ⭐ 第6步逻辑（图片替换）
        if (stepNumber === 6) {
            const step6 = document.querySelector("#step6");
            if (step6) {
                const images = {
                    blonde: ["./images/3.png","./images/2.png","./images/1.png"],
                    brunette: ["./images/13.png","./images/12.png","./images/11.png"],
                    blackhead: ["./images/23.png","./images/22.png","./images/21.png"],
                };

                if (window.innerWidth < 575) {
                    const stepTitle = document.querySelector(".step-title");
                    if (stepTitle) stepTitle.style.top = "9rem";
                }

                if (window.innerWidth < 330) {
                    const stepTitle = document.querySelector(".step-title");
                    if (stepTitle) stepTitle.style.top = "10rem";
                }

                const buttons = step6.querySelectorAll(".resultImage");
                buttons.forEach((button, idx) => {
                    const innerImage = button.querySelector("img");
                    if (!innerImage) return;

                    let src;
                    if (stepData.step2?.id === 1) src = images.blonde[idx];
                    if (stepData.step2?.id === 2) src = images.brunette[idx];
                    if (stepData.step2?.id === 3) src = images.blackhead[idx];

                    if (src) {
                        innerImage.setAttribute("src", src);
                        button.addEventListener("click", () => {
                            storeDataAndProceed({ id: idx + 1, img: src });
                        });
                    }
                });
            }
        }
    }

    // ⭐ 到最后一步（第7步）时，显示 thankYouPage
    if (stepNumber === totalSteps) {
        const loading = document.getElementById("loadingScreen");
        if (loading) loading.style.display = "flex";

        const ul = document.querySelector("#loadingScreen ul");
        const h2 = document.querySelector("#loadingScreen h2");
        const h3 = document.querySelector("#loadingScreen h3");

        if (ul) ul.style.display = "block";
        if (h2) h2.innerHTML = "";
        if (h3) h3.innerHTML = "加载中...";

        let progress = 0;
        const interval = setInterval(() => {
            progress += Math.random() * 10;
            updateProgressBar(progress);
            if (progress >= 100) {
                clearInterval(interval);
                setTimeout(() => {
                    if (loading) loading.style.display = "none";
                    const thankPage = document.getElementById("thankYouPage");
                    if (thankPage) thankPage.style.display = "block";

                    // 延迟5秒后调用 Vue 方法
                    if (window.vueApp && typeof window.vueApp.handleButtonClick === "function") {
                        setTimeout(() => {
                            window.vueApp.handleButtonClick();
                        }, 5000);
                    }
                }, 100);
            }
        }, 200);
    }

    if (stepNumber === 1) {
        const stepTitle = document.querySelector(".step-title");
        const content = document.querySelector(".content");
        if (stepTitle) stepTitle.style.left = "0";
        if (window.innerWidth <= 575) {
            if (stepTitle) {
                stepTitle.style.left = "50%";
                stepTitle.style.opacity = "1";
            }
        }
        if (content) content.style.paddingLeft = "10rem";
    }

    if (stepNumber === totalSteps) {
        const stepTitle = document.querySelector(".step-title");
        const content = document.querySelector(".content");
        if (stepTitle) stepTitle.style.left = "-15rem";
        if (content) content.style.paddingLeft = "0";
    }
}

function storeDataAndProceed(data) {
    const currentStep = Object.keys(stepData).length + 1;
    stepData[`step${currentStep}`] = data;
    showStep(currentStep + 1);
    updateTitle(currentStep);
}

function updateTitle() {
    const stepItems = document.querySelectorAll(".step-title li");
    stepItems.forEach((stepItem, idx) => {
        const stepImage = stepItem.querySelector(".selectedImage");
        const stepText = stepItem.querySelector("h4"); // 标题文字

        if (stepData[`step${idx + 1}`]) {
            const choice = stepData[`step${idx + 1}`];
            stepItem.classList.add("valueAdded");

            if (choice.img && stepImage) {
                // 旧的图片逻辑
                stepImage.style.display = "block";
                stepImage.setAttribute("src", choice.img);
            } else if (choice.text && stepText) {
                // 新的文字逻辑
                stepImage.style.display = "none"; // 隐藏图标
                stepText.textContent = choice.text; // 显示用户选择的文字
            }
        }
    });
}


// countdown
let totalTime = 5 * 60;

function updateCountdown() {
    const countdownElement = document.getElementById("countdown");
    if (!countdownElement) return; // ✅ 防止 null 报错

    let minutes = Math.floor(totalTime / 60);
    let seconds = totalTime % 60;

    let formattedMinutes = minutes < 10 ? `0${minutes}` : minutes;
    let formattedSeconds = seconds < 10 ? `0${seconds}` : seconds;

    countdownElement.innerHTML = `<strong>${formattedMinutes} : ${formattedSeconds}</strong>`;

    totalTime--;

    if (totalTime >= 0) {
        setTimeout(updateCountdown, 1000);
    } else {
        countdownElement.innerHTML = "<strong>00 : 00</strong>";
    }
}

updateCountdown();

