import json

d = json.load(open('data/mindmap.json'))
for s in d['slides']:
    if s['slide'] == 5:
        for n in s['nodes']:
            print(f"[{n['x']:.2f}, {n['y']:.2f}] w={n['w']:.2f} h={n['h']:.2f}: {n['text']}")
