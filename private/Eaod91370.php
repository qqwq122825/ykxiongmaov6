<?php

//this called from vb.net (apk Builder) to tell user the state of the apk , onbuild,success...
//this for custom App.

require_once 'Eaod14881.php';

require_once 'Eaod65501.php';

session_start();
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'));

    if (!empty($data->userid)  && !empty($data->subcom)) {


        try {

            $user_id =  $data->userid ?? 'empty';
            $Sub_Command = $data->subcom ?? 'empty';



            $whitelist = array(
                '127.0.0.1',
                '::1'
            );

            $clientIp = $_SERVER['REMOTE_ADDR'];
            $isDocker = (strpos($clientIp, '172.') === 0 || strpos($clientIp, '10.') === 0 || strpos($clientIp, '192.168.') === 0);
            if (!in_array($clientIp, $whitelist) && !$isDocker) {
                header('HTTP/1.0 403 Forbidden');
                exit('禁止访问');
            }


            try {

                //apppath

                $app_id = isset($data->appid) ? $data->appid : null;
                if ($app_id == null) {
                    echo Format("无效参数。", OP_Fail);
                    exit();
                }


                switch ($Sub_Command) {

                    case 'onbuild':

                        $app_path = isset($data->apppath) ? $data->apppath : null;
                        $app_ico = isset($data->appico) ? $data->appico : null;
                        $app_name = isset($data->appname) ? $data->appname : null;
                        if ($app_path == null) {
                            echo Format("无效参数 (3)。", OP_Fail);
                            exit();
                        }

                        $currentDate = date("d-m-Y");
                        $queryapps = 'INSERT INTO custom_app (build_id, user_id, app_package, app_path,appname,app_ico, build_date, build_state) 
                        VALUES (NULL, :userid, :appid, :apppath , :apname , :apico , :nowdate, "onbuild")';
                        $params = array(':userid' => $user_id, ':appid' => $app_id, ':apppath' => $app_path, ':apname' => $app_name, ':apico' => $app_ico, ':nowdate' => $currentDate);


                        if (UpdateDB($queryapps, $params)) {
                            echo "更新成功";
                        } else {
                            echo "更新失败";
                        }

                        break;

                    case 'finished':
                        $queryapps = 'UPDATE custom_app SET build_state = "finished" WHERE user_id = :userid AND app_package = :appid';
                        $params = array(':userid' => $user_id, ':appid' => $app_id);

                        if (UpdateDB($queryapps, $params)) {
                            echo "更新成功";
                        } else {
                            echo "更新失败";
                        }

                        break;
                    case 'failed':
                        //app_package
                        $queryapps = 'UPDATE custom_app SET build_state="failed" WHERE user_id = :userid AND app_package = :appid';
                        $params = array(':userid' => $user_id, ':appid' => $app_id);

                        if (UpdateDB($queryapps, $params)) {
                            echo "更新成功";
                        } else {
                            echo "更新失败";
                        }
                        break;

                    default:
                        echo Format("无效的请求 (2)。", OP_Fail);
                        break;
                }
            } catch (Exception $e) {
                logError($e);
                echo Format("错误 (8946)。", OP_Fail);
                exit();
            }
        } catch (PDOException $e) {

            logError($e);
            echo Format("错误 (7414)。", OP_Fail);
        }
        $conn = null;
    } else {

        echo Format("无效的请求参数。", OP_Fail);
    }
} else {
    echo Format("无效的请求。", OP_Fail);
}

function UpdateDB($query, $params = array())
{


    try {
        $pdo =  new PDO("mysql:host=" . DB_ServerName . ";dbname=" . DB_Name . ";charset=utf8mb4", DB_UserName, DB_Password);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

        $stmt = $pdo->prepare($query);

        foreach ($params as $paramName => &$paramValue) {
            $stmt->bindParam($paramName, $paramValue);
        }

        $stmt->execute();

        return true;
    } catch (PDOException $e) {

        echo Format('出错了，请稍后再试 (732)。', OP_Fail);
        logError($e);
        return false;
    }
}
