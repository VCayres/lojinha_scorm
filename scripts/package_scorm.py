#!/usr/bin/env python3
"""Build an offline SCORM 1.2 package using only the Python standard library."""
from pathlib import Path
import xml.etree.ElementTree as ET
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
NS = {'ims': 'http://www.imsproject.org/xsd/imscp_rootv1p1p2'}

def build():
    manifest = ROOT / 'imsmanifest.xml'
    document = ET.parse(manifest)
    members = ['imsmanifest.xml']
    for entry in document.findall('.//ims:resource', NS):
        launch = entry.attrib['href']
        declared = [node.attrib['href'] for node in entry.findall('ims:file', NS)]
        if launch not in declared:
            raise ValueError('Launch file must be included in the manifest')
        members.extend(declared)
    members = list(dict.fromkeys(members))
    for name in members:
        path = ROOT / name
        if not path.resolve().is_relative_to(ROOT) or not path.is_file():
            raise ValueError(f'Invalid or missing package member: {name}')
    output = ROOT / 'dist' / 'lojinha-do-ed-scorm12.zip'
    output.parent.mkdir(exist_ok=True)
    with ZipFile(output, 'w', ZIP_DEFLATED) as package:
        for name in members:
            package.write(ROOT / name, name)
    with ZipFile(output) as package:
        if package.testzip() is not None:
            raise ValueError('ZIP integrity check failed')
        if set(package.namelist()) != set(members):
            raise ValueError('Unexpected package contents')
    print(f'Pacote criado: {output} ({output.stat().st_size} bytes)')
    return output

if __name__ == '__main__':
    build()
