const Merchant = 'sf109'

const time = new Date().getTime()

let json = null

const key = 'a3ygy47g5g22mmpg3wjp3y7sh4eg3ne2'

// 定义一个通用的 fetch 函数，带有错误处理
const fetchConfig = async (url) => {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      // 如果响应状态码不是 2xx，抛出错误
      throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(error);
    // 返回一个默认值，防止后续解密和解析失败
    return { content: '{}' };
  }
};

const useSetting = async () => {
  const urls = [
    `/conf/agent.json?t=${time}`,
    `/conf/ios.json?t=${time}`,
    `/conf/android.json?t=${time}`,
    `/conf/tg.json?t=${time}`,
    `/conf/ad.json?t=${time}`
  ];

  // 并行请求所有配置文件
  const fetchPromises = urls.map(url => fetchConfig(url));

  // 等待所有请求完成，无论成功或失败
  const results = await Promise.all(fetchPromises);

  // 定义配置的键名
  const configKeys = ['agent', 'ios', 'android', 'tg', 'ad'];

  // 初始化 json 对象
  json = {};

  // 遍历每个结果并进行解密和解析
  configKeys.forEach((keyName, index) => {
    const config = results[index];
    try {
      // 解密并解析 JSON 内容
      json[keyName] = JSON.parse(decrypt(config.content, key));
    } catch (error) {
      console.error(`Error processing ${keyName} config:`, error);
      // 如果解密或解析失败，使用默认值
      json[keyName] = keyName === 'ios' || keyName === 'android' || keyName === 'ad' ? [] : {};
    }
  });

  // 确保 json 至少是一个空对象
  json = json || {};

  // 返回 true，确保页面继续渲染
  return true;
}

// 统计
const api = (agentCode, type) =>
  fetch('/api/click', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json;charset=UTF-8' },
    body: JSON.stringify({
      merchantAcct: Merchant,
      agentCode,
      type,
    }),
  })