from pathlib import Path
from PIL import Image, ImageCms
import hashlib
import json
import struct
import zipfile

root = Path(__file__).resolve().parent.parent
profile = ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
specs = {'header': (3840, 1646), 'search': (3840, 2560)}
records = []
for placement, dimensions in specs.items():
    path = root / 'creative-assets' / placement / f'tikkun-reader-{placement}.png'
    with Image.open(path) as original:
        assert original.size == dimensions
        assert original.convert('RGBA').getchannel('A').getextrema() == (255, 255)
        original.convert('RGB').save(path, icc_profile=profile)
    with Image.open(path) as im:
        im.load()
        assert im.mode == 'RGB' and 'transparency' not in im.info
        assert im.info.get('icc_profile')
        thumbnail = im.copy()
        thumbnail.thumbnail((1400, 1000), Image.Resampling.LANCZOS)
        thumbnail.save(root / 'previews' / f'{placement}-preview.png', icc_profile=profile)
    data = path.read_bytes()
    w, h, depth, color, compression, filtering, interlace = struct.unpack('>IIBBBBB', data[16:29])
    assert (w, h) == dimensions and depth == 8 and color == 2 and interlace == 0
    records.append({'file': str(path.relative_to(root)), 'placement': placement,
                    'width': w, 'height': h, 'mode': 'RGB', 'bitDepth': depth,
                    'alpha': False, 'interlaced': False, 'profile': 'sRGB',
                    'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})

checks = json.loads((root / 'render-checks.json').read_text())
assert all(item['inside'] for record in checks['records'] for item in record['essential'])
assert len({record['sha256'] for record in records}) == 2
sources = []
for path in sorted((root / 'captures').glob('*.png')):
    sources.append({'file': str(path.relative_to(root)), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                    'captured': '2026-09-11', 'build': '1.0 (2)', 'device': 'iPhone 17 Pro Max'})
manifest = {'created': '2026-10-20', 'assets': records, 'captures': sources,
            'safeAreas': {r['placement']: r['safe'] for r in checks['records']},
            'popoutCrop': checks['records'][1]['practiceCrop'],
            'status': 'Local artwork exports; not uploaded or App Store Connect verified'}
(root / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
(root / 'validation.json').write_text(json.dumps({'passed': True, 'assetCount': 2, 'assets': records,
    'essentialCopyAndPopoutWithinOfficialSafeAreas': True,
    'publicationGates': ['Current release capture review', 'Actual App Store Connect preview and eligibility']}, indent=2) + '\n')

if (root / 'previews' / 'placement-mockups.png').exists():
    archive = root / 'Tikkun-Reader-Header-and-Search.zip'
    files = sorted(p for p in root.rglob('*') if p.is_file() and p.suffix != '.zip' and p.name != '.DS_Store')
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
        for path in files:
            z.write(path, 'Tikkun-Reader-Header-and-Search/' + str(path.relative_to(root)))
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        assert len(z.namelist()) == len(files)
        assert len([n for n in z.namelist() if '/creative-assets/' in n and n.endswith('.png')]) == 2
    print(json.dumps({'verifiedAssets': 2, 'archiveFiles': len(files), 'archiveBytes': archive.stat().st_size}))
else:
    print('Two assets validated; run again after placement previews to build ZIP.')
