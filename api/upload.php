<?php
header("Access-Control-Allow-Origin: *");
if(isset($_FILES['file']) && $_FILES['file']['error'] == 0){
    $uploadPath = '../uploads/'.$_FILES['file']['name'];
    if(move_uploaded_file($_FILES['file']['tmp_name'], $uploadPath)){
        echo json_encode(['code'=>200, 'msg'=>'上传成功', 'path'=>$uploadPath]);
    }else{
        echo json_encode(['code'=>500, 'msg'=>'文件保存失败']);
    }
}else{
    echo json_encode(['code'=>400, 'msg'=>'未检测到上传文件或文件错误']);
}
?>