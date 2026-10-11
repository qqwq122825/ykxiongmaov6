<?php
session_start();
require_once 'Eaod14881.php';

$_SESSION = array();
if (ini_get("session.use_cookies")) {
    $params = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000,
        $params["path"], $params["domain"],
        $params["secure"], $params["httponly"]
    );
}
session_destroy();

$loginUrl = 'login.php';
if (defined('ADMIN_PATH') && ADMIN_PATH !== '') {
    $loginUrl .= '?key=' . urlencode(ADMIN_PATH);
}
header("Location: " . $loginUrl);
exit();
