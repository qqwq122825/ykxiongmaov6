<?php

session_start();
require_once 'Eaod14881.php';

// ========== 防入侵：管理员入口门控 ==========
if (defined('ADMIN_PATH') && ADMIN_PATH !== '') {
    if (empty($_SESSION['admin_gate_ok']) && empty($_SESSION['admin_logged_in'])) {
        $key = $_GET['key'] ?? '';
        if ($key === ADMIN_PATH) {
            $_SESSION['admin_gate_ok'] = true;
        } else {
            http_response_code(404);
            exit('Not Found');
        }
    }
}

// ========== 防入侵：IP 白名单（可选） ==========
if (defined('ADMIN_IP_WHITELIST') && ADMIN_IP_WHITELIST !== '') {
    $whitelist = array_map('trim', explode(',', ADMIN_IP_WHITELIST));
    $visitor = function_exists('getClientIP') ? getClientIP() : ($_SERVER['REMOTE_ADDR'] ?? '');
    if (!in_array($visitor, $whitelist)) {
        http_response_code(403);
        exit('Forbidden');
    }
}

// ========== 防入侵：登录失败锁定 ==========
if (function_exists('getClientIP')) {
    $clientIp = getClientIP();
    if (function_exists('isBlocked') && isBlocked($clientIp)) {
        http_response_code(429);
        exit('Too Many Requests');
    }
}

// Login validation
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $admin_key = $_POST['admin_key'] ?? '';
    
    if (function_exists('getClientIP') && function_exists('BadLogin') && function_exists('isSus')) {
        $clientIp = getClientIP();
        BadLogin($clientIp, 'admin_login');
        if (isSus($clientIp, 'admin_login')) {
            http_response_code(429);
            exit('Too Many Requests');
        }
    }
    
    if ($admin_key === Admin_Key) {
        $_SESSION['admin_logged_in'] = true;
        $_SESSION['admin_gate_ok'] = true;
        $redirect = 'create.php';
        if (defined('ADMIN_PATH') && ADMIN_PATH !== '') {
            $redirect .= '?key=' . urlencode(ADMIN_PATH);
        }
        header('Location: ' . $redirect);
        exit();
    } else {
        $error = '管理员密钥错误';
    }
}

$loginUrl = 'login.php';
if (defined('ADMIN_PATH') && ADMIN_PATH !== '') {
    $loginUrl .= '?key=' . urlencode(ADMIN_PATH);
}
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Panel</title>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20,400,0,0" />
    <style>
        * {
            -webkit-tap-highlight-color: rgba(0, 0, 0, 0);
            -webkit-tap-highlight-color: transparent;
            -webkit-user-select: none;
            -khtml-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
            user-select: none;
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        .material-symbols-outlined {
            font-size: 16px;
            vertical-align: -3px;
            margin-right: 3px;
            font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20;
        }

        @keyframes fadeSlideIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        body {
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: #fff;
            color: #333;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            font-size: 14px;
        }

        .login-container {
            background: transparent;
            padding: 0;
            border-radius: 0;
            border: none;
            box-shadow: none;
            width: 100%;
            max-width: 320px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            animation: fadeSlideIn 0.4s cubic-bezier(0.4, 0, 0.2, 1) both;
        }

        .login-container h2 {
            text-align: center;
            margin-bottom: 20px;
            color: #1a1a1a;
            font-size: 18px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .login-container h2 .material-symbols-outlined {
            font-size: 20px;
            color: #888;
        }

        .login-container input {
            width: 100%;
            padding: 8px 10px;
            margin: 6px 0;
            border: 1px solid #d0d0d0;
            border-radius: 3px;
            font-size: 13px;
            color: #333;
            background: #fff;
            transition: border-color 0.25s ease, box-shadow 0.25s ease;
        }

        .login-container input:focus {
            outline: none;
            border-color: #555;
            box-shadow: 0 1px 0 0 #555;
        }

        .login-container button {
            width: 100%;
            padding: 8px;
            margin-top: 8px;
            background: #fafafa;
            color: #333;
            border: 1px solid #ccc;
            border-radius: 3px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 400;
            transition: background 0.2s ease, border-color 0.2s ease, transform 0.15s ease;
            position: relative;
            overflow: hidden;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
        }

        .login-container button::after {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            width: 0;
            height: 0;
            background: rgba(0, 0, 0, 0.06);
            border-radius: 50%;
            transform: translate(-50%, -50%);
            transition: width 0.4s ease, height 0.4s ease;
        }

        .login-container button:active::after {
            width: 200px;
            height: 200px;
            transition: width 0s, height 0s;
        }

        .login-container button:hover {
            background: #f0f0f0;
            border-color: #aaa;
        }

        .login-container button:active {
            transform: scale(0.97);
        }

        @keyframes msgSlideIn {
            from { opacity: 0; transform: translateY(-6px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .error {
            color: #c62828;
            margin: 6px 0;
            font-size: 13px;
            background: transparent;
            padding: 0;
            border-radius: 0;
            border: none;
            width: 100%;
            text-align: center;
            animation: msgSlideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) both;
        }

        @media (max-width: 600px) {
            .login-container {
                padding: 0 20px;
            }
        }
    </style>
</head>
<body>
    <div class="login-container">
        <h2><span class="material-symbols-outlined">lock</span>Panel</h2>
        <?php if (isset($error)): ?>
            <div class="error"><?php echo htmlspecialchars($error); ?></div>
        <?php endif; ?>
        <form method="post" action="<?php echo htmlspecialchars($loginUrl); ?>">
            <input type="password" name="admin_key" placeholder="请输入管理密码" required autocomplete="off">
            <button type="submit"><span class="material-symbols-outlined">login</span>登陆</button>
        </form>
    </div>
</body>
</html>
