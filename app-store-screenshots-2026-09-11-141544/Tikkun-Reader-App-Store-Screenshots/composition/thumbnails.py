from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
out = root / 'thumbnails'
out.mkdir(exist_ok=True)
for path in sorted((root / 'exports' / 'en-US').glob('*/*.png')):
    with Image.open(path) as im:
        im.thumbnail((420, 920), Image.Resampling.LANCZOS)
        im.convert('RGB').save(out / (path.parent.name + '-' + path.name))
