# Part of bpmn_process_management. License LGPL-3.
"""Shared BPMN 2.0 helpers (pure Python + lxml, no Odoo imports).

Everything in ``lib`` is importable without an Odoo environment so the
converters can be unit tested standalone.
"""
import math
import re
import urllib.parse
import zlib

from lxml import etree

BPMN_NS = "http://www.omg.org/spec/BPMN/20100524/MODEL"
BPMNDI_NS = "http://www.omg.org/spec/BPMN/20100524/DI"
DC_NS = "http://www.omg.org/spec/DD/20100524/DC"
DI_NS = "http://www.omg.org/spec/DD/20100524/DI"
XSI_NS = "http://www.w3.org/2001/XMLSchema-instance"
# Namespace of the Odoo soft-link metadata. Must match static/src/bpmn_field/odoo_moddle.js
ODOO_NS = "http://gecbusiness.com/schema/bpmn/odoo/1.0"

NSMAP = {
    "bpmn": BPMN_NS,
    "bpmndi": BPMNDI_NS,
    "dc": DC_NS,
    "di": DI_NS,
    "xsi": XSI_NS,
    "odoo": ODOO_NS,
}

MAX_XML_BYTES = 20 * 1024 * 1024  # 20 MB is far beyond any realistic diagram

FLOW_NODE_TAGS = {
    "task", "userTask", "manualTask", "serviceTask", "scriptTask", "sendTask",
    "receiveTask", "businessRuleTask", "subProcess", "transaction", "adHocSubProcess",
    "callActivity", "startEvent", "endEvent", "intermediateThrowEvent",
    "intermediateCatchEvent", "boundaryEvent", "exclusiveGateway", "inclusiveGateway",
    "parallelGateway", "complexGateway", "eventBasedGateway",
}
ACTIVITY_TAGS = {
    "task", "userTask", "manualTask", "serviceTask", "scriptTask", "sendTask",
    "receiveTask", "businessRuleTask", "subProcess", "transaction", "adHocSubProcess",
    "callActivity",
}


class BpmnError(ValueError):
    """Raised for any invalid / unsupported input. Message is user facing."""


def safe_inflate(data, wbits=-15, limit=None):
    """zlib decompression with an output limit (decompression bomb guard)."""
    limit = limit or MAX_XML_BYTES
    try:
        d = zlib.decompressobj(wbits)
        out = d.decompress(data, limit)
    except zlib.error as e:
        raise BpmnError("Corrupted compressed data.") from e
    if d.unconsumed_tail:
        raise BpmnError("The file is too large.")
    return out


def finite(value, default=0.0):
    """float() that rejects NaN / infinity (they break geometry math)."""
    try:
        f = float(value)
    except (TypeError, ValueError):
        return default
    return f if math.isfinite(f) else default


_URL_BAD_CHARS = re.compile(r"[\\\x00-\x20\x7f]")


def is_safe_url(url):
    """Allow http(s) and mailto links, and same-site absolute paths ("/web...").

    Rejects javascript:/data: URLs, protocol-relative "//host" and the browser
    normalisation tricks "/\\host" or "/<TAB>/host" (open redirects)."""
    url = (url or "").strip()
    if not url or _URL_BAD_CHARS.search(url):
        return False
    parts = urllib.parse.urlsplit(url)
    scheme = parts.scheme.lower()
    if scheme in ("http", "https"):
        return bool(parts.netloc)
    if scheme == "mailto":
        return True
    return scheme == "" and parts.netloc == "" and url.startswith("/") and not url.startswith("//")


def q(ns, tag):
    return "{%s}%s" % (NSMAP.get(ns, ns), tag)


def local(tag):
    if not isinstance(tag, str):
        return ""
    return tag.rsplit("}", 1)[-1]


def safe_parser():
    # No entity expansion, no DTD, no network: protects against XXE / billion laughs.
    return etree.XMLParser(
        resolve_entities=False, no_network=True, load_dtd=False,
        dtd_validation=False, huge_tree=False, remove_blank_text=False,
    )


def parse_xml(data):
    if isinstance(data, str):
        data = data.encode("utf-8")
    if not data or not data.strip():
        raise BpmnError("The file is empty.")
    if len(data) > MAX_XML_BYTES:
        raise BpmnError("The file is too large.")
    # strip UTF-8 BOM
    if data.startswith(b"\xef\xbb\xbf"):
        data = data[3:]
    try:
        return etree.fromstring(data, parser=safe_parser())
    except etree.XMLSyntaxError as e:
        raise BpmnError("The file is not valid XML: %s" % e) from e


def parse_bpmn(data):
    """Parse and check that ``data`` is a BPMN 2.0 definitions document."""
    root = parse_xml(data)
    if root.tag != q("bpmn", "definitions"):
        raise BpmnError(
            "The file is not a BPMN 2.0 document (root element must be "
            "<definitions> in namespace %s)." % BPMN_NS)
    return root


def has_diagram(root):
    return root.find(".//" + q("bpmndi", "BPMNShape")) is not None or \
        root.find(".//" + q("bpmndi", "BPMNEdge")) is not None


def normalize_bpmn(xml):
    """Validate a BPMN string and force ``isExecutable="false"`` on processes.

    Returns the (possibly unchanged) XML string. The input string is returned
    untouched when nothing had to change, so that the web client does not
    re-import an identical diagram after saving.
    """
    root = parse_bpmn(xml)
    changed = False
    for proc in root.iter(q("bpmn", "process")):
        if proc.get("isExecutable") != "false":
            proc.set("isExecutable", "false")
            changed = True
    if not changed:
        return xml if isinstance(xml, str) else xml.decode("utf-8")
    return to_string(root)


def to_string(root):
    return etree.tostring(root, xml_declaration=True, encoding="UTF-8",
                          pretty_print=True).decode("utf-8")


_NCNAME_BAD = re.compile(r"[^A-Za-z0-9_.\-]")


def make_id(prefix, raw, used):
    """Return a unique, valid XML NCName id built from ``raw``."""
    base = _NCNAME_BAD.sub("_", str(raw or ""))[:40].strip("_") or "1"
    ident = "%s_%s" % (prefix, base)
    candidate, n = ident, 1
    while candidate in used:
        n += 1
        candidate = "%s_%d" % (ident, n)
    used.add(candidate)
    return candidate


# ---------------------------------------------------------------------------
# Odoo extension elements
# ---------------------------------------------------------------------------

def _ext_insert_index(el):
    """extensionElements must come right after documentation (BPMN XSD order)."""
    idx = 0
    for i, child in enumerate(el):
        if child.tag == q("bpmn", "documentation"):
            idx = i + 1
    return idx


def get_extension_elements(el, create=False):
    ext = el.find(q("bpmn", "extensionElements"))
    if ext is None and create:
        ext = etree.Element(q("bpmn", "extensionElements"))
        el.insert(_ext_insert_index(el), ext)
    return ext


def odoo_items(el, tag):
    ext = get_extension_elements(el)
    if ext is None:
        return []
    return ext.findall(q("odoo", tag))


def set_odoo_item(el, tag, attrs):
    """Replace all ``odoo:<tag>`` children of the element's extensionElements."""
    ext = get_extension_elements(el, create=True)
    for old in ext.findall(q("odoo", tag)):
        ext.remove(old)
    item = etree.SubElement(ext, q("odoo", tag))
    for k, v in attrs.items():
        if v not in (None, False, ""):
            item.set(k, str(v))
    return item


def remove_odoo_item(el, tag):
    ext = get_extension_elements(el)
    if ext is None:
        return
    for old in ext.findall(q("odoo", tag)):
        ext.remove(old)
    if len(ext) == 0:
        el.remove(ext)


def add_odoo_link(el, attrs):
    ext = get_extension_elements(el, create=True)
    item = etree.SubElement(ext, q("odoo", "link"))
    for k, v in attrs.items():
        if v not in (None, False, ""):
            item.set(k, str(v))
    return item


def get_documentation(el):
    parts = [d.text or "" for d in el.findall(q("bpmn", "documentation"))]
    return "\n".join(p for p in parts if p).strip()


def set_documentation(el, text):
    for d in el.findall(q("bpmn", "documentation")):
        el.remove(d)
    if text:
        doc = etree.Element(q("bpmn", "documentation"))
        doc.text = text
        el.insert(0, doc)


def element_name(el):
    name = el.get("name")
    if name:
        return name.strip()
    if local(el.tag) == "textAnnotation":
        t = el.find(q("bpmn", "text"))
        return (t.text or "").strip() if t is not None else ""
    return ""


DEFAULT_BPMN_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" \
xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" \
xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" \
xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" \
xmlns:di="http://www.omg.org/spec/DD/20100524/DI" \
id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn" \
exporter="Odoo BPMN Process Management" exporterVersion="1.0">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="182" y="102" width="36" height="36"/>
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
"""
