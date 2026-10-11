const android_init = `https://d2xmysvplj5b60.cloudfront.net/${Merchant}/channel/apk/1F1DUDG2.apk`
let apkLink = android_init
const ios_init = 'https://gec.cd8chh5r.top'
let ios = ios_init
const search = new URLSearchParams(window.location.search)
const official = '1F1DUDG2'
const channelCode = search.get('channelCode') && search.get('channelCode') !== 'null' ? search.get('channelCode') : official
const inviteCode = search.get('inviteCode') || ''
let tg = null
let sw = null
let agent = null
let loading = null

let downloadChannelCode = null
const uuid = randomString(24)

const iosClick = (ios) => {
  useTip()
  if (inviteCode) {
    window.location.href = ios + `/front/cluser/c/ios/invite/file?merchantAcct=${Merchant}&inviteCode=${inviteCode}&uuid=${uuid}`
  } else {
    window.location.href = ios + `/front/cluser/c/ios/invite/file?merchantAcct=${Merchant}&inviteCode=${channelCode}&uuid=${uuid}&codeType=agentCode`
  }
  api(channelCode || official, 3)
}

useSetting().then(res => {
  if (res) {
    useTg()
    if (window.location.href.includes('phone')) {
      loading = new Loading()
      loading.show()
      useAd()
      if (device === 'android') {
        const box = document.querySelector('.box')
        if (json && json.android && json.agent) {
          for (let index = 0; index < json.android.length; index++) {
            if (index === 2) {
              loading.hide()
              return
            }
            const img = document.createElement('img')
            img.src = `/img/phone/btn_${index + 1}.png?v=11`
            // 为 div 添加点击事件
            img.addEventListener('click', function () {
              useTip()
              // 这里可以添加其他逻辑，比如跳转到下载链接
              window.location.href = json.android[index] + (json.agent[channelCode] || json.agent[official]);
              api(channelCode || official, 2)
            });
            box.appendChild(img)
          }
        } else {
          const img = document.createElement('img')
            img.src = 'static/image/btn_1.png'
            img.addEventListener('click', function () {
              useTip()
              // 这里可以添加其他逻辑，比如跳转到下载链接
              window.location.href = android_init
              api(channelCode || official, 2)
            });
            box.appendChild(img)
        }
        loading.hide()
      } else {
        const box = document.querySelector('.box')
        if (json && json.ios && json.ios.length) {
          for (let index = 0; index < json.ios.length; index++) {
            if (index === 2) {
              loading.hide()
              return
            }
            const img = document.createElement('img')
            img.src = `/img/phone/btn_${index + 1}.png?v=11`
            img.addEventListener('click', function () {
              // 这里可以添加其他逻辑，比如跳转到下载链接
              iosClick(json.ios[index])
            });
            box.appendChild(img)
            loading.hide()
          }
        } else {
          // 没有配置数据
          const img = document.createElement('img')
          img.src = 'static/image/btn_1.png'
          img.addEventListener('click', function () {
            // 这里可以添加其他逻辑，比如跳转到下载链接
            iosClick(ios_init)
          });
          box.appendChild(img)
          loading.hide()
        }
      }
    }
  }
})

$(document).ready(async function () {
  $('body').css('height', window.innerHeight)
  api(channelCode || official, 1)

  $('.tg').on('click', function () {
    window.open(tg, '_blank')
  })

  $('.sw').on('click', function () {
    window.open(sw, '_blank')
  })

  $('.agent').on('click', function () {
    window.open(agent, '_blank')
  })

  $('.dialog').on('click', () => $('.dialog').removeClass('show'))
})

const useAd = () => {
  if (json && json.ad  && json.ad.length) {
    // 广告位渲染
    const links = document.getElementsByClassName('a-link')
    const names = document.getElementsByClassName('a-name')
    if (json.ad && links && names) {
      for (let index = 0; index < json.ad.length; index++) {
        if (json.ad[index]) {
          links[index].href = json.ad[index].url
          names[index].innerHTML = json.ad[index].label
        }
      }

      document.querySelector('.float').style.display = 'flex'
    }
  }
}

const useTg = () => {
  if (json && json.tg) {
    tg = json.tg.telegram_group
    sw = json.tg.telegram_business
    agent = json.tg.telegram_channel
  }
}

const useTest = async () => {
  try {
    downloadChannelCode = channelCode
    const url = await requestMultiple(json.ios)
    if (url) {
      ios = url
    }
  } catch (error) {
    throw error
  } finally {
    loading.hide()
  }
}

const useTip = () => {
  layer.open({ content: '应用正在下载中,十秒后无反应请再次点击下载!', skin: 'msg', time: 2 })
  $('.dialog').addClass('show')
}

// useSetting().then(res => {
//   if (res) {
//     loading = new Loading()
//     loading.show()
//     useTest()
//   }
// })

// $(async function () {
//   const downloadImg = document.querySelector('.download-img')
//   const tutorial = document.querySelector('.tutorial')
//   if (downloadImg) {
//     if (device === 'android') {
//     downloadImg.src = '/img/phone/android.png?v=8'
//       $('.download').addClass('android')
//     } else {
//     downloadImg.src = '/img/phone/ios.png?v=8'
//       $('.download').addClass('ios')
//     }
//   }
// })

// $(document).ready(async function () {
//   $('body').css('height', window.innerHeight)

//   /* ios下载 */
//   $('.ios').on('click', () => {
//     // $('.dialog').addClass('show')
//     layer.open({ content: '应用正在下载中,十秒后无反应请再次点击下载!', skin: 'msg', time: 8 })
//     if (inviteCode) {
//       window.location.href = ios + `/front/cluser/c/ios/invite/file?merchantAcct=${Merchant}&inviteCode=${inviteCode}&uuid=${uuid}`
//     } else {
//       window.location.href = ios + `/front/cluser/c/ios/invite/file?merchantAcct=${Merchant}&inviteCode=${channelCode}&uuid=${uuid}&codeType=agentCode`
//     }
//     api(channelCode || official, 3)
//   })

//   /* 安卓下载 */
//   $('.android').on('click', () => {
//     // $('.dialog').addClass('show')
//     window.location.href = apkLink
//     api(downloadChannelCode || official, 2)
//     layer.open({ content: '应用正在下载中,十秒后无反应请再次点击下载!', skin: 'msg', time: 8 })
//   })

//   // $('.dialog').on('click', () => $('.dialog').removeClass('show'))

//   api(channelCode || official, 1)

//   $('.tg').on('click', function () {
//     window.open(tg, '_blank')
//   })
//   $('.sw').on('click', function () {
//     window.open(sw, '_blank')
//   })
// })

// const useTest = async () => {
//   try {
//     const downloadImg = document.querySelector('.download-img')
//     ios = useRandom(json.ios) || ios_init
//     tg = json.tg.telegram_group
//     sw = json.tg.telegram_business
    
//     if (downloadImg) {
//       // 广告位渲染
//       const links = document.getElementsByClassName('a-link')
//       // const names = document.getElementsByClassName('a-name')

//       if (json.ad && links) {
//         for (let index = 0; index < json.ad.length; index++) {
//           if (json.ad[index]) {
//             links[index].href = json.ad[index].url
//             // names[index].innerHTML = json.ad[index].label
//           }
//         }
//       }
//     }
//     if (channelCode) {
//       if (device === 'android' && json.agent && json.android) {
//         if (json.agent && json.agent[channelCode]) {
//           const jsonLink = json.android.map(item => item + json.agent[channelCode]) // json读出来的安卓下载地址
//           const backupLink = json.android.map(item => item + `/${Merchant}/channel/apk/${official}.apk`) // 官方下载地址
//           const res = await fetchFirstSuccessfulDomain(jsonLink, backupLink, android_init)
//           if (res) {
//             apkLink = res
//           }
//         } else {
//           const backupLink = json.android.map(item => item + `/${Merchant}/channel/apk/${official}.apk`) // 官方下载地址
//           const res = await fetchFirstSuccessfulDomain(backupLink, android_init)
//           if (res) {
//             apkLink = res
//           }
//         }
//         /* 如果最后的下载链接包含官方渠道码 或者最后的下载链接等于默认链接 说明没有渠道码或者渠道码无效 */
//         if (apkLink.includes(official) || apkLink === android_init) {
//           downloadChannelCode = official
//         } else {
//           downloadChannelCode = channelCode
//         }
//       } else {
//         if (downloadImg) {
//           downloadChannelCode = channelCode
//           const url = await requestMultiple(json.ios)
//           if (url) {
//             ios = url
//           }
//         }
//       }
//     } else {
//       downloadChannelCode = official
//       if (device === 'android') {
//         if (json.android) {
//           const backupLink = json.android.map(item => item + `/${Merchant}/channel/apk/${official}.apk`) // 官方下载地址
//           const res = await fetchFirstSuccessfulDomain(backupLink)
//           if (res) {
//             apkLink = res
//           } else {
//             apkLink = android_init
//           }
//         }
//       } else {
//         if (downloadImg) {
//           const url = await requestMultiple(json.ios)
//           if (url) {
//             ios = url
//           }
//         }
//       }
//     }
//   } catch (error) {
//     throw error
//   } finally {
//     loading.hide()
//   }
// }
