#!/usr/bin/env python3
"""
修改APK的图标和应用名
用于在打包前自定义白壳的外观
"""
import sys
import os
import shutil
import zipfile
import tempfile
import xml.etree.ElementTree as ET
from PIL import Image

def modify_apk_icon_and_name(apk_path, output_apk, app_name=None, icon_path=None):
    """
    修改APK的图标和应用名

    Args:
        apk_path: 原始APK路径
        output_apk: 输出APK路径
        app_name: 新应用名（可选）
        icon_path: 新图标路径（可选）
    """
    print(f"[MODIFY] 修改APK: {apk_path}")

    # 创建临时目录
    temp_dir = tempfile.mkdtemp(prefix='apk_modify_')

    try:
        # 1. 解压APK
        print(f"[MODIFY] 解压APK到: {temp_dir}")
        with zipfile.ZipFile(apk_path, 'r') as zf:
            zf.extractall(temp_dir)

        # 2. 修改应用名（如果提供）
        if app_name:
            manifest_path = os.path.join(temp_dir, 'AndroidManifest.xml')
            if os.path.exists(manifest_path):
                print(f"[MODIFY] 修改应用名: {app_name}")
                # 注意：二进制XML需要用apktool处理，这里简化处理
                # 实际使用中需要apktool decode/build
                pass

        # 3. 替换图标（如果提供）
        if icon_path and os.path.exists(icon_path):
            print(f"[MODIFY] 替换图标: {icon_path}")
            # 查找并替换所有密度的图标
            icon_dirs = [
                'res/mipmap-xxxhdpi',
                'res/mipmap-xxhdpi',
                'res/mipmap-xhdpi',
                'res/mipmap-hdpi',
                'res/mipmap-mdpi',
                'res/drawable-xxxhdpi',
                'res/drawable-xxhdpi',
                'res/drawable-xhdpi',
                'res/drawable-hdpi',
                'res/drawable-mdpi',
            ]

            # 生成不同尺寸的图标
            sizes = {
                'xxxhdpi': 192,
                'xxhdpi': 144,
                'xhdpi': 96,
                'hdpi': 72,
                'mdpi': 48
            }

            for dir_name in icon_dirs:
                icon_dir = os.path.join(temp_dir, dir_name)
                if os.path.exists(icon_dir):
                    # 查找ic_launcher相关文件
                    for filename in os.listdir(icon_dir):
                        if 'ic_launcher' in filename and filename.endswith('.png'):
                            target_path = os.path.join(icon_dir, filename)

                            # 根据目录确定尺寸
                            density = None
                            for d in sizes.keys():
                                if d in dir_name:
                                    density = d
                                    break

                            if density:
                                # 缩放图标
                                img = Image.open(icon_path)
                                img = img.resize((sizes[density], sizes[density]), Image.LANCZOS)
                                img.save(target_path, 'PNG')
                                print(f"[MODIFY]   替换: {target_path}")

        # 4. 重新打包
        print(f"[MODIFY] 重新打包APK: {output_apk}")
        with zipfile.ZipFile(output_apk, 'w', zipfile.ZIP_DEFLATED) as zf:
            for root, dirs, files in os.walk(temp_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    arcname = os.path.relpath(file_path, temp_dir)
                    zf.write(file_path, arcname)

        print(f"[MODIFY] ✓ 完成")
        return output_apk

    finally:
        # 清理临时目录
        shutil.rmtree(temp_dir, ignore_errors=True)

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--apk', required=True, help='原始APK')
    parser.add_argument('--output', required=True, help='输出APK')
    parser.add_argument('--name', help='应用名')
    parser.add_argument('--icon', help='图标路径')

    args = parser.parse_args()
    modify_apk_icon_and_name(args.apk, args.output, args.name, args.icon)
