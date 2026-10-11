const device =
    window.navigator.userAgent.indexOf('Android') > -1 ? 'android' : 'ios'

const useRandom = array => {
    // 生成一个介于 0 和 array.length 之间的随机整数
    const randomIndex = Math.floor(Math.random() * array.length)
    // 返回对应索引的元素
    return array[randomIndex]
}

function randomString(e) {
    e = e || 32
    let t = 'ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678',
        a = t.length,
        n = ''
    for (let i = 0; i < e; i++) n += t.charAt(Math.floor(Math.random() * a))
    return n
}

function decrypt(word, keyStr) {
    keyStr = keyStr ? keyStr : 'GcgzsKdDZTumABNz7uujrCfPIk9TQ355'
    var key = CryptoJS.enc.Utf8.parse(keyStr)
    var decrypt = CryptoJS.AES.decrypt(word, key, {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.Pkcs7,
    })
    return CryptoJS.enc.Utf8.stringify(decrypt).toString()
}

// 创建一个请求带有超时的函数，并设置 mode: 'no-cors'
function fetchWithTimeout(url, options = {}, timeout = 2000) {
    const fetchOptions = {
        ...options,
        mode: 'no-cors', // 设置 no-cors 模式
        cache: 'no-store',
        // method: 'HEAD'
    }

    return Promise.race([
        fetch(url, fetchOptions),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('请求超时')), timeout)
        ),
    ])
}

// 同时请求多个接口
async function requestMultiple(endpoints) {
    const abortController = new AbortController()
    const options = {
        signal: abortController.signal,
    }

    // 使用一个标志位来避免多次请求成功
    let isResolved = false

    const requests = endpoints.map(endpoint =>
        fetchWithTimeout(endpoint, options)
            .then(response => {
                if (!isResolved) {
                    isResolved = true
                    // 一旦一个请求完成，取消所有未完成的请求
                    abortController.abort()
                    return endpoint // 返回成功请求的接口
                }
            })
            .catch(error => {
                if (!isResolved) {
                    return Promise.reject(error)
                }
            })
    )

    try {
        // 使用 Promise.any 等待第一个成功的请求并返回成功的接口
        const successfulEndpoint = await Promise.any(requests)
        return successfulEndpoint
    } catch (error) {
        return null
    }
}

class Loading {
    constructor() {
        this.dom = this.createLoading()
    }
    createLoading() {
        //新建一个div元素节点
        var div = document.createElement('div')
        div.id = 'loading-box'
        this.addNewStyle(
            '#loading-box { width: 100%; height: 100%; position: absolute; top: 0; left: 0; z-index: 9999; background: #ffffff80; display: none; align-items: center; justify-content: center; }'
        )

        // 创建动效
        var loadingDiv = document.createElement('div')
        loadingDiv.className = 'loading'
        this.addNewStyle(
            '.loading { position: relative; width: 50px; height: 50px; border: 2px solid #000; border-top-color: rgba(0, 0, 0, 0.2);border-right-color: rgba(0, 0, 0, 0.2);border-bottom-color: rgba(0, 0, 0, 0.2);border-radius: 100%;animation: circle infinite 0.75s linear; }'
        )
        this.addNewStyle(
            '@keyframes circle { 0% { transform: rotate(0);} 100% { transform: rotate(360deg);}}'
        )

        div.appendChild(loadingDiv)
        //把div元素节点添加到body元素节点中成为其子节点，但是放在body的现有子节点的最后
        document.body.appendChild(div)
        return div
    }
    addNewStyle(newStyle) {
        var styleElement = document.getElementById('styles_js')
        if (!styleElement) {
            styleElement = document.createElement('style')
            styleElement.type = 'text/css'
            styleElement.id = 'styles_js'
            document.getElementsByTagName('head')[0].appendChild(styleElement)
        }
        styleElement.appendChild(document.createTextNode(newStyle))
    }
    show() {
        this.dom.style.display = 'flex'
    }
    hide() {
        this.dom.style.display = 'none'
    }
}

// 创建 Blob 对象的函数，包含兼容性处理
function createBlob(content, mimeType) {
    if (window.Blob) {
        try {
            return new Blob([content], { type: mimeType });
        } catch (e) {
            // 某些浏览器（如旧版 Firefox）需要使用 BlobBuilder
            var BlobBuilder = window.BlobBuilder || window.WebKitBlobBuilder || window.MozBlobBuilder || window.MSBlobBuilder;
            if (BlobBuilder) {
                var builder = new BlobBuilder();
                builder.append(content);
                return builder.getBlob(mimeType);
            } else {
                throw new Error('浏览器不支持 Blob 或 BlobBuilder');
            }
        }
    } else {
        throw new Error('浏览器不支持 Blob');
    }
}


// 触发下载的函数
function downloadFile(blob, filename) {
    if (window.navigator && window.navigator.msSaveOrOpenBlob) {
        // 兼容 IE10+
        window.navigator.msSaveOrOpenBlob(blob, filename);
    } else {
        // 其他现代浏览器
        var link = document.createElement('a');
        var url = window.URL.createObjectURL(blob);
        link.href = url;
        link.download = filename;

        // 兼容 Firefox，需要将链接添加到 DOM 中
        document.body.appendChild(link);
        link.click();

        // 清理
        setTimeout(function () {
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        }, 100);
    }
}

async function fetchFirstSuccessfulDomain(domains, backupDomains, defaultUrl) {
    const controllers = []; // 存储所有 AbortController 实例

    /**
     * 使用 fetch 发送 HEAD 请求，并添加超时机制
     * @param {string} url - 要请求的URL
     * @returns {Promise<string>} - 成功时返回URL，失败时抛出错误或超时后返回默认地址
     */
    const fetchHead = async (url) => {
        const controller = new AbortController();
        controllers.push(controller);

        // 创建一个超时的 Promise
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                controller.abort(); // 取消请求
                reject(new Error('Request timeout')); // 触发超时错误
            }, 2000); // 超时设为 2 秒
        });

        // 结合 fetch 请求和超时 Promise
        try {
            const response = await Promise.race([
                fetch(url, {
                    method: 'HEAD',
                    signal: controller.signal, // 用于取消请求
                }),
                timeoutPromise
            ]);

            if (response.ok) {
                return url; // 成功时返回URL
            } else {
                throw new Error(`请求失败，状态码: ${response.status}`);
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                // 请求被取消，忽略
            } else {
                throw error;
            }
        }
    };

    /**
     * 取消所有未完成的请求
     */
    const abortAllRequests = () => {
        controllers.forEach(controller => controller.abort());
    };

    /**
     * 并发请求多个域名
     * @param {string[]} urls - 域名数组
     * @returns {Promise<string>} - 返回第一个成功的URL或抛出错误
     */
    const fetchDomains = async (urls) => {
        return Promise.any(urls.map(url => fetchHead(url)));
    };

    try {
        // 并发请求第一个域名数组，返回第一个成功的域名
        const fastestDomain = await fetchDomains(domains);

        // 如果有一个成功的请求，取消其他请求
        abortAllRequests();
        return fastestDomain;
    } catch {
        // 如果第一个域名数组都失败，继续并发请求备用域名
        if (backupDomains) {
            try {
                const backupResult = await fetchDomains(backupDomains);

                // 如果有一个成功的请求，取消其他请求
                abortAllRequests();
                return backupResult;
            } catch {
                // 如果备用域名也不通，返回默认地址
                return defaultUrl;
            }
        } else {
            return defaultUrl;
        }
    }
}




