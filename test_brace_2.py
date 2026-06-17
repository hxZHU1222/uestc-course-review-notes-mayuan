import json

d = json.load(open('data/mindmap.json'))
for s in d['slides']:
    nodes = s['nodes']
    lines = s['lines']
    for l in lines:
        if 'brace' in l['type'].lower() or 'bracket' in l['type'].lower():
            brace_x = min(l['x1'], l['x2'])
            brace_w = abs(l['x2'] - l['x1'])
            brace_y = min(l['y1'], l['y2'])
            brace_h = abs(l['y2'] - l['y1'])
            
            left_items = []
            right_items = []
            
            for n in nodes:
                cy = n['y'] + n['h']/2
                if brace_y - 0.05 <= cy <= brace_y + brace_h + 0.05:
                    dist_left = brace_x - (n['x'] + n['w'])
                    dist_right = n['x'] - (brace_x + brace_w)
                    
                    if -0.05 <= dist_left < 0.15:
                        left_items.append(n)
                    elif -0.15 <= dist_right < 0.05:
                        right_items.append(n)
                        
            print(f"Slide {s['slide']} Brace:")
            print(f"  Left: {[n['text'] for n in left_items]}")
            print(f"  Right: {[n['text'] for n in right_items]}")
