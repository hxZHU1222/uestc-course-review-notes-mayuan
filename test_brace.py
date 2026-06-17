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
            
            parent = None
            min_dist = 999
            for n in nodes:
                cx = n['x'] + n['w']/2
                cy = n['y'] + n['h']/2
                dist = brace_x - (n['x'] + n['w'])
                # Parent should be to the left, within reasonable distance
                if -0.05 <= dist < min_dist and (n['y'] <= brace_y + brace_h and n['y'] + n['h'] >= brace_y):
                    min_dist = dist
                    parent = n
                    
            children = []
            for n in nodes:
                cy = n['y'] + n['h']/2
                dist = n['x'] - (brace_x + brace_w)
                # Child should be to the right, y-center inside brace, not too far
                if -0.05 <= dist < 0.15 and (brace_y - 0.05 <= cy <= brace_y + brace_h + 0.05):
                    children.append(n)
            
            print(f"Slide {s['slide']} Brace: parent={parent['text'] if parent else 'None'} -> children={[c['text'] for c in children]}")
