import json, zipfile
import xml.etree.ElementTree as ET

NS = {
    'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
}

class Transform:
    def __init__(self, off_x, off_y, ext_cx, ext_cy, ch_off_x, ch_off_y, ch_ext_cx, ch_ext_cy, flipH=False, flipV=False):
        self.off_x = off_x
        self.off_y = off_y
        self.ext_cx = ext_cx
        self.ext_cy = ext_cy
        self.ch_off_x = ch_off_x
        self.ch_off_y = ch_off_y
        self.ch_ext_cx = ch_ext_cx if ch_ext_cx != 0 else 1
        self.ch_ext_cy = ch_ext_cy if ch_ext_cy != 0 else 1
        self.scale_x = ext_cx / self.ch_ext_cx
        self.scale_y = ext_cy / self.ch_ext_cy
        self.flipH = flipH
        self.flipV = flipV

    def apply_point(self, px, py):
        nx = self.off_x + (px - self.ch_off_x) * self.scale_x
        ny = self.off_y + (py - self.ch_off_y) * self.scale_y
        if self.flipH:
            nx = self.off_x + self.ext_cx - (nx - self.off_x)
        if self.flipV:
            ny = self.off_y + self.ext_cy - (ny - self.off_y)
        return nx, ny

    def apply(self, x, y, w, h):
        nx = self.off_x + (x - self.ch_off_x) * self.scale_x
        ny = self.off_y + (y - self.ch_off_y) * self.scale_y
        nw = w * self.scale_x
        nh = h * self.scale_y
        if self.flipH:
            nx = self.off_x + self.ext_cx - (nx - self.off_x) - nw
        if self.flipV:
            ny = self.off_y + self.ext_cy - (ny - self.off_y) - nh
        return nx, ny, nw, nh

def parse_xfrm(xfrm_el, is_grp=False):
    if xfrm_el is None: return None
    off = xfrm_el.find('a:off', NS)
    ext = xfrm_el.find('a:ext', NS)
    if off is None or ext is None: return None
    
    off_x = int(off.attrib.get('x', 0))
    off_y = int(off.attrib.get('y', 0))
    ext_cx = int(ext.attrib.get('cx', 0))
    ext_cy = int(ext.attrib.get('cy', 0))
    flipH = xfrm_el.attrib.get('flipH') in ('1', 'true')
    flipV = xfrm_el.attrib.get('flipV') in ('1', 'true')
    
    if is_grp:
        chOff = xfrm_el.find('a:chOff', NS)
        chExt = xfrm_el.find('a:chExt', NS)
        ch_off_x = int(chOff.attrib.get('x', 0)) if chOff is not None else off_x
        ch_off_y = int(chOff.attrib.get('y', 0)) if chOff is not None else off_y
        ch_ext_cx = int(chExt.attrib.get('cx', 1)) if chExt is not None else ext_cx
        ch_ext_cy = int(chExt.attrib.get('cy', 1)) if chExt is not None else ext_cy
        return Transform(off_x, off_y, ext_cx, ext_cy, ch_off_x, ch_off_y, ch_ext_cx, ch_ext_cy, flipH, flipV)
    return off_x, off_y, ext_cx, ext_cy, flipH, flipV

def extract_line(node, transforms):
    spPr = node.find('p:spPr', NS)
    xfrm = spPr.find('a:xfrm', NS) if spPr is not None else None
    res = parse_xfrm(xfrm, False)
    if not res: return []
    x, y, w, h, flipH, flipV = res
    
    start_x = x + w if flipH else x
    start_y = y + h if flipV else y
    end_x = x if flipH else x + w
    end_y = y if flipV else y + h
    
    for t in reversed(transforms):
        start_x, start_y = t.apply_point(start_x, start_y)
        end_x, end_y = t.apply_point(end_x, end_y)
        
    geom = node.find('.//a:prstGeom', NS)
    prst = geom.attrib.get('prst', 'line') if geom is not None else 'line'
    return [{'x1': start_x, 'y1': start_y, 'x2': end_x, 'y2': end_y, 'type': prst}]

def extract_node(node, transforms):
    tag = node.tag.split('}')[-1]
    
    if tag in ('spTree', 'grpSp'):
        new_transforms = transforms
        if tag == 'grpSp':
            grpSpPr = node.find('p:grpSpPr', NS)
            xfrm = grpSpPr.find('a:xfrm', NS) if grpSpPr is not None else None
            t = parse_xfrm(xfrm, True)
            if t: new_transforms = transforms + [t]
            
        nodes, lines = [], []
        for child in node:
            cn, cl = extract_node(child, new_transforms)
            nodes.extend(cn)
            lines.extend(cl)
        return nodes, lines
        
    elif tag == 'sp':
        text = ''.join(t.text or '' for t in node.findall('.//a:t', NS)).strip()
        if not text:
            geom = node.find('.//a:prstGeom', NS)
            prst = geom.attrib.get('prst') if geom is not None else None
            if prst and ('line' in prst.lower() or 'connector' in prst.lower() or 'brace' in prst.lower() or 'bracket' in prst.lower()):
                return [], extract_line(node, transforms)
            return [], []
        
        spPr = node.find('p:spPr', NS)
        xfrm = spPr.find('a:xfrm', NS) if spPr is not None else None
        res = parse_xfrm(xfrm, False)
        if not res: return [], []
        x, y, w, h, _, _ = res
        
        for t in reversed(transforms):
            x, y, w, h = t.apply(x, y, w, h)
        return [{'text': text, 'x': x, 'y': y, 'w': w, 'h': h}], []
        
    elif tag == 'cxnSp':
        return [], extract_line(node, transforms)
    
    return [], []

def main():
    archive = zipfile.ZipFile('/mnt/d/课程作业及相关资料/大二下/course_app/data/mayuan/马原思维导图.pptx')
    root_presentation = ET.fromstring(archive.read('ppt/presentation.xml'))
    size = root_presentation.find('.//p:sldSz', NS)
    slide_w = int(size.attrib.get('cx', 12192000))
    slide_h = int(size.attrib.get('cy', 6858000))
    
    slides = []
    for slide_index in range(1, 14):
        try:
            path = f'ppt/slides/slide{slide_index}.xml'
            xml_data = archive.read(path)
        except KeyError:
            break
        root = ET.fromstring(xml_data)
        spTree = root.find('.//p:spTree', NS)
        
        all_nodes, all_lines = extract_node(spTree, [])
        
        for i, n in enumerate(all_nodes):
            n['id'] = f'M{slide_index:02d}-{i + 1:03d}'
            n['slide'] = slide_index
            n['x'] = round(n['x'] / slide_w, 5)
            n['y'] = round(n['y'] / slide_h, 5)
            n['w'] = round(n['w'] / slide_w, 5)
            n['h'] = round(n['h'] / slide_h, 5)
            n['linkedCardIds'] = []
            
        for l in all_lines:
            l['x1'] = round(l['x1'] / slide_w, 5)
            l['y1'] = round(l['y1'] / slide_h, 5)
            l['x2'] = round(l['x2'] / slide_w, 5)
            l['y2'] = round(l['y2'] / slide_h, 5)
            
        final_lines = []
        for l in all_lines:
            if 'brace' in l['type'].lower() or 'bracket' in l['type'].lower():
                brace_x = min(l['x1'], l['x2'])
                brace_w = abs(l['x2'] - l['x1'])
                brace_y = min(l['y1'], l['y2'])
                brace_h = abs(l['y2'] - l['y1'])
                
                left_items = []
                right_items = []
                
                for n in all_nodes:
                    cy = n['y'] + n['h'] / 2
                    if brace_y - 0.05 <= cy <= brace_y + brace_h + 0.05:
                        dist_left = brace_x - (n['x'] + n['w'])
                        dist_right = n['x'] - (brace_x + brace_w)
                        
                        if -0.05 <= dist_left < 0.15:
                            left_items.append(n)
                        elif -0.15 <= dist_right < 0.05:
                            right_items.append(n)
                
                if left_items and right_items:
                    for left_node in left_items:
                        for right_node in right_items:
                            final_lines.append({
                                'x1': left_node['x'] + left_node['w'],
                                'y1': left_node['y'] + left_node['h'] / 2,
                                'x2': right_node['x'],
                                'y2': right_node['y'] + right_node['h'] / 2,
                                'type': 'bentConnector3'
                            })
            else:
                final_lines.append(l)
        
        slides.append({'slide': slide_index, 'nodes': all_nodes, 'lines': final_lines})
    
    mindmap = {
        'pageCount': len(slides),
        'nodeCount': sum(len(s['nodes']) for s in slides),
        'slides': slides
    }
    return mindmap

if __name__ == '__main__':
    mindmap = main()
    with open('data/mindmap_new.json', 'w', encoding='utf-8') as f:
        json.dump(mindmap, f, ensure_ascii=False, indent=2)
