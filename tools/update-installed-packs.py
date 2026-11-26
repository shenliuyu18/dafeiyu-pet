import os, json, zipfile, sys, shutil, time

CONTENT_DIR = 'characters-build/packs-content'
DIRS = {
    'full': os.path.expandvars(r'%APPDATA%\dafeiyu-desktop-pet\characters'),
    'lite': os.path.expandvars(r'%APPDATA%\dafeiyu-desktop-pet-lite\characters'),
}
apply = '--apply' in sys.argv
ts = time.strftime('%Y%m%d-%H%M%S')

for variant, cdir in DIRS.items():
    if not os.path.isdir(cdir):
        print(f'== {variant}: 目录不存在 {cdir}')
        continue
    print(f'== {variant}: {cdir}')
    for pid in sorted(os.listdir(cdir)):
        idir = os.path.join(cdir, pid)
        if not os.path.isdir(idir):
            continue
        zp = os.path.join(CONTENT_DIR, f'{pid}-{variant}.zip')
        if not os.path.isfile(zp):
            print(f'  [skip] {pid}: 无 {variant} 新包')
            continue
        try:
            z = zipfile.ZipFile(zp)
            nm = json.loads(z.read('manifest.json').decode('utf-8-sig'))
        except Exception as e:
            print(f'  [skip] {pid}: 新包读取失败 {e}')
            continue
        miss = [a.get('file') for a in nm.get('actions', []) if a.get('file') and not os.path.isfile(os.path.join(idir, a['file']))]
        if nm.get('cover') and not os.path.isfile(os.path.join(idir, nm['cover'])):
            miss.append('COVER:' + nm['cover'])
        if nm.get('sprite') and nm['sprite'].get('sheet') and not os.path.isfile(os.path.join(idir, nm['sprite']['sheet'])):
            miss.append('SHEET:' + nm['sprite']['sheet'])
        en = ((nm.get('i18n') or {}).get('en') or {}).get('actions') or {}
        ja = ((nm.get('i18n') or {}).get('ja') or {}).get('actions') or {}
        olden = 0
        oldmp = os.path.join(idir, 'manifest.json')
        try:
            olden = len((((json.load(open(oldmp, encoding='utf-8-sig')).get('i18n') or {}).get('en') or {}).get('actions')) or {})
        except Exception:
            pass
        if miss:
            print(f'  [skip] {pid}: 旧目录缺 {len(miss)} 个文件（示例 {miss[:3]}）—素材版本不一致，需整体重装')
            continue
        print(f'  [ok]   {pid}: actions={len(nm.get("actions", []))} new_en={len(en)} new_ja={len(ja)} old_en={olden}')
        if apply:
            shutil.copy2(oldmp, oldmp + f'.bak-{ts}')
            with open(oldmp, 'w', encoding='utf-8') as f:
                f.write(json.dumps(nm, ensure_ascii=False, indent=2))
print('APPLIED' if apply else 'DRY-RUN')
