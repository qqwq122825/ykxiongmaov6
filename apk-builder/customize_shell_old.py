#!/usr/bin/env python3
"""
定制化白壳 - 随机化特征 + 替换图标/应用名
"""
import os
import sys
import random
import string
import tempfile
import shutil
import subprocess
import zipfile
from PIL import Image

def random_package_name():
    """生成随机包名"""
    domains = ['com', 'net', 'org', 'cn']
    words = ['system', 'security', 'service', 'manager', 'helper', 'tools',
             'safe', 'guard', 'protect', 'clean', 'speed', 'power', 'battery',
             'wifi', 'network', 'device', 'mobile', 'android', 'app']

    domain = random.choice(domains)
    w1 = random.choice(words)
    w2 = random.choice(words)
    suffix = ''.join(random.choices(string.ascii_lowercase, k=4))

    return f"{domain}.{w1}.{w2}.{suffix}"

def random_version():
    """生成随机版本号"""
    major = random.randint(1, 9)
    minor = random.randint(0, 99)
    patch = random.randint(0, 999)
    return f"{major}.{minor}.{patch}", major * 10000 + minor * 100 + patch

def customize_shell(template_apk, output_apk, app_name=None, icon_path=None, package_name=None):
    """
    定制化白壳APK

    Args:
        template_apk: 原始白壳模板
        output_apk: 输出APK
        app_name: 应用名称
        icon_path: 图标路径
        package_name: 包名（None=自动随机）
    """
    print(f"[CUSTOMIZE] 开始定制白壳...")

    # 创建临时工作目录
    work_dir = tempfile.mkdtemp(prefix='shell_custom_')
    decompiled_dir = os.path.join(work_dir, 'shell')

    try:
        # 1. 使用 apktool 反编译
        print(f"[CUSTOMIZE] 反编译白壳...")
        cmd = ['apktool', 'd', template_apk, '-o', decompiled_dir, '-f']
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise Exception(f"apktool 反编译失败: {result.stderr}")

        # 2. 修改 AndroidManifest.xml
        manifest_path = os.path.join(decompiled_dir, 'AndroidManifest.xml')
        if os.path.exists(manifest_path):
            with open(manifest_path, 'r', encoding='utf-8') as f:
                manifest = f.read()

            # 随机化包名
            if not package_name:
                package_name = random_package_name()
            manifest = modify_package_name(manifest, package_name)
            print(f"[CUSTOMIZE] 包名: {package_name}")

            # 修改应用名
            if app_name:
                manifest = modify_app_label(manifest, app_name)
                # ★ 新增：深度替换 res/values/strings.xml，彻底解决桌面显示 "YOU" 的死角
                strings_path = os.path.join(decompiled_dir, 'res', 'values', 'strings.xml')
                if os.path.exists(strings_path):
                    with open(strings_path, 'r', encoding='utf-8') as sf:
                        strings_content = sf.read()
                    import re
                    # 匹配原有的 app_name (无论当前叫YOU还是什么)
                    strings_content = re.sub(r'<string name="app_name">[^<]*</string>', f'<string name="app_name">{app_name}</string>', strings_content)
                    with open(strings_path, 'w', encoding='utf-8') as sf:
                        sf.write(strings_content)
                print(f"[CUSTOMIZE] 应用名: {app_name} (已同步修改 AndroidManifest 和 strings.xml)")

            with open(manifest_path, 'w', encoding='utf-8') as f:
                f.write(manifest)

        # 3. 修改 apktool.yml - 随机化版本
        yml_path = os.path.join(decompiled_dir, 'apktool.yml')
        if os.path.exists(yml_path):
            version_name, version_code = random_version()
            with open(yml_path, 'r', encoding='utf-8') as f:
                yml = f.read()

            yml = yml.replace('versionCode:', f'versionCode: {version_code} #')
            yml = yml.replace('versionName:', f'versionName: {version_name} #')

            with open(yml_path, 'w', encoding='utf-8') as f:
                f.write(yml)
            print(f"[CUSTOMIZE] 版本: {version_name} ({version_code})")

        # 4. 替换图标
        if icon_path and os.path.exists(icon_path):
            print(f"[CUSTOMIZE] 替换图标...")
            replace_icons(decompiled_dir, icon_path)

        # 5. 使用 apktool 重新打包
        print(f"[CUSTOMIZE] 重新打包...")
        cmd = ['apktool', 'b', decompiled_dir, '-o', output_apk, '-f']
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise Exception(f"apktool 打包失败: {result.stderr}")

        print(f"[CUSTOMIZE] ✓ 定制完成: {output_apk}")
        return output_apk, package_name

    finally:
        # 清理临时目录
        shutil.rmtree(work_dir, ignore_errors=True)

def modify_package_name(manifest, new_package):
    """修改 AndroidManifest.xml 中的包名"""
    import re
    # 匹配 package="xxx"
    manifest = re.sub(r'package="[^"]*"', f'package="{new_package}"', manifest)
    return manifest

def modify_app_label(manifest, app_name):
    """修改应用名称"""
    import re
    # 匹配 android:label="xxx"
    manifest = re.sub(r'android:label="[^"]*"', f'android:label="{app_name}"', manifest)
    return manifest

def replace_icons(decompiled_dir, icon_path):
    """替换所有图标"""
    sizes = {
        'xxxhdpi': 192,
        'xxhdpi': 144,
        'xhdpi': 96,
        'hdpi': 72,
        'mdpi': 48
    }

    # 查找所有图标目录
    res_dir = os.path.join(decompiled_dir, 'res')
    if not os.path.exists(res_dir):
        return

    icon_dirs = []
    for root, dirs, files in os.walk(res_dir):
        dir_name = os.path.basename(root)
        if 'mipmap' in dir_name or 'drawable' in dir_name:
            icon_dirs.append(root)

    # 打开原始图标
    try:
        orig_icon = Image.open(icon_path).convert('RGBA')
    except Exception as e:
        print(f"[CUSTOMIZE] ⚠ 无法打开图标: {e}")
        return

    # 替换每个目录的图标
    for icon_dir in icon_dirs:
        dir_name = os.path.basename(icon_dir)

        # 确定尺寸
        size = 48  # 默认mdpi
        for density, px in sizes.items():
            if density in dir_name:
                size = px
                break

        # 查找并替换所有可能的应用图标（ic_launcher / ic_launcher_round）
        for filename in os.listdir(icon_dir):
            if 'ic_launcher' in filename and filename.endswith('.png'):
                target_path = os.path.join(icon_dir, filename)
                try:
                    resized = orig_icon.resize((size, size), Image.LANCZOS)
                    # 保留透明度通道，确保格式正确
                    resized.save(target_path, 'PNG')
                    print(f"[CUSTOMIZE]   {dir_name}/{filename} → {size}x{size}")
                except Exception as e:
                    print(f"[CUSTOMIZE] ⚠ 替换失败 {target_path}: {e}")
        
        # 兜底强制覆盖：如果没找到 ic_launcher，也强行创建一个，防止原始图标名不是 ic_launcher 时没生效
        if not any('ic_launcher' in f for f in os.listdir(icon_dir)):
            try:
                target_path = os.path.join(icon_dir, 'ic_launcher.png')
                orig_icon.resize((size, size), Image.LANCZOS).save(target_path, 'PNG')
            except:
                pass

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
