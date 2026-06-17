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
        for sp in root.findall('.//p:cxnSp', NS):
            geom = sp.find('.//a:prstGeom', NS)
            print(f"Slide {i}: prst={geom.attrib.get('prst') if geom is not None else 'None'}")
    except KeyError:
        pass
