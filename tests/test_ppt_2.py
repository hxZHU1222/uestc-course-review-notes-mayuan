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


def test_source_pptx_connectors_can_be_inspected_when_source_is_available():
    if not SOURCE_PPTX.is_file():
        pytest.skip("set MAYUAN_MINDMAP_PPTX to run source PPTX connector inspection")

    inspected = 0
    with zipfile.ZipFile(SOURCE_PPTX) as archive:
        for i in range(1, 14):
            try:
                path = f"ppt/slides/slide{i}.xml"
                root = ET.fromstring(archive.read(path))
            except KeyError:
                continue

            for sp in root.findall(".//p:cxnSp", NS):
                geom = sp.find(".//a:prstGeom", NS)
                inspected += 1
                assert geom is not None
                assert geom.attrib.get("prst")

    assert inspected > 0
