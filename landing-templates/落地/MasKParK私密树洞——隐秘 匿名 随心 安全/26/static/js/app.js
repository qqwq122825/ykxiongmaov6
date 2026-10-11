var merchantAcct = "sf160";
var merchantAcctLot = "3YWP2Z";
var keyStr = "a3ygy47g5g22mmpg3wjp3y7sh4eg3ne2";
var time = new Date().getTime();
var urls = [
  { path: "/conf/agent.json", default: null },
  { path: "/conf/ios.json", default: [] },
  { path: "/conf/android.json", default: [] },
  { path: "/conf/tg.json", default: null },
  { path: "/conf/ad.json", default: [] },
];
var search = new URLSearchParams(window.location.search);
var official = "WFUTKUDC";
var agentCode =
  search.get("channelCode") && search.get("channelCode") !== "null"
    ? search.get("channelCode")
    : official;
var inviteCode = search.get("inviteCode") || "";
var uuid = randomString(24);
// ios域名
var ios_backup = inviteCode
  ? "https://etbe.k2kxkbyw.cc/front/cluser/c/ios/invite/file?merchantAcct=" +
    merchantAcctLot +
    "&inviteCode=" +
    inviteCode +
    "&uuid=" +
    uuid
  : "https://etbe.k2kxkbyw.cc/front/cluser/c/ios/invite/file?merchantAcct=" +
    merchantAcctLot +
    "&inviteCode=" +
    agentCode +
    "&uuid=" +
    uuid +
    "&codeType=agentCode";

var iosLink = inviteCode
  ? "/front/cluser/c/ios/invite/file?merchantAcct=" +
    merchantAcctLot +
    "&inviteCode=" +
    inviteCode +
    "&uuid=" +
    uuid
  : "/front/cluser/c/ios/invite/file?merchantAcct=" +
    merchantAcctLot +
    "&inviteCode=" +
    agentCode +
    "&uuid=" +
    uuid +
    "&codeType=agentCode";

// 安卓备用下载cdn
var android_backup =
  "https://dbjsq4tdrsw5d.cloudfront.net/" +
  merchantAcctLot +
  "/channel/apk/" +
  official +
  ".apk";

var tg = null;
var sw = null;
var ad = null;
var agent = null;

function api(type) {
  var xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/click", true);
  xhr.setRequestHeader("Content-Type", "application/json");
  var data = JSON.stringify({
    merchantAcct: merchantAcctLot,
    agentCode: agentCode,
    type: type,
  });
  xhr.send(data);
}

function randomString(e) {
  e = e || 32;
  var t = "ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678";
  var a = t.length;
  var n = "";
  for (var i = 0; i < e; i++) {
    n += t.charAt(Math.floor(Math.random() * a));
  }
  return n;
}

function decrypt(word) {
  var key = CryptoJS.enc.Utf8.parse(keyStr);
  var decrypt = CryptoJS.AES.decrypt(word, key, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  });
  return JSON.parse(CryptoJS.enc.Utf8.stringify(decrypt).toString());
}

function loadJSON(url, callback) {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", url, true);
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4) {
      if (xhr.status === 200) {
        try {
          var data = JSON.parse(xhr.responseText);
          callback(null, data);
        } catch (e) {
          callback("JSON 解析失败: " + e.message, []);
        }
      } else {
        callback("文件加载失败: " + xhr.status, []);
      }
    }
  };
  xhr.onerror = function () {
    callback("网络请求失败", []);
  };
  xhr.send();
}

function extractKey(urlPath) {
  var parts = urlPath.split("/");
  var file = parts[parts.length - 1];
  return file.replace(".json", "");
}

function loadMultipleJSON(callback) {
  var resultObj = {};
  var completed = 0;
  var timestamp = Date.now();
  var total = urls.length;

  if (total === 0) {
    callback({});
    return;
  }

  for (var i = 0; i < urls.length; i++) {
    (function (item) {
      var path = item.path;
      var defaultValue = item["default"];
      var key = extractKey(path);
      resultObj[key] = defaultValue;
      var urlWithTimestamp =
        path + (path.indexOf("?") !== -1 ? "&" : "?") + "t=" + timestamp;

      loadJSON(urlWithTimestamp, function (error, data) {
        if (!error && data && data.content) {
          try {
            var decrypted = decrypt(data.content);
            resultObj[key] = decrypted || defaultValue;
            if (key === "tg" && resultObj) {
              if (resultObj.tg && resultObj.tg.telegram_business)
                sw = resultObj.tg.telegram_business;
              if (resultObj.tg && resultObj.tg.telegram_group)
                tg = resultObj.tg.telegram_group;
              if (resultObj.tg && resultObj.tg.telegram_channel)
                agent = resultObj.tg.telegram_channel;
            }
          } catch (e) {}
        }

        completed++;
        if (completed === total) {
          callback && callback(resultObj);
        }
      });
    })(urls[i]);
  }
}

function useList(arr, device, agentData) {
  if (device === "android") {
    var link = agentData[agentCode]
      ? agentData[agentCode]
      : agentData[official];
    switch (arr.length) {
      case 1:
        return [arr[0] + link, arr[0] + link, android_backup];
      case 2:
        return [arr[0] + link, arr[1] + link, android_backup];
      case 3:
        return [arr[0] + link, arr[1] + link, arr[2] + link];
      default:
        return [android_backup, android_backup, android_backup];
    }
  } else {
    switch (arr.length) {
      case 1:
        return [arr[0] + iosLink, arr[0] + iosLink, ios_backup];
      case 2:
        return [arr[0] + iosLink, arr[1] + iosLink, ios_backup];
      case 3:
        return [arr[0] + iosLink, arr[1] + iosLink, arr[2] + iosLink];
      default:
        return [ios_backup, ios_backup, ios_backup];
    }
  }
}

function RenderButtons(data, device) {
  var arr = useList(data[device].slice(0, 3), device, data.agent);
  var imgs1 = document.querySelectorAll(".download");
  var imgs2 = document.querySelectorAll(".download1");
  var imgs = [...imgs1, ...imgs2];
  imgs.forEach((btn, index) => {
    const url = arr[index % arr.length];
    btn.setAttribute("data-url", url);
  });
  for (var index = 0; index < imgs.length; index++) {
    (function (link) {
      imgs[index].addEventListener("click", function () {
        // document.querySelector('.dialog').className = 'dialog show'
        layer.open({
          content: "应用正在下载中,十秒后无反应请再次点击下载!",
          skin: "msg",
          time: 8,
        });
        api(device === "android" ? 2 : 3);
        window.location.href = link;
      });
    })(arr[index]);
  }
  // imgs[0].click()
}

function RenderAd(ad) {
  var links = document.getElementsByClassName("a-link");
  var names = document.getElementsByClassName("a-name");
  for (var i = 0; i < ad.length; i++) {
    if (ad[i]) {
      links[i].href = ad[i].url;
      names[i].innerHTML = ad[i].label;
    }
  }
}

window.addEventListener("load", function () {
  var swBtn = document.querySelector(".sw");
  if (swBtn) {
    swBtn.addEventListener("click", function () {
      window.open(sw, "_blank");
    });
  }

  var tgBtn = document.querySelector(".tg");
  if (tgBtn) {
    tgBtn.addEventListener("click", function () {
      window.open(tg, "_blank");
    });
  }

  var agentBtn = document.querySelector(".agent");
  if (agentBtn) {
    agentBtn.addEventListener("click", function () {
      window.open(agent, "_blank");
    });
  }

  var docBtn = document.querySelector(".doc");

  if (docBtn) {
    docBtn.addEventListener("click", function () {
      window.open("/doc.html", "_self");
    });
  }

  var dialog = document.querySelector(".dialog");
  if (dialog) {
    dialog.addEventListener("click", function () {
      dialog.className = "dialog";
    });
  }
});
