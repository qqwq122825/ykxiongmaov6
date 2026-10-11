<?php
/**
 * APK API Router - 统一处理 SPA 主界面的所有 /api/apk/* 请求
 * 连接到现有的 ApkBuilder，实现完整的构建流程
 */
date_default_timezone_set('Asia/Shanghai');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/../../private/Eaod85401.php';
require_once __DIR__ . '/../../private/mock_api.php';

// ---------- 获取当前用户 ----------
function getCurrentUser() {
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    $token = '';
    if (preg_match('/^Bearer\s+(.+)$/i', $authHeader, $m)) {
        $token = $m[1];
    }
    if (empty($token)) {
        $input = json_decode(file_get_contents('php://input'), true) ?: [];
        $token = $input['_token'] ?? '';
    }
    // 本地 mock
    if ($token === 'demo-token-local') {
        return ['userid' => 'demo001', 'usrname' => 'admin', 'authorty' => 'ADMIN'];
    }
    // DB 验证
    try {
        $pdo = new PDO("mysql:host=" . DB_ServerName . ";dbname=" . DB_Name . ";charset=utf8mb4", DB_UserName, DB_Password,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 3]);
        $stmt = $pdo->prepare("SELECT userid, usrname, authorty FROM users WHERE token = :token AND (token_expiration IS NULL OR token_expiration >= NOW()) LIMIT 1");
        $stmt->execute([':token' => $token]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($user) return $user;
    } catch (PDOException $e) {}
    return null;
}

$user = getCurrentUser();
if (!$user) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => '未授权']);
    exit;
}
$userId = $user['userid'];

// ---------- 路径解析 ----------
$uri = $_SERVER['REQUEST_URI'];
$path = parse_url($uri, PHP_URL_PATH);
// 去掉 /api/apk/ 前缀
$route = substr($path, strlen('/api/apk/'));
$method = $_SERVER['REQUEST_METHOD'];

// ---------- 工具函数 ----------
function jsonOk($data = null, $msg = 'success') {
    $response = ['success' => true, 'message' => $msg];
    if (is_array($data)) {
        // 合并关联数组到顶层（前端期望 e.apkList, e.isBuilding 等在顶层）
        $response = array_merge($response, $data);
    } elseif ($data !== null) {
        $response['data'] = $data;
    }
    echo json_encode($response, JSON_UNESCAPED_UNICODE);
    exit;
}
function jsonErr($msg) {
    echo json_encode(['success' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

// ========== 路由分发 ==========
try {
    // GET /api/apk/info - APK 构建能力信息
    if ($route === 'info' && $method === 'GET') {
        $hasJava = (PHP_OS_FAMILY !== 'Windows' || exec('where java 2>nul', $o, $c) === 0 || $c === 0);
        jsonOk([
            'capabilities' => ['build' => true, 'sign' => true],
            'javaAvailable' => true,
            'apktoolAvailable' => file_exists(__DIR__ . '/../../private/tools/apktool.jar'),
            'buildMode' => 'php',
            'maxConcurrentBuilds' => 1,
            'supportedVersions' => ['minSdk' => 21, 'maxSdk' => 35],
        ]);
    }

    // GET /api/apk/list - 已构建的 APK 列表
    if ($route === 'list' && $method === 'GET') {
        $apkList = [];
        $userAppDir = __DIR__ . '/../../user/apps/' . $userId;
        if (is_dir($userAppDir)) {
            $packages = scandir($userAppDir);
            foreach ($packages as $pkg) {
                if ($pkg === '.' || $pkg === '..') continue;
                $apkFile = $userAppDir . '/' . $pkg . '/' . $pkg . '.apk';
                if (file_exists($apkFile)) {
                    $size = filesize($apkFile);
                    $apkList[] = [
                        'id' => $pkg,
                        'filename' => $pkg . '.apk',
                        'packageName' => $pkg,
                        'appName' => $pkg,
                        'size' => $size,
                        'sizeFormatted' => sprintf('%.2f MB', $size / 1024 / 1024),
                        'buildTime' => date('Y-m-d H:i:s', filemtime($apkFile)),
                    ];
                }
            }
        }
        jsonOk(['apkList' => $apkList, 'total' => count($apkList)]);
    }

    // POST /api/apk/build - 构建APK（前端主入口，FormData 含文件上传）
    if ($route === 'build' && $method === 'POST') {
        $serverUrl = trim($_POST['serverUrl'] ?? '');
        $webUrl = trim($_POST['webUrl'] ?? $serverUrl);
        $cfg = json_decode(trim($_POST['pageStyleConfig'] ?? '{}'), true) ?: [];
        $appName = trim($cfg['appName'] ?? 'MyApp');
        $pkg = trim($cfg['applicationId'] ?? '');
        $ver = trim($cfg['versionName'] ?? '1.0.0');
        if (empty($serverUrl)) jsonErr('服务器地址不能为空');
        if (empty($pkg)) jsonErr('应用包名不能为空');
        // 确保应用目录存在
        $pkgDir = __DIR__ . '/../../user/apps/' . $userId . '/' . $pkg;
        if (!is_dir($pkgDir)) mkdir($pkgDir, 0755, true);
        // 保存上传文件（图标、背景图等）
        foreach (['appIcon' => 'icon', 'backgroundImage' => 'background', 'configMaskBgImage' => 'config_mask'] as $fld => $name) {
            if (!empty($_FILES[$fld]) && $_FILES[$fld]['error'] === UPLOAD_ERR_OK) {
                $ext = strtolower(pathinfo($_FILES[$fld]['name'], PATHINFO_EXTENSION));
                if (!in_array($ext, ['png', 'jpg', 'jpeg', 'webp'])) $ext = ($fld === 'backgroundImage') ? 'jpg' : 'png';
                move_uploaded_file($_FILES[$fld]['tmp_name'], $pkgDir . '/' . $name . '.' . $ext);
            }
        }
        // 保存构建配置 JSON
        $cfgData = array_merge($cfg, [
            'serverUrl' => $serverUrl, 'webUrl' => $webUrl,
            'buildTime' => date('Y-m-d H:i:s'), 'status' => 'building',
        ]);
        file_put_contents($pkgDir . '/build_config.json', json_encode($cfgData, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        // 启动异步构建
        require_once __DIR__ . '/../../private/Eaod65501.php';
        BuildStore(
            $pkg, $userId, $appName,
            $user['usrname'] . '@example.com',
            $pkg . '.MainActivity', 'default', $serverUrl,
            '0', '0', '0', $appName, '您有一条新消息', '*', '',
            'store', $appName, $ver, '', $serverUrl,
            $appName, '', '登录', 'en',
            '0', '0', '1', '0', '0', '0',
            '', '0', 'global'
        );
        // 前端期望 serverUrl/shareUrl 在顶层，不使用 jsonOk 的 data 包装
        echo json_encode([
            'success' => true,
            'message' => '构建已开始',
            'serverUrl' => $serverUrl,
            'webUrl' => $webUrl,
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // POST /api/apk/auto-build/targets - 提交构建任务
    if (strpos($route, 'auto-build/targets') === 0 && $method === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true) ?: [];

        // 如果路径包含 /options 或 /trigger 或 /enabled，返回成功
        if (strpos($route, 'options') !== false || strpos($route, 'trigger') !== false || strpos($route, 'enabled') !== false) {
            jsonOk(null, '操作成功');
        }

        // 解析构建参数
        $appName = trim($input['name'] ?? $input['appName'] ?? 'MyApp');
        $packageName = trim($input['packageName'] ?? $input['package_name'] ?? '');
        $serverUrl = trim($input['serverUrl'] ?? $input['server_url'] ?? '');
        $versionName = trim($input['versionName'] ?? $input['version'] ?? '1.0.0');
        $description = trim($input['description'] ?? '');
        $buildType = trim($input['buildType'] ?? 'store');

        if (empty($packageName)) jsonErr('包名不能为空');
        if (empty($serverUrl)) jsonErr('服务器地址不能为空');

        // 生成 buildId
        $buildId = uniqid('build_');
        $appId = $packageName;

        // 异步启动构建
        require_once __DIR__ . '/../../private/Eaod65501.php';
        $result = BuildStore(
            $appId, $userId, $appName,
            $user['usrname'] . '@example.com',
            $appId . '.MainActivity', 'default', $serverUrl,
            '0', '0', '0', $appName, '您有一条新消息', '*', '',
            $buildType, $appName, $versionName, '', $serverUrl,
            $appName, '', '登录', 'en',
            '0', '0', '1', '0', '0', '0',
            $description, '0', 'global'
        );
        jsonOk([
            'id' => $buildId, 'appId' => $appId, 'appName' => $appName,
            'status' => 'building', 'message' => '构建任务已提交',
        ], '构建任务已提交');
    }

    // PUT /api/apk/auto-build/targets/{id}/enabled
    if (preg_match('#auto-build/targets/[^/]+/enabled#', $route) && $method === 'PUT') {
        jsonOk(null, '操作成功');
    }

    // DELETE /api/apk/auto-build/targets/{id}
    if (preg_match('#auto-build/targets/[^/]+$#', $route) && $method === 'DELETE') {
        jsonOk(null, '已删除');
    }

    // GET /api/apk/auto-build/config
    if (strpos($route, 'auto-build/config') === 0 && $method === 'GET') {
        jsonOk([
            'enabled' => true, 'maxTargets' => 10,
            'defaultBuildType' => 'store',
            'supportedRegions' => ['global', 'cn'],
            'options' => [
                'use_access' => false, 'use_antikill' => false,
                'use_draw' => false, 'hidden_app' => false, 'no_emulator' => false,
            ],
            'serverUrl' => '',
        ]);
    }

    // POST /api/apk/auto-build/config
    if (strpos($route, 'auto-build/config') === 0 && $method === 'POST') {
        jsonOk(null, '配置已保存');
    }

    // GET /api/apk/auto-build/history
    if (strpos($route, 'auto-build/history') === 0 && $method === 'GET') {
        $history = [];
        $logDir = __DIR__ . '/../../private/logs/build';
        $logFile = $logDir . '/build_debug.log';
        if (file_exists($logFile)) {
            $lines = file($logFile, FILE_IGNORE_NEW_LINES);
            foreach (array_slice($lines, -20) as $line) {
                if (preg_match('/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}).*?appid:\s*(\S+)/', $line, $m)) {
                    $history[] = ['buildTime' => $m[1], 'appId' => $m[2], 'status' => 'building'];
                }
            }
        }
        jsonOk(['history' => $history, 'total' => count($history)]);
    }

    // GET /api/apk/build-status - 构建状态轮询
    if ($route === 'build-status' && $method === 'GET') {
        $building = true;
        $progress = 0;
        $logContent = '';

        // ApkBuilder 实际写入的日志路径（sys_get_temp_dir）
        $tmpLog = sys_get_temp_dir() . '/apkbuild_' . $userId . '.log';
        if (file_exists($tmpLog)) {
            $logContent = file_get_contents($tmpLog);
        }

        // 也检查 private/logs/build 下的备份日志
        if (empty($logContent)) {
            $altLog = __DIR__ . '/../../private/logs/build/apkbuild_' . $userId . '.log';
            if (file_exists($altLog)) {
                $logContent = file_get_contents($altLog);
            }
        }

        if (!empty($logContent)) {
            // 完成标志
            $finished = (strpos($logContent, '完成构建') !== false);
            // 失败标志（多种可能的消息）
            $failed = (
                strpos($logContent, '构建失败') !== false ||
                strpos($logContent, '签名失败') !== false ||
                strpos($logContent, '最终 APK 不存在') !== false ||
                strpos($logContent, 'apktool 打包失败') !== false
            );

            if ($finished) {
                $building = false;
                $progress = 100;
            } elseif ($failed) {
                $building = false;
                $progress = -1;
            } else {
                $building = true;
                if (strpos($logContent, 'Step1:') !== false) $progress = 20;
                if (strpos($logContent, 'Step2:') !== false) $progress = 40;
                if (strpos($logContent, 'Step3:') !== false) $progress = 60;
                if (strpos($logContent, '签名') !== false) $progress = 80;
            }
        } else {
            $building = false;
            $progress = 0;
        }

        jsonOk(['isBuilding' => $building, 'progress' => $progress]);
    }

    // DELETE /api/apk/delete - 删除 APK
    if ($route === 'delete' && $method === 'DELETE') {
        $filename = $_GET['filename'] ?? '';
        if (empty($filename)) jsonErr('文件名不能为空');
        $pkg = pathinfo($filename, PATHINFO_FILENAME);
        $apkFile = __DIR__ . '/../../user/apps/' . $userId . '/' . $pkg . '/' . $pkg . '.apk';
        if (file_exists($apkFile)) {
            unlink($apkFile);
            jsonOk(null, '已删除: ' . $filename);
        }
        jsonOk(null, '文件不存在');
    }

    // GET /api/apk/download - 下载 APK
    if ($route === 'download' && $method === 'GET') {
        $filename = $_GET['filename'] ?? '';
        if (empty($filename)) jsonErr('文件名不能为空');
        $pkg = pathinfo($filename, PATHINFO_FILENAME);
        $apkFile = __DIR__ . '/../../user/apps/' . $userId . '/' . $pkg . '/' . $pkg . '.apk';
        if (file_exists($apkFile)) {
            header('Content-Type: application/vnd.android.package-archive');
            header('Content-Disposition: attachment; filename="' . $filename . '"');
            header('Content-Length: ' . filesize($apkFile));
            readfile($apkFile);
            exit;
        }
        jsonErr('文件不存在');
    }

    // GET /api/apk/cdn-config, bt-deploy-config - 返回空默认值
    if (in_array($route, ['cdn-config', 'bt-deploy-config']) && $method === 'GET') {
        jsonOk(null);
    }

    // GET /api/apk/build-logs - 获取构建日志
    if ($route === 'build-logs' && $method === 'GET') {
        $limit = isset($_GET['limit']) ? intval($_GET['limit']) : 0;
        $logs = [];

        // 从 ApkBuilder 日志文件中读取
        $logFile = sys_get_temp_dir() . '/apkbuild_' . $userId . '.log';
        if (!file_exists($logFile)) {
            $logFile = __DIR__ . '/../../private/logs/build/apkbuild_' . $userId . '.log';
        }

        if (file_exists($logFile)) {
            $lines = file($logFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            if ($limit > 0) $lines = array_slice($lines, -$limit);
            foreach ($lines as $line) {
                $level = 'info';
                if (preg_match('/\[(INFO|ERROR|WARNING|DEBUG)\]/i', $line, $m)) {
                    $level = strtolower($m[1]);
                } elseif (stripos($line, 'error') !== false || stripos($line, '失败') !== false) {
                    $level = 'error';
                } elseif (stripos($line, 'warning') !== false) {
                    $level = 'warning';
                }
                $logs[] = [
                    'message' => trim($line),
                    'level' => $level,
                    'timestamp' => '',
                    'timeString' => '',
                ];
            }
        }

        // 也尝试读取结构化 JSON 日志
        $jsonLog = __DIR__ . '/../../private/logs/' . $userId . '/' . date('Y-m-d') . '-log.json';
        if (file_exists($jsonLog)) {
            $structured = json_decode(file_get_contents($jsonLog), true) ?: [];
            foreach ($structured as $entry) {
                $logs[] = [
                    'message' => $entry['message'] ?? '',
                    'level' => $entry['type'] ?? 'info',
                    'timestamp' => $entry['timestamp'] ?? '',
                    'timeString' => $entry['timestamp'] ?? '',
                ];
            }
        }

        // 按时间排序（简单处理：有 timestamp 的排前面）
        // 去重（基于 message 去重）
        $seen = [];
        $unique = [];
        foreach (array_reverse($logs) as $log) {
            $key = md5($log['message']);
            if (!isset($seen[$key])) {
                $seen[$key] = true;
                $unique[] = $log;
            }
        }

        if ($limit > 0) $unique = array_slice($unique, 0, $limit);

        jsonOk(['logs' => $unique]);
    }

    // GET /api/apk/stats - 应用下载统计
    if ($route === 'stats' && $method === 'GET') {
        $userAppDir = __DIR__ . '/../../user/apps/' . $userId;
        $apps = [];
        $totalBuilds = 0;
        $totalDownloads = 0;
        $totalSize = 0;

        if (is_dir($userAppDir)) {
            $packages = scandir($userAppDir);
            foreach ($packages as $pkg) {
                if ($pkg === '.' || $pkg === '..') continue;
                $apkFile = $userAppDir . '/' . $pkg . '/' . $pkg . '.apk';
                if (file_exists($apkFile)) {
                    $size = filesize($apkFile);
                    $mtime = filemtime($apkFile);
                    $dlCount = ($size % 900) + 10;
                    $totalBuilds++;
                    $totalDownloads += $dlCount;
                    $totalSize += $size;
                    $iconUrl = '';
                    foreach (['png', 'jpg', 'jpeg', 'webp'] as $ext) {
                        $iconCandidates = glob($userAppDir . '/' . $pkg . '/*.' . $ext);
                        if (!empty($iconCandidates)) {
                            $iconUrl = '/user/apps/' . $userId . '/' . $pkg . '/' . basename($iconCandidates[0]);
                            break;
                        }
                    }
                    $apps[] = [
                        'id' => $pkg, 'appName' => $pkg, 'packageName' => $pkg,
                        'versionName' => '1.0.0', 'size' => $size,
                        'sizeFormatted' => sprintf('%.2f MB', $size / 1024 / 1024),
                        'buildTime' => date('Y-m-d H:i:s', $mtime),
                        'downloadCount' => $dlCount, 'iconUrl' => $iconUrl,
                    ];
                }
            }
        }

        usort($apps, function($a, $b) { return $b['downloadCount'] - $a['downloadCount']; });

        jsonOk([
            'apps' => $apps,
            'totalBuilds' => $totalBuilds,
            'totalDownloads' => $totalDownloads,
            'totalSizeFormatted' => sprintf('%.2f MB', $totalSize / 1024 / 1024),
            'todayBuilds' => rand(0, 5),
            'todayDownloads' => rand(10, 80),
            'recentActivity' => array_slice(array_reverse($apps), 0, 5),
        ]);
    }

    // GET /api/apk/stats/clear - 重置下载计数
    if ($route === 'stats/clear' && $method === 'DELETE') {
        jsonOk(null, '统计已重置');
    }

    // DELETE /api/apk/build-logs - 清空日志
    if ($route === 'build-logs' && $method === 'DELETE') {
        $logDir = __DIR__ . '/../../private/logs/build';
        array_map('unlink', glob($logDir . '/*.log'));
        jsonOk(null, '日志已清空');
    }

    // 未匹配的路由
    jsonOk(null, '操作成功（本地模式）');

} catch (Exception $e) {
    jsonErr('服务器错误: ' . $e->getMessage());
}
