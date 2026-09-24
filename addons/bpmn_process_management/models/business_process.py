# Part of bpmn_process_management. License LGPL-3.
import logging
import re

from odoo import api, fields, models
from odoo.exceptions import AccessError, UserError, ValidationError

from ..lib.bpmn_common import DEFAULT_BPMN_XML, BpmnError, is_safe_url, normalize_bpmn
from ..lib.bpmn_index import apply_responsible_matching, extract_elements

_logger = logging.getLogger(__name__)

# Fields that describe the approved content of a process. They can only be
# changed while the version is a draft; afterwards a new version is needed.
CONTENT_FIELDS = {"name", "code", "bpmn_xml", "description", "category"}

# Models an element can link to ("knowledge"): only used when installed, so the
# module works the same on Community and Enterprise.
RECORD_LINK_MODELS = [
    "knowledge.article",       # Enterprise: Knowledge
    "documents.document",      # Enterprise: Documents
    "business.process",        # another process (sub-process / next process)
    "ir.attachment",
]
RESPONSIBLE_MODELS = ["hr.department", "res.groups", "res.users", "hr.job"]
LINKABLE_MODELS = set(RECORD_LINK_MODELS + RESPONSIBLE_MODELS + ["ir.ui.menu", "ir.actions.act_window"])
REVIEW_REASONS = {"responsible_missing", "responsible_auto", "type_guessed", "link_broken",
                  "imported"}


class BusinessProcess(models.Model):
    _name = "business.process"
    _description = "Business Process"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _order = "sequence, code, name, id"
    _parent_store = True
    _rec_names_search = ["name", "code"]

    name = fields.Char("Process Name", required=True, tracking=True)
    code = fields.Char("Process Code", copy=False, tracking=True,
                       help="Short reference, e.g. SAL-03. Kept across versions.")
    sequence = fields.Integer(default=10)
    active = fields.Boolean(default=True)
    company_id = fields.Many2one("res.company", string="Company",
                                 help="Leave empty to share the process with all companies.")
    version = fields.Char("Version", default="1.0", required=True, copy=False, tracking=True)
    state = fields.Selection([
        ("draft", "Draft"),
        ("review", "In Review"),
        ("published", "Published"),
        ("deprecated", "Deprecated"),
    ], default="draft", required=True, copy=False, tracking=True, index=True)
    category = fields.Selection([
        ("core", "Core (Operational)"),
        ("support", "Supporting"),
        ("management", "Management"),
    ], string="Process Type", default="core", required=True)
    parent_id = fields.Many2one("business.process", string="Parent Process", index=True,
                                ondelete="restrict",
                                help="Higher-level process in the process architecture.")
    parent_path = fields.Char(index=True)
    child_ids = fields.One2many("business.process", "parent_id", string="Sub-processes")
    owner_id = fields.Many2one("res.users", string="Process Owner",
                               default=lambda self: self.env.user, tracking=True)
    description = fields.Html("Purpose & Description", sanitize=True)
    bpmn_xml = fields.Text("BPMN 2.0 XML", default=DEFAULT_BPMN_XML, copy=True)
    diagram_preview = fields.Binary("Diagram Preview", attachment=True, copy=True)

    # versioning
    root_id = fields.Many2one("business.process", string="First Version", copy=False,
                              index=True, readonly=True, ondelete="set null")
    previous_version_id = fields.Many2one("business.process", string="Previous Version",
                                          copy=False, readonly=True)
    version_count = fields.Integer(compute="_compute_version_count")
    published_date = fields.Datetime(copy=False, readonly=True, tracking=True)
    published_by_id = fields.Many2one("res.users", string="Published By", copy=False,
                                      readonly=True)

    # element index
    element_ids = fields.One2many("business.process.element", "process_id", string="Elements",
                                  copy=False)
    element_count = fields.Integer(compute="_compute_element_stats", store=True)
    review_count = fields.Integer("Items to Review", compute="_compute_element_stats",
                                  store=True)
    link_count = fields.Integer("Links", compute="_compute_element_stats", store=True)

    is_manager = fields.Boolean(compute="_compute_is_manager")
    is_latest_version = fields.Boolean(compute="_compute_version_count")



    # ------------------------------------------------------------------
    # install / update
    # ------------------------------------------------------------------
    @api.model
    def _bpmn_load_access_rules(self):
        """Load the access rights matching the running Odoo version.

        Called from security/security.xml so it runs on install and update;
        the loaded xmlids are tracked like any other data file."""
        from odoo.tools.convert import convert_file  # noqa: PLC0415
        if "ir.access" in self.env:  # Odoo 20+
            files = ["security/odoo20/ir.access.csv"]
        else:  # Odoo 19
            files = ["security/odoo19/ir.model.access.csv", "security/odoo19/ir_rule.xml"]
        for path in files:
            convert_file(self.env, "bpmn_process_management", path, {}, mode="update",
                         noupdate=False)
        return True

    # ------------------------------------------------------------------
    # computes
    # ------------------------------------------------------------------
    def _compute_is_manager(self):
        is_manager = self.env.user.has_group("bpmn_process_management.group_process_manager")
        for rec in self:
            rec.is_manager = is_manager

    @api.depends("element_ids.review_status", "element_ids.link_count")
    def _compute_element_stats(self):
        for rec in self:
            rec.element_count = len(rec.element_ids)
            rec.review_count = len(rec.element_ids.filtered(lambda e: e.review_status == "pending"))
            rec.link_count = sum(rec.element_ids.mapped("link_count"))

    def _lineage_domain(self):
        self.ensure_one()
        root = self.root_id or self
        return ["|", ("id", "=", root.id), ("root_id", "=", root.id)]

    def _compute_version_count(self):
        Process = self.with_context(active_test=False)
        for rec in self:
            if not rec.id:
                rec.version_count = 1
                rec.is_latest_version = True
                continue
            versions = Process.search(rec._lineage_domain())
            rec.version_count = len(versions)
            rec.is_latest_version = rec == versions.sorted("id")[-1:]

    # ------------------------------------------------------------------
    # constraints / CRUD
    # ------------------------------------------------------------------
    @api.constrains("code", "version", "company_id")
    def _check_code_version_unique(self):
        for rec in self.filtered("code"):
            dup = self.with_context(active_test=False).search_count([
                ("id", "!=", rec.id), ("code", "=", rec.code), ("version", "=", rec.version),
                ("company_id", "=", rec.company_id.id),
            ], limit=1)
            if dup:
                raise ValidationError(self.env._("A process with this code and version already exists."))

    @api.constrains("parent_id")
    def _check_parent_recursion(self):
        if self._has_cycle():
            raise ValidationError(self.env._("A process cannot be its own parent."))

    @api.model
    def _prepare_bpmn(self, xml):
        if not xml:
            return DEFAULT_BPMN_XML
        try:
            return normalize_bpmn(xml)
        except BpmnError as e:
            raise ValidationError(self.env._("Invalid BPMN diagram: %s", e)) from e

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if "bpmn_xml" in vals:
                vals["bpmn_xml"] = self._prepare_bpmn(vals["bpmn_xml"])
        records = super().create(vals_list)
        records._rebuild_element_index()
        return records

    def write(self, vals):
        if "state" in vals and any(rec.state != vals["state"] for rec in self):
            raise UserError(self.env._(
                "The status changes only through the buttons (Submit for Review, Publish, ...)."))
        locked = {f for f in CONTENT_FIELDS & set(vals)
                  if any(rec[f] != vals[f] for rec in self)}
        if locked:
            frozen = self.filtered(lambda r: r.state != "draft")
            if frozen:
                raise UserError(self.env._(
                    "Only draft versions can be edited. \"%(name)s\" is %(state)s: create a new "
                    "version to change it.",
                    name=frozen[0].display_name,
                    state=dict(self._fields["state"]._description_selection(self.env))[frozen[0].state],
                ))
        if "bpmn_xml" in vals:
            vals["bpmn_xml"] = self._prepare_bpmn(vals["bpmn_xml"])
        res = super().write(vals)
        if "bpmn_xml" in vals:
            self._rebuild_element_index()
        return res

    def copy_data(self, default=None):
        vals_list = super().copy_data(default=default)
        if not self.env.context.get("bpmn_new_version"):
            for rec, vals in zip(self, vals_list):
                vals.setdefault("name", self.env._("%s (copy)", rec.name))
        return vals_list

    @api.depends("name", "code", "version")
    def _compute_display_name(self):
        for rec in self:
            name = rec.name or ""
            if rec.code:
                name = "[%s] %s" % (rec.code, name)
            rec.display_name = "%s (v%s)" % (name, rec.version) if rec.version else name

    # ------------------------------------------------------------------
    # element index
    # ------------------------------------------------------------------
    def _rebuild_element_index(self):
        Element = self.env["business.process.element"].sudo()
        for rec in self:
            try:
                items = extract_elements(rec.bpmn_xml or DEFAULT_BPMN_XML)
            except BpmnError as e:
                _logger.warning("Cannot index process %s: %s", rec.id, e)
                items = []
            rec.sudo().element_ids.unlink()
            vals = []
            for it in items:
                resp = it["responsible"] or {}
                model = resp.get("model") if resp.get("model") in self.env else False
                vals.append({
                    "process_id": rec.id,
                    "element_id": it["element_id"],
                    "element_type": it["element_type"],
                    "name": it["name"],
                    "lane_name": it["lane_name"],
                    "pool_name": it["pool_name"],
                    "documentation": it["documentation"],
                    "link_count": len(it["links"]),
                    "responsible_model": model,
                    "responsible_res_id": model and resp.get("resId") or False,
                    "responsible_name": resp.get("name") or False,
                    "responsible_inherited": bool(resp.get("inherited")),
                    "review_status": "pending" if it["review"] else "none",
                    "review_reason": it["review"] and (
                        it["review"].get("reason") if it["review"].get("reason") in REVIEW_REASONS
                        else "imported") or False,
                    "review_note": (it["review"] or {}).get("note") or False,
                })
            if vals:
                Element.create(vals)

    def action_rebuild_index(self):
        self._rebuild_element_index()
        return True

    # ------------------------------------------------------------------
    # life cycle
    # ------------------------------------------------------------------
    def _write_state(self, vals):
        """State transitions, only reachable through the action methods
        (bypasses the lock in write(); still runs mail tracking)."""
        return super(BusinessProcess, self).write(vals)

    def unlink(self):
        # keep the version chain valid when its first version is deleted
        for root in self.filtered(lambda r: not r.root_id):
            rest = self.with_context(active_test=False).search(
                [("root_id", "=", root.id), ("id", "not in", self.ids)], order="id")
            if rest:
                new_root = rest[0]
                super(BusinessProcess, new_root).write({"root_id": False})
                super(BusinessProcess, rest[1:]).write({"root_id": new_root.id})
        return super().unlink()

    def _check_manager(self):
        if not self.env.user.has_group("bpmn_process_management.group_process_manager"):
            raise AccessError(self.env._("Only Process Managers can do this."))

    def action_submit_review(self):
        self._check_manager()
        for rec in self:
            if rec.state != "draft":
                raise UserError(self.env._("Only drafts can be submitted for review."))
        self._write_state({"state": "review"})
        return True

    def action_back_to_draft(self):
        self._check_manager()
        for rec in self:
            if rec.state != "review":
                raise UserError(self.env._("Only versions in review can go back to draft."))
        self._write_state({"state": "draft"})
        return True

    def action_publish(self):
        self._check_manager()
        for rec in self:
            if rec.state not in ("draft", "review"):
                raise UserError(self.env._("Only drafts or versions in review can be published."))
            older = self.with_context(active_test=False).search(
                rec._lineage_domain() + [("state", "=", "published"), ("id", "!=", rec.id)])
            older._write_state({"state": "deprecated"})
            if older:
                # sub-processes follow the new version of their parent
                self.search([("parent_id", "in", older.ids)]).write({"parent_id": rec.id})
            rec._write_state({"state": "published", "published_date": fields.Datetime.now(),
                              "published_by_id": self.env.user.id})
            body = self.env._("Version %(version)s was published.", version=rec.version)
            if rec.review_count:
                body += " " + self.env._("%(count)s diagram items are still flagged for review.",
                                         count=rec.review_count)
            rec.message_post(body=body, subtype_xmlid="mail.mt_comment")
        return True

    def action_deprecate(self):
        self._check_manager()
        self.filtered(lambda r: r.state == "published")._write_state({"state": "deprecated"})
        return True

    @staticmethod
    def _next_version(version, major=False):
        m = re.match(r"^\s*(\d+)(?:\.(\d+))?", version or "")
        if not m:
            return "2.0" if major else "1.1"
        a, b = int(m.group(1)), int(m.group(2) or 0)
        return "%d.0" % (a + 1) if major else "%d.%d" % (a, b + 1)

    def action_new_version(self, major=False):
        self._check_manager()
        self.ensure_one()
        versions = self.with_context(active_test=False).search(self._lineage_domain())
        latest = versions.sorted("id")[-1]
        if latest.state in ("draft", "review"):
            raise UserError(self.env._(
                "Version %s is already being prepared. Finish or delete it first.", latest.version))
        new_version = self._next_version(latest.version, major=major)
        new = self.with_context(bpmn_new_version=True).copy({
            "version": new_version,
            "state": "draft",
            "code": self.code,
            "root_id": (self.root_id or self).id,
            "previous_version_id": self.id,
        })
        new.message_post(body=self.env._("Created from version %s.", self.version))
        return {
            "type": "ir.actions.act_window",
            "res_model": "business.process",
            "res_id": new.id,
            "view_mode": "form",
            "views": [[False, "form"]],
            "target": "current",
        }

    def action_new_major_version(self):
        return self.action_new_version(major=True)

    def action_view_versions(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Versions"),
            "res_model": "business.process",
            "view_mode": "list,form",
            "views": [[False, "list"], [False, "form"]],
            "domain": self._lineage_domain(),
            "context": {"active_test": False},
        }

    def action_view_review_items(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Items to Review"),
            "res_model": "business.process.element",
            "view_mode": "list",
            "views": [[False, "list"]],
            "domain": [("process_id", "=", self.id), ("review_status", "=", "pending")],
        }

    def action_export_bpmn(self):
        self.ensure_one()
        return {"type": "ir.actions.act_url", "target": "self",
                "url": "/bpmn_process_management/export/%s/bpmn" % self.id}

    def action_export_drawio(self):
        self.ensure_one()
        return {"type": "ir.actions.act_url", "target": "self",
                "url": "/bpmn_process_management/export/%s/drawio" % self.id}

    def action_open_import(self):
        self.ensure_one()
        self._check_manager()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Import Diagram"),
            "res_model": "business.process.import",
            "view_mode": "form",
            "views": [[False, "form"]],
            "target": "new",
            "context": {"default_process_id": self.id, "default_mode": "replace"},
        }

    def action_match_responsibles(self):
        """Re-run automatic matching of lanes to departments / groups."""
        self._check_manager()
        for rec in self:
            if rec.state != "draft":
                raise UserError(self.env._("Only drafts can be modified."))
            xml, matched, missing = apply_responsible_matching(
                rec.bpmn_xml, rec._responsible_matcher())
            rec.bpmn_xml = xml
            rec.message_post(body=self.env._(
                "Responsibility matching: %(matched)s matched, %(missing)s without a match.",
                matched=matched, missing=missing))
        return True

    # ------------------------------------------------------------------
    # helpers used by the import wizard and the web client
    # ------------------------------------------------------------------
    @api.model
    def _responsible_matcher(self):
        """Return a callable name -> responsible dict, trying departments,
        job positions, then user groups (exact, case-insensitive name)."""
        cache = {}

        def match(name):
            key = (name or "").strip().lower()
            if not key:
                return None
            if key in cache:
                return cache[key]
            found = None
            for model in ("hr.department", "hr.job", "res.groups"):
                if model not in self.env:
                    continue
                Model = self.env[model]
                field = "name"
                recs = Model.search([(field, "=ilike", name.strip())], limit=2)
                if len(recs) == 1:
                    found = self._responsible_payload(recs)
                    break
            cache[key] = found
            return found
        return match

    @api.model
    def _responsible_payload(self, record):
        xmlid = record.get_external_id().get(record.id) or False
        if xmlid and xmlid.startswith("__"):
            xmlid = False
        return {"model": record._name, "resId": record.id, "xmlid": xmlid,
                "name": record.display_name}

    @api.model
    def bpmn_get_options(self):
        """Capabilities for the diagram editor (depends on installed apps)."""
        record_models = []
        for model in RECORD_LINK_MODELS:
            if model in self.env and self.env[model].has_access("read"):
                record_models.append({"model": model,
                                      "label": self.env["ir.model"]._get(model).name})
        responsible = []
        for model in RESPONSIBLE_MODELS:
            if model in self.env and self.env[model].has_access("read"):
                responsible.append({"model": model,
                                    "label": self.env["ir.model"]._get(model).name})
        return {"record_models": record_models, "responsible_models": responsible,
                "is_manager": self.env.user.has_group(
                    "bpmn_process_management.group_process_manager")}

    @api.model
    def bpmn_search_targets(self, kind, term="", model=None, limit=8):
        """Autocomplete for links and responsibilities in the modeler."""
        self._check_manager()
        term = (term or "").strip()
        limit = min(int(limit or 8), 20)
        if kind == "menu":
            Menu = self.env["ir.ui.menu"]
            visible = Menu.browse(Menu._visible_menu_ids())
            menus = visible.filtered(lambda m: m.action and (
                not term or term.lower() in (m.complete_name or "").lower()))
            menus = menus.sorted(lambda m: len(m.complete_name or ""))[:limit]
            return [{"resId": m.id, "name": m.complete_name,
                     "xmlid": self._xmlid(m)} for m in menus]
        if kind == "action":
            acts = self.env["ir.actions.act_window"].search(
                [("name", "ilike", term)] if term else [], limit=limit)
            return [{"resId": a.id, "name": "%s (%s)" % (a.name, a.res_model),
                     "xmlid": self._xmlid(a)} for a in acts]
        if kind in ("record", "responsible"):
            allowed = RECORD_LINK_MODELS if kind == "record" else RESPONSIBLE_MODELS
            if model not in allowed or model not in self.env:
                return []
            Model = self.env[model]
            Model.check_access("read")
            if term:
                recs = Model.browse([rid for rid, _name in Model.name_search(term, limit=limit)])
            else:
                recs = Model.search([], limit=limit)
            return [{"resId": r.id, "name": r.display_name, "xmlid": self._xmlid(r)}
                    for r in recs]
        return []

    @api.model
    def _xmlid(self, record):
        xmlid = record.get_external_id().get(record.id) or False
        if xmlid and xmlid.startswith("__"):
            return False
        return xmlid

    @api.model
    def _resolve_record(self, model, res_id=None, xmlid=None):
        """Find the target of a link, preferring the portable xmlid."""
        if not model or model not in self.env:
            return self.env["ir.ui.menu"].browse()  # empty recordset
        rec = self.env[model].browse()
        if xmlid:
            rec = self.env.ref(xmlid, raise_if_not_found=False) or self.env[model].browse()
            if rec and rec._name != model:
                rec = self.env[model].browse()
        if not rec and res_id:
            rec = self.env[model].browse(int(res_id)).exists()
        return rec

    @api.model
    def bpmn_resolve(self, refs):
        """Check a batch of links/responsibles from a diagram.

        ``refs``: list of dicts with ``key``, ``linkType``/``model``, ``resId``, ``xmlid``.
        Returns ``{key: {'ok': bool, 'name': str}}`` (current name if found)."""
        out = {}
        for ref in refs or []:
            key = ref.get("key")
            ltype = ref.get("linkType") or "record"
            if ltype == "url":
                out[key] = {"ok": is_safe_url(ref.get("url")), "name": ref.get("url")}
                continue
            model = {"menu": "ir.ui.menu", "action": "ir.actions.act_window"}.get(ltype, ref.get("model"))
            if model not in LINKABLE_MODELS or model not in self.env:
                out[key] = {"ok": False, "name": False}
                continue
            try:
                rec = self._resolve_record(model, ref.get("resId"), ref.get("xmlid"))
                if rec and ltype == "menu":
                    rec = rec.filtered(lambda m: m.id in self.env["ir.ui.menu"]._visible_menu_ids())
                if rec:
                    rec.check_access("read")
                out[key] = {"ok": bool(rec), "name": rec.display_name if rec else False,
                            "resId": rec.id if rec else False}
            except AccessError:
                out[key] = {"ok": False, "name": False}
        return out

    @api.model
    def bpmn_open_link(self, link):
        """Return the client action for a link stored in a diagram."""
        ltype = (link or {}).get("linkType") or "record"
        if ltype == "url":
            url = (link.get("url") or "").strip()
            if not is_safe_url(url):
                raise UserError(self.env._("This link is not allowed: %s", url))
            return {"type": "ir.actions.act_url", "url": url,
                    "target": "self" if url.startswith("/") else "new"}
        if ltype == "menu":
            menu = self._resolve_record("ir.ui.menu", link.get("resId"), link.get("xmlid"))
            if not menu or menu.id not in self.env["ir.ui.menu"]._visible_menu_ids():
                raise UserError(self.env._("The linked menu does not exist or you cannot access it."))
            if not menu.action:
                raise UserError(self.env._("The linked menu has no action."))
            return {"action_id": menu.action.id, "menu_id": menu.id}
        if ltype == "action":
            act = self._resolve_record("ir.actions.act_window", link.get("resId"), link.get("xmlid"))
            if not act:
                raise UserError(self.env._("The linked action no longer exists."))
            return {"action_id": act.id}
        model = link.get("model")
        if model not in RECORD_LINK_MODELS + RESPONSIBLE_MODELS:
            raise UserError(self.env._("The linked document no longer exists."))
        rec = self._resolve_record(model, link.get("resId"), link.get("xmlid"))
        if not rec:
            raise UserError(self.env._("The linked document no longer exists."))
        rec.check_access("read")
        return {"type": "ir.actions.act_window", "res_model": rec._name, "res_id": rec.id,
                "views": [[False, "form"]], "target": "current"}
