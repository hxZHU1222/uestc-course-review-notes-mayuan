import os
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest

NS = {
    'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
}


SOURCE_PPTX = Path(os.environ.get("MAYUAN_MINDMAP_PPTX", ""))


def test_source_pptx_empty_shapes_can_be_inspected_when_source_is_available():
    if not SOURCE_PPTX.is_file():
        pytest.skip("set MAYUAN_MINDMAP_PPTX to run source PPTX shape inspection")

    inspected = 0
    with zipfile.ZipFile(SOURCE_PPTX) as archive:
        for i in range(1, 14):
            try:
                path = f"ppt/slides/slide{i}.xml"
                root = ET.fromstring(archive.read(path))
            except KeyError:
                continue

            for sp in root.findall(".//p:sp", NS):
                text = "".join(t.text or "" for t in sp.findall(".//a:t", NS)).strip()
                if text:
                    continue

                prst = sp.find(".//a:prstGeom", NS)
                cust = sp.find(".//a:custGeom", NS)
                ext = sp.find(".//a:ext", NS)
                width = int(ext.attrib.get("cx", 0)) if ext is not None else -1
                height = int(ext.attrib.get("cy", 0)) if ext is not None else -1
                inspected += 1

                assert prst is not None or cust is not None
                assert width != 0
                assert height != 0

    assert inspected > 0
