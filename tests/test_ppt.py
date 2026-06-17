import zipfile
import xml.etree.ElementTree as ET

NS = {
    'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
}

archive = zipfile.ZipFile('/mnt/d/课程作业及相关资料/大二下/course_app/data/mayuan/马原思维导图.pptx')
for i in range(1, 14):
    try:
        path = f'ppt/slides/slide{i}.xml'
        root = ET.fromstring(archive.read(path))
        for sp in root.findall('.//p:sp', NS):
            text = ''.join(t.text or '' for t in sp.findall('.//a:t', NS)).strip()
            if not text:
                prst = sp.find('.//a:prstGeom', NS)
                cust = sp.find('.//a:custGeom', NS)
                w = sp.find('.//a:ext', NS)
                width = int(w.attrib.get('cx', 0)) if w is not None else -1
                height = int(w.attrib.get('cy', 0)) if w is not None else -1
                
                print(f"Slide {i}: prst={prst.attrib.get('prst') if prst is not None else 'None'}, cust={cust is not None}, w={width}, h={height}")
    except KeyError:
        pass
