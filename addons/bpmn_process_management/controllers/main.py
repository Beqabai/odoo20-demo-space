# Part of bpmn_process_management. License LGPL-3.
import re

from odoo import http
from odoo.http import request

from ..lib.bpmn_common import BpmnError
from ..lib.drawio_export import bpmn_to_drawio

try:  # Odoo <= 19
    from odoo.http import content_disposition
except ImportError:  # Odoo 20 moved it
    from odoo.http.stream import content_disposition


class BpmnExportController(http.Controller):

    @http.route("/bpmn_process_management/export/<int:process_id>/<string:fmt>",
                type="http", auth="user", methods=["GET"])
    def export(self, process_id, fmt, **kw):
        process = request.env["business.process"].browse(process_id).exists()
        if not process:
            raise request.not_found()
        process.check_access("read")
        base = re.sub(r"[^\w\-. ]+", "_", "%s v%s" % (process.name, process.version)).strip() or "process"
        if fmt == "bpmn":
            data = (process.bpmn_xml or "").encode("utf-8")
            filename, ctype = base + ".bpmn", "application/xml; charset=utf-8"
        elif fmt == "drawio":
            try:
                data = bpmn_to_drawio(process.bpmn_xml, name=process.name).encode("utf-8")
            except BpmnError as e:
                return request.make_response(str(e), status=409, headers=[
                    ("Content-Type", "text/plain; charset=utf-8")])
            filename, ctype = base + ".drawio", "application/xml; charset=utf-8"
        else:
            raise request.not_found()
        return request.make_response(data, headers=[
            ("Content-Type", ctype),
            ("Content-Disposition", content_disposition(filename)),
            ("X-Content-Type-Options", "nosniff"),
        ])
