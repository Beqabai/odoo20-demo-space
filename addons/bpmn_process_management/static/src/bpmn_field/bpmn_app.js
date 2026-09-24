/** Part of bpmn_process_management. License LGPL-3.
 *
 * Framework-independent diagram application (viewer + modeler + side panel).
 * It only touches the DOM element it receives, so the thin OWL wrapper in
 * bpmn_field.js works unchanged with Owl 2 (Odoo 19) and Owl 3 (Odoo 20).
 */
import { _t } from "@web/core/l10n/translation";
import { loadCSS, loadJS } from "@web/core/assets";
import { getBpmnTerms, getReviewReasons, getTypeLabels } from "./bpmn_terms";

const LIB = "/bpmn_process_management/static/lib/bpmn-js";
let libPromise = null;

export function loadBpmnLib() {
    if (!libPromise) {
        libPromise = Promise.all([
            loadCSS("" + (LIB) + "/assets/diagram-js.css"),
            loadCSS("" + (LIB) + "/assets/bpmn-js.css"),
            loadCSS("" + (LIB) + "/assets/bpmn-font/css/bpmn.css"),
            loadJS("" + (LIB) + "/odoo-bpmn.min.js"),
        ]).then(() => window.OdooBpmn);
        libPromise.catch(() => (libPromise = null));
    }
    return libPromise;
}

const LINKABLE = [
    "bpmn:Task", "bpmn:UserTask", "bpmn:ManualTask", "bpmn:ServiceTask", "bpmn:ScriptTask",
    "bpmn:SendTask", "bpmn:ReceiveTask", "bpmn:BusinessRuleTask", "bpmn:SubProcess",
    "bpmn:Transaction", "bpmn:CallActivity", "bpmn:StartEvent", "bpmn:EndEvent",
    "bpmn:IntermediateThrowEvent", "bpmn:IntermediateCatchEvent", "bpmn:BoundaryEvent",
    "bpmn:ExclusiveGateway", "bpmn:InclusiveGateway", "bpmn:ParallelGateway",
    "bpmn:ComplexGateway", "bpmn:EventBasedGateway", "bpmn:DataObjectReference",
    "bpmn:DataStoreReference", "bpmn:Participant", "bpmn:Lane",
];
const RESPONSIBLE_TYPES = ["bpmn:Lane", "bpmn:Participant"];
const NO_LANE_INFO = ["bpmn:TextAnnotation", "bpmn:DataObjectReference", "bpmn:DataStoreReference",
    "bpmn:Group"];
// Regexes are built from strings because the Odoo term extractor mis-parses some regex literals.
const SAFE_URL = new RegExp("^(https?:\\/\\/[^\\/\\\\\\s]|mailto:|\\/(?![\\/\\\\]))", "i");
const URL_BAD_CHARS = new RegExp("[\\\\\\u0000-\\u0020\\u007f]");
const UNSAFE_FILENAME_CHARS = new RegExp("[\\\\/:*?\"<>|]+", "g");
const PLACEHOLDER = new RegExp("{([^}]+)}", "g");
const HAS_DI = new RegExp("BPMNShape|BPMNEdge");
const HAS_PROCESS = new RegExp("<(\\w+:)?process[\\s>]");

/** Tiny DOM builder: h("div", {class: "x", onclick: fn}, "text", child) */
function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
        if (v === undefined || v === null || v === false) {
            continue;
        }
        if (k.startsWith("on") && typeof v === "function") {
            el.addEventListener(k.slice(2), v);
        } else if (k === "class") {
            el.className = v;
        } else if (k === "value") {
            el.value = v;
        } else {
            el.setAttribute(k, v === true ? "" : v);
        }
    }
    for (const c of children.flat()) {
        if (c === null || c === undefined || c === false) {
            continue;
        }
        el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
}

// Inline SVG icons: Odoo 19 ships Font Awesome, Odoo 20 Material Symbols, so the
// editor carries its own tiny icon set to look the same on both.
const ICONS = {
    "search-plus": '<circle cx="10" cy="10" r="6"/><path d="M14.5 14.5L20 20M7 10h6M10 7v6"/>',
    "search-minus": '<circle cx="10" cy="10" r="6"/><path d="M14.5 14.5L20 20M7 10h6"/>',
    "arrows-alt": '<path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/><rect x="9" y="9" width="6" height="6"/>',
    undo: '<path d="M9 13L4 8l5-5"/><path d="M4 8h10a6 6 0 0 1 0 12h-3"/>',
    repeat: '<path d="M15 13l5-5-5-5"/><path d="M20 8H10a6 6 0 0 0 0 12h3"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>',
    "chain-broken": '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/><path d="M4 4l16 16"/>',
    "exclamation-triangle": '<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17v.5"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    times: '<path d="M6 6l12 12M18 6L6 18"/>',
    users: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14a5 5 0 0 1 5 6"/>',
    bars: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    "external-link": '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
    "file-text-o": '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
};

function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "14");
    svg.setAttribute("height", "14");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", "o_bpmn_icon");
    svg.innerHTML = ICONS[name] || "";
    return svg;
}

function debounce(fn, delay) {
    let timer;
    const wrapped = (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
    wrapped.cancel = () => clearTimeout(timer);
    return wrapped;
}

function downloadBlob(content, filename, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
}

function safeFileName(name) {
    return (name || "process").replace(UNSAFE_FILENAME_CHARS, "_").slice(0, 80);
}

export class BpmnApp {
    /**
     * @param {HTMLElement} host
     * @param {{orm, action, notification}} services
     * @param {(values: Object) => Promise} onChange
     */
    constructor(host, services, onChange) {
        this.host = host;
        this.orm = services.orm;
        this.action = services.action;
        this.notification = services.notification;
        this.onChange = onChange;
        this.snapshot = null;
        this.instance = null;
        this.mode = null;
        this.lastXml = null;
        this.selected = null;
        this.resolved = {};
        this.options = { record_models: [], responsible_models: [], is_manager: false };
        this.pendingSave = null;
        this.changedSinceSave = false;
        this.emitted = [];
        this.destroyed = false;
        this.typeLabels = getTypeLabels();
        this.reviewReasons = getReviewReasons();
        this.scheduleSave = debounce(() => this.flush(), 400);
        this.scheduleOverlays = debounce(() => this.refreshOverlays(), 150);
        this.buildLayout();
        if (odoo.debug) {
            window.__bpmnApp = this; // handy for support / automated UI checks
        }
    }

    // ------------------------------------------------------------------
    // layout
    // ------------------------------------------------------------------
    buildLayout() {
        this.canvasEl = h("div", { class: "o_bpmn_canvas" });
        this.panelEl = h("aside", { class: "o_bpmn_panel" });
        this.toolbarEl = h("div", { class: "o_bpmn_toolbar", role: "toolbar" });
        this.messageEl = h("div", { class: "o_bpmn_message d-none" });
        this.root = h("div", { class: "o_bpmn_app" },
            this.toolbarEl,
            h("div", { class: "o_bpmn_body" }, this.canvasEl, this.panelEl),
            this.messageEl,
        );
        this.host.replaceChildren(this.root);
        this.onKeydown = (ev) => {
            if (ev.key === "Escape" && this.root.classList.contains("o_bpmn_fullscreen")) {
                this.toggleFullscreen();
            }
        };
        document.addEventListener("keydown", this.onKeydown);
    }

    renderToolbar() {
        const btn = (title, iconName, onclick, extra = {}) =>
            h("button", { type: "button", class: "btn btn-light btn-sm", title, "aria-label": title,
                onclick, ...extra }, icon(iconName));
        const canvas = () => this.instance && this.instance.get("canvas");
        const zoomBy = (f) => {
            const c = canvas();
            if (c) {
                c.zoom(c.zoom() * f);
            }
        };
        const group1 = h("div", { class: "btn-group" },
            btn(_t("Zoom in"), "search-plus", () => zoomBy(1.2)),
            btn(_t("Zoom out"), "search-minus", () => zoomBy(1 / 1.2)),
            btn(_t("Fit to screen"), "arrows-alt", () => this.fit()),
        );
        const items = [group1];
        if (this.mode === "modeler") {
            items.push(h("div", { class: "btn-group" },
                btn(_t("Undo"), "undo", () => this.instance.get("commandStack").undo()),
                btn(_t("Redo"), "repeat", () => this.instance.get("commandStack").redo()),
            ));
        }
        const dl = (label, fmt) => h("button", { type: "button", class: "dropdown-item",
            onclick: () => this.download(fmt) }, label);
        const menu = h("div", { class: "dropdown-menu" },
            dl(_t("BPMN 2.0 (.bpmn)"), "bpmn"),
            dl(_t("draw.io (.drawio) - last saved version"), "drawio"),
            dl(_t("Image (.svg)"), "svg"),
            dl(_t("Image (.png)"), "png"),
        );
        const toggle = h("button", { type: "button", class: "btn btn-light btn-sm dropdown-toggle",
            title: _t("Download"), onclick: () => menu.classList.toggle("show") },
        icon("download"), " ", _t("Download"));
        this.onDocClick = this.onDocClick || ((ev) => {
            if (!this.root.contains(ev.target) || !ev.target.closest(".o_bpmn_dropdown")) {
                this.root.querySelectorAll(".o_bpmn_dropdown .dropdown-menu.show")
                    .forEach((m) => m.classList.remove("show"));
            }
        });
        document.removeEventListener("click", this.onDocClick, true);
        document.addEventListener("click", this.onDocClick, true);
        items.push(h("div", { class: "btn-group o_bpmn_dropdown position-relative" }, toggle, menu));
        this.reviewBtn = h("button", { type: "button", class: "btn btn-sm btn-warning d-none",
            title: _t("Go to the next item to review"), onclick: () => this.selectNextReview() });
        items.push(this.reviewBtn);
        items.push(h("span", { class: "flex-grow-1" }));
        items.push(h("span", { class: "badge " + (this.mode === "modeler" ? "text-bg-primary" : "text-bg-secondary") },
            this.mode === "modeler" ? _t("Editing") : _t("Read only")));
        items.push(btn(_t("Full screen"), "expand", () => this.toggleFullscreen()));
        this.toolbarEl.replaceChildren(...items);
    }

    toggleFullscreen() {
        this.root.classList.toggle("o_bpmn_fullscreen");
        if (this.instance) {
            this.instance.get("canvas").resized();
            this.fit();
        }
    }

    fit() {
        if (!this.instance) {
            return;
        }
        const canvas = this.instance.get("canvas");
        canvas.zoom("fit-viewport", "auto");
        if (canvas.zoom() > 1.2) {
            canvas.zoom(1.0, "auto");
        }
    }

    showMessage(text, type = "danger") {
        this.messageEl.className = "o_bpmn_message alert alert-" + (type) + " m-2";
        this.messageEl.textContent = text;
    }

    clearMessage() {
        this.messageEl.className = "o_bpmn_message d-none";
        this.messageEl.textContent = "";
    }

    // ------------------------------------------------------------------
    // life cycle
    // ------------------------------------------------------------------
    async start(snapshot) {
        this.canvasEl.append(h("div", { class: "o_bpmn_loading text-muted p-4" }, _t("Loading diagram...")));
        try {
            const [lib, options] = await Promise.all([
                loadBpmnLib(),
                this.orm.call("business.process", "bpmn_get_options", []),
            ]);
            this.lib = lib;
            this.options = options;
        } catch (e) {
            this.showMessage(_t("The diagram library could not be loaded."));
            throw e;
        }
        if (this.destroyed) {
            return;
        }
        if (snapshot) {
            await this.update(snapshot);
        }
    }

    async update(snapshot) {
        this.snapshot = snapshot;
        if (!this.lib || this.destroyed) {
            return;
        }
        const mode = snapshot.editable ? "modeler" : "viewer";
        const value = snapshot.value || "";
        if (mode !== this.mode) {
            await this.createInstance(mode);
            await this.importXml(value);
        } else if (value !== this.lastXml) {
            if (snapshot.dirty && this.emitted.includes(value)) {
                // Stale echo of one of our own earlier edits (record still being
                // updated): keep the canvas, it holds the newest version.
                return;
            }
            this.emitted = [];
            await this.importXml(value);
        }
    }

    async createInstance(mode) {
        if (this.instance) {
            this.instance.destroy();
            this.instance = null;
        }
        this.canvasEl.replaceChildren();
        this.mode = mode;
        const terms = getBpmnTerms();
        const translateModule = {
            translate: ["value", (template, replacements) => {
                const tpl = terms[template] || template;
                return tpl.replace(PLACEHOLDER, (_, key) =>
                    replacements && key in replacements ? replacements[key] : "{" + (key) + "}");
            }],
        };
        const Ctor = mode === "modeler" ? this.lib.Modeler : this.lib.NavigatedViewer;
        this.instance = new Ctor({
            container: this.canvasEl,
            moddleExtensions: { odoo: this.lib.odooModdle },
            additionalModules: mode === "modeler" && this.lib.odooPaletteModule
                ? [translateModule, this.lib.odooPaletteModule] : [translateModule],
        });
        const bus = this.instance.get("eventBus");
        bus.on("selection.changed", ({ newSelection }) => {
            this.selected = newSelection && newSelection.length === 1 ? newSelection[0] : null;
            this.renderPanel();
        });
        if (mode === "viewer") {
            bus.on("element.click", ({ element }) => {
                this.selected = element && element.type !== "bpmn:Process" &&
                    element.type !== "bpmn:Collaboration" ? element : null;
                this.renderPanel();
            });
        } else {
            bus.on("commandStack.changed", () => {
                this.changedSinceSave = true;
                this.scheduleSave();
                this.scheduleOverlays();
                if (this.selected) {
                    const reg = this.instance.get("elementRegistry");
                    this.selected = reg.get(this.selected.id) || null;
                }
                this.renderPanel();
            });
        }
        this.renderToolbar();
    }

    async importXml(xml) {
        this.clearMessage();
        let toImport = xml;
        let laidOut = false;
        if (xml && !HAS_DI.test(xml) && HAS_PROCESS.test(xml)) {
            try {
                toImport = await this.lib.layoutProcess(xml);
                laidOut = true;
            } catch {
                // keep the original: bpmn-js will show an empty canvas + warning
            }
        }
        try {
            const result = await this.instance.importXML(toImport);
            if (result.warnings && result.warnings.length && this.snapshot && this.snapshot.isManager) {
                console.warn("BPMN import warnings", result.warnings);
            }
        } catch (e) {
            this.lastXml = xml;
            this.showMessage(_t("The diagram could not be displayed: %s", e.message || e));
            return;
        }
        this.lastXml = xml;
        this.changedSinceSave = false;
        this.selected = null;
        this.fit();
        await this.resolveReferences();
        this.refreshOverlays();
        this.renderPanel();
        if (laidOut && this.mode === "modeler") {
            this.changedSinceSave = true;
            this.notification.add(_t("The diagram had no layout and was arranged automatically."),
                { type: "info" });
            this.scheduleSave();
        }
        this.ensurePreview();
        const focus = this.snapshot && this.snapshot.focusElement;
        if (focus) {
            this.focusElement(focus);
            this.snapshot.focusElement = null;
        }
    }

    focusElement(id) {
        const reg = this.instance.get("elementRegistry");
        const el = reg.get(id);
        if (!el) {
            return;
        }
        if (this.mode === "modeler") {
            this.instance.get("selection").select(el);
        } else {
            this.selected = el;
            this.renderPanel();
        }
        try {
            this.instance.get("canvas").scrollToElement(el, { top: 120, bottom: 120, left: 200, right: 200 });
        } catch {
            // scrollToElement is best effort
        }
    }

    /** Imported or never edited diagrams have no kanban thumbnail yet: make one. */
    async ensurePreview() {
        const snap = this.snapshot;
        if (!snap || !snap.isManager || snap.hasPreview || !snap.resId || this._previewDone) {
            return;
        }
        this._previewDone = true;
        try {
            const { svg } = await this.instance.saveSVG();
            await this.orm.write("business.process", [snap.resId], { diagram_preview: utf8ToBase64(svg) });
        } catch {
            // thumbnail is cosmetic
        }
    }

    async flush() {
        this.scheduleSave.cancel();
        if (!this.instance || this.mode !== "modeler" || this.destroyed) {
            return;
        }
        // Loop: edits made while a save is running must be pushed too.
        while (this.pendingSave || this.changedSinceSave) {
            if (!this.pendingSave) {
                this.changedSinceSave = false;
                this.pendingSave = this._save().finally(() => (this.pendingSave = null));
            }
            await this.pendingSave;
        }
    }

    async _save() {
        const definitions = this.instance.getDefinitions();
        for (const el of (definitions && definitions.rootElements) || []) {
            if (el.$type === "bpmn:Process") {
                el.isExecutable = false;
            }
        }
        const { xml } = await this.instance.saveXML({ format: true });
        if (xml === this.lastXml) {
            return;
        }
        let preview = false;
        try {
            const { svg } = await this.instance.saveSVG();
            preview = utf8ToBase64(svg);
        } catch {
            preview = false;
        }
        this.lastXml = xml;
        this.emitted.push(xml);
        if (this.emitted.length > 20) {
            this.emitted.shift();
        }
        await this.onChange({ bpmn_xml: xml, diagram_preview: preview });
    }

    destroy() {
        this.destroyed = true;
        this.scheduleSave.cancel();
        this.scheduleOverlays.cancel();
        document.removeEventListener("keydown", this.onKeydown);
        if (this.onDocClick) {
            document.removeEventListener("click", this.onDocClick, true);
        }
        if (this.instance) {
            this.instance.destroy();
            this.instance = null;
        }
    }

    // ------------------------------------------------------------------
    // Odoo metadata helpers (extensionElements)
    // ------------------------------------------------------------------
    extValues(bo, type) {
        const ext = bo && bo.extensionElements;
        return ((ext && ext.values) || []).filter((v) => v.$instanceOf && v.$instanceOf(type));
    }

    links(bo) {
        return this.extValues(bo, "odoo:Link");
    }

    responsible(bo) {
        return this.extValues(bo, "odoo:Responsible")[0] || null;
    }

    review(bo) {
        const r = this.extValues(bo, "odoo:Review")[0];
        return r && (r.status || "pending") === "pending" ? r : null;
    }

    documentation(bo) {
        return ((bo && bo.documentation) || []).map((d) => d.text || "").join("\n").trim();
    }

    setExtValues(element, type, newValues) {
        const modeling = this.instance.get("modeling");
        const moddle = this.instance.get("moddle");
        const bo = element.businessObject;
        let ext = bo.extensionElements;
        if (!ext) {
            ext = moddle.create("bpmn:ExtensionElements", { values: [] });
            modeling.updateModdleProperties(element, bo, { extensionElements: ext });
        }
        const others = (ext.values || []).filter((v) => !(v.$instanceOf && v.$instanceOf(type)));
        modeling.updateModdleProperties(element, ext, { values: [...others, ...newValues] });
    }

    createExt(type, attrs) {
        const moddle = this.instance.get("moddle");
        const clean = {};
        for (const [k, v] of Object.entries(attrs)) {
            if (v !== undefined && v !== null && v !== false && v !== "") {
                clean[k] = v;
            }
        }
        return moddle.create(type, clean);
    }

    // ------------------------------------------------------------------
    // reference resolution & overlays
    // ------------------------------------------------------------------
    async resolveReferences() {
        const refs = [];
        const reg = this.instance.get("elementRegistry");
        for (const el of reg.getAll()) {
            const bo = el.businessObject;
            if (!bo || el.labelTarget) {
                continue;
            }
            this.links(bo).forEach((lk, idx) => refs.push({
                key: "" + (el.id) + ":link:" + (idx), linkType: lk.linkType, model: lk.model,
                resId: lk.resId, xmlid: lk.xmlid, url: lk.url,
            }));
            const resp = this.responsible(bo);
            if (resp) {
                refs.push({ key: "" + (el.id) + ":resp", linkType: "record", model: resp.model,
                    resId: resp.resId, xmlid: resp.xmlid });
            }
        }
        this.resolved = {};
        if (!refs.length) {
            return;
        }
        try {
            this.resolved = await this.orm.call("business.process", "bpmn_resolve", [refs]);
        } catch {
            this.resolved = {};
        }
    }

    reviewItems() {
        const reg = this.instance ? this.instance.get("elementRegistry") : null;
        if (!reg) {
            return [];
        }
        const out = [];
        for (const el of reg.getAll()) {
            if (el.labelTarget || !el.businessObject) {
                continue;
            }
            const bo = el.businessObject;
            const rv = this.review(bo);
            let broken = false;
            this.links(bo).forEach((_lk, idx) => {
                const r = this.resolved["" + (el.id) + ":link:" + (idx)];
                if (r && !r.ok) {
                    broken = true;
                }
            });
            const resp = this.resolved["" + (el.id) + ":resp"];
            if (resp && !resp.ok) {
                broken = true;
            }
            if (rv || broken) {
                out.push({ element: el, reason: rv ? rv.reason : "link_broken", broken });
            }
        }
        return out;
    }

    refreshOverlays() {
        if (!this.instance) {
            return;
        }
        const overlays = this.instance.get("overlays");
        overlays.remove({ type: "odoo-review" });
        overlays.remove({ type: "odoo-link" });
        const isManager = this.snapshot && this.snapshot.isManager;
        const reg = this.instance.get("elementRegistry");
        for (const el of reg.getAll()) {
            if (el.labelTarget || !el.businessObject || el.waypoints) {
                continue;
            }
            const n = this.links(el.businessObject).length;
            if (n && el.type !== "bpmn:Lane" && el.type !== "bpmn:Participant") {
                overlays.add(el.id, "odoo-link", {
                    position: { bottom: 8, left: -6 },
                    html: h("div", { class: "o_bpmn_badge o_bpmn_badge_link", title: _t("%s link(s)", n) },
                        icon("link")),
                });
            }
        }
        const items = isManager ? this.reviewItems() : [];
        for (const item of items) {
            const el = item.element;
            const pos = el.type === "bpmn:Lane" || el.type === "bpmn:Participant"
                ? { top: 4, left: 34 } : { top: -10, right: 10 };
            overlays.add(el.id, "odoo-review", {
                position: pos,
                html: h("div", { class: "o_bpmn_badge o_bpmn_badge_review",
                    title: this.reviewReasons[item.reason] || this.reviewReasons.imported }, "!"),
            });
        }
        if (this.reviewBtn) {
            this.reviewBtn.classList.toggle("d-none", !items.length);
            this.reviewBtn.replaceChildren(icon("exclamation-triangle"), " ",
                _t("%s to review", items.length));
        }
        this._reviewCount = items.length;
    }

    selectNextReview() {
        const items = this.reviewItems();
        if (!items.length) {
            return;
        }
        const idx = this.selected ? items.findIndex((i) => i.element.id === this.selected.id) : -1;
        const next = items[(idx + 1) % items.length].element;
        this.focusElement(next.id);
    }

    // ------------------------------------------------------------------
    // side panel
    // ------------------------------------------------------------------
    renderPanel() {
        if (!this.instance) {
            return;
        }
        const el = this.selected;
        const valid = el && el.businessObject && !el.labelTarget &&
            !["bpmn:Process", "bpmn:Collaboration", "label"].includes(el.type);
        const content = valid ? this.renderElementPanel(el) : this.renderOverview();
        this.panelEl.replaceChildren(...content);
    }

    typeLabel(el) {
        return this.typeLabels[el.type] || el.type.replace("bpmn:", "");
    }

    laneOf(el) {
        const reg = this.instance.get("elementRegistry");
        const bo = el.businessObject;
        for (const lane of reg.filter((e) => e.type === "bpmn:Lane")) {
            const refs = lane.businessObject.flowNodeRef || [];
            if (refs.includes(bo)) {
                return lane;
            }
        }
        let p = el.parent;
        while (p) {
            if (p.type === "bpmn:Participant") {
                return p;
            }
            p = p.parent;
        }
        return null;
    }

    responsibleName(el) {
        const resp = this.responsible(el.businessObject);
        if (!resp) {
            return null;
        }
        const r = this.resolved["" + (el.id) + ":resp"];
        return (r && r.ok && r.name) || resp.name || "";
    }

    renderOverview() {
        const out = [];
        const reg = this.instance.get("elementRegistry");
        out.push(h("h5", { class: "mb-2" }, _t("Process overview")));
        out.push(h("p", { class: "text-muted small" }, this.mode === "modeler"
            ? _t("Select a shape to edit its instructions, links and responsible department.")
            : _t("Click a task to read its work instruction and open the related Odoo screen.")));
        const lanes = reg.filter((e) => e.type === "bpmn:Lane" ||
            (e.type === "bpmn:Participant" && !(e.businessObject.processRef &&
                e.businessObject.processRef.laneSets && e.businessObject.processRef.laneSets.length)));
        if (lanes.length) {
            out.push(h("h6", { class: "mt-3" }, _t("Responsibilities")));
            out.push(h("ul", { class: "list-unstyled o_bpmn_lane_list" }, lanes.map((lane) => {
                const resp = this.responsibleName(lane);
                return h("li", { class: "d-flex justify-content-between gap-2 py-1 border-bottom",
                    role: "button", onclick: () => this.focusElement(lane.id) },
                h("span", {}, lane.businessObject.name || _t("(unnamed lane)")),
                h("span", { class: resp ? "text-body-secondary" : "text-warning" },
                    resp || _t("not assigned")));
            })));
        }
        if (this.snapshot && this.snapshot.isManager) {
            const items = this.reviewItems();
            if (items.length) {
                out.push(h("h6", { class: "mt-3" }, icon("exclamation-triangle"), " ",
                    _t("To review (%s)", items.length)));
                out.push(h("ul", { class: "list-unstyled small" }, items.slice(0, 60).map((it) =>
                    h("li", { class: "py-1 border-bottom", role: "button",
                        onclick: () => this.focusElement(it.element.id) },
                    h("b", {}, it.element.businessObject.name || this.typeLabel(it.element)), h("br"),
                    h("span", { class: "text-muted" }, this.reviewReasons[it.reason] || ""),
                    ))));
            }
        }
        return out;
    }

    renderElementPanel(el) {
        const bo = el.businessObject;
        const editing = this.mode === "modeler";
        const out = [];
        out.push(h("div", { class: "text-muted small text-uppercase" }, this.typeLabel(el)));
        if (editing && el.type !== "bpmn:TextAnnotation" && !el.waypoints) {
            const input = h("input", { class: "form-control form-control-sm mb-2", value: bo.name || "",
                placeholder: _t("Name"), "aria-label": _t("Name") });
            input.addEventListener("change", () =>
                this.instance.get("modeling").updateLabel(el, input.value));
            out.push(input);
        } else {
            out.push(h("h5", { class: "mb-2" }, bo.name || (bo.text) || _t("(no name)")));
        }

        // review
        const rv = this.review(bo);
        if (rv && this.snapshot && this.snapshot.isManager) {
            out.push(h("div", { class: "alert alert-warning py-2 px-2 small" },
                h("div", {}, icon("exclamation-triangle"), " ",
                    this.reviewReasons[rv.reason] || this.reviewReasons.imported),
                rv.note ? h("div", { class: "fst-italic" }, rv.note) : null,
                editing ? h("button", { type: "button", class: "btn btn-sm btn-warning mt-2",
                    onclick: () => this.setExtValues(el, "odoo:Review", []) },
                icon("check"), " ", _t("Mark as reviewed")) : null,
            ));
        }

        // responsible
        if (RESPONSIBLE_TYPES.includes(el.type)) {
            out.push(this.renderResponsible(el, editing));
        } else if (!el.waypoints && !NO_LANE_INFO.includes(el.type)) {
            const lane = this.laneOf(el);
            if (lane) {
                const resp = this.responsibleName(lane);
                const laneName = lane.businessObject.name || "";
                out.push(h("div", { class: "small mb-2" },
                    laneName ? h("div", {}, h("span", { class: "text-muted" },
                        lane.type === "bpmn:Lane" ? _t("Lane: ") : _t("Pool: ")), laneName) : null,
                    h("div", {}, h("span", { class: "text-muted" }, _t("Responsible: ")),
                        resp ? h("b", {}, resp) : h("span", { class: "text-warning" }, _t("not assigned")))));
            }
        }

        // documentation
        out.push(h("h6", { class: "mt-2" }, _t("Work instruction")));
        const docText = this.documentation(bo);
        if (editing) {
            const ta = h("textarea", { class: "form-control form-control-sm", rows: "6",
                placeholder: _t("What has to be done, rules, controls, documents..."),
                "aria-label": _t("Work instruction") });
            ta.value = docText;
            ta.addEventListener("change", () => {
                const moddle = this.instance.get("moddle");
                const docs = ta.value.trim() ? [moddle.create("bpmn:Documentation", { text: ta.value })] : [];
                this.instance.get("modeling").updateProperties(el, { documentation: docs });
            });
            out.push(ta);
        } else {
            out.push(docText ? h("div", { class: "o_bpmn_doc" }, docText)
                : h("div", { class: "text-muted small" }, _t("No instruction yet.")));
        }

        // links
        if (LINKABLE.includes(el.type)) {
            out.push(this.renderLinks(el, editing));
        }
        if (editing) {
            out.push(h("div", { class: "text-muted small mt-3" }, "ID: ", bo.id));
        }
        return out;
    }

    renderResponsible(el, editing) {
        const bo = el.businessObject;
        const resp = this.responsible(bo);
        const wrap = h("div", { class: "mb-2" }, h("h6", { class: "mt-2" }, _t("Responsible")));
        if (resp) {
            const r = this.resolved["" + (el.id) + ":resp"];
            const broken = r && !r.ok;
            const model = this.options.responsible_models.find((m) => m.model === resp.model);
            wrap.append(h("div", { class: "d-flex align-items-center gap-2 " + (broken ? "text-danger" : "") },
                icon(broken ? "chain-broken" : "users"),
                h("span", { class: "flex-grow-1" }, (r && r.ok && r.name) || resp.name || "",
                    model ? h("span", { class: "text-muted small" }, " (" + (model.label) + ")") : null),
                editing ? h("button", { type: "button", class: "btn btn-link btn-sm p-0",
                    title: _t("Remove"), onclick: () => this.setExtValues(el, "odoo:Responsible", []) },
                icon("times")) : null,
            ));
        } else {
            wrap.append(h("div", { class: "text-muted small" }, _t("Not assigned.")));
        }
        if (editing && this.options.responsible_models.length) {
            wrap.append(this.renderPicker(
                this.options.responsible_models.map((m) => ({ value: "responsible:" + (m.model), label: m.label })),
                async (kind, item) => {
                    const model = kind.split(":")[1];
                    const values = [this.createExt("odoo:Responsible", {
                        model, resId: item.resId, xmlid: item.xmlid, name: item.name,
                    })];
                    this.setExtValues(el, "odoo:Responsible", values);
                    const rv = this.review(bo);
                    if (rv && ["responsible_missing", "responsible_auto"].includes(rv.reason)) {
                        this.setExtValues(el, "odoo:Review", []);
                    }
                    await this.resolveReferences();
                    this.refreshOverlays();
                    this.renderPanel();
                },
                _t("Search a department, job position or group..."),
            ));
        }
        return wrap;
    }

    renderLinks(el, editing) {
        const bo = el.businessObject;
        const links = this.links(bo);
        const wrap = h("div", { class: "mt-3" }, h("h6", {}, _t("Links")));
        if (!links.length && !editing) {
            wrap.append(h("div", { class: "text-muted small" }, _t("No link.")));
        }
        const list = h("div", { class: "d-flex flex-column gap-1" });
        links.forEach((lk, idx) => {
            const r = this.resolved["" + (el.id) + ":link:" + (idx)];
            const broken = r && !r.ok;
            const label = lk.label || (r && r.name) || lk.url || lk.xmlid || _t("Link");
            const kindIcon = { menu: "bars", action: "bolt", url: "external-link" }[lk.linkType] || "file-text-o";
            const open = h("button", { type: "button",
                class: "btn btn-sm text-start " + (broken ? "btn-outline-danger" : "btn-outline-primary") + " flex-grow-1",
                disabled: broken && !editing ? true : null,
                title: broken ? _t("This link is broken or not accessible.") : label,
                onclick: () => this.openLink(lk) },
            icon(broken ? "chain-broken" : kindIcon), " ", label);
            list.append(h("div", { class: "d-flex gap-1 align-items-center" }, open,
                editing ? h("button", { type: "button", class: "btn btn-link btn-sm p-0", title: _t("Remove"),
                    onclick: () => {
                        const rest = links.filter((_x, i) => i !== idx);
                        this.setExtValues(el, "odoo:Link", rest);
                        this.resolveReferences().then(() => this.refreshOverlays());
                    } }, icon("times")) : null));
        });
        wrap.append(list);
        if (editing) {
            const kinds = [{ value: "menu", label: _t("Odoo menu") }];
            for (const m of this.options.record_models) {
                kinds.push({ value: "record:" + (m.model), label: m.label });
            }
            if (odoo.debug) {
                kinds.push({ value: "action", label: _t("Window action (technical)") });
            }
            kinds.push({ value: "url", label: _t("Web address (URL)") });
            wrap.append(this.renderPicker(kinds, async (kind, item) => {
                let link;
                if (kind === "url") {
                    link = { linkType: "url", url: item.url, label: item.label || item.url };
                } else if (kind.startsWith("record:")) {
                    link = { linkType: "record", model: kind.split(":")[1], resId: item.resId,
                        xmlid: item.xmlid, label: item.name };
                } else {
                    link = { linkType: kind, resId: item.resId, xmlid: item.xmlid, label: item.name,
                        model: kind === "menu" ? "ir.ui.menu" : "ir.actions.act_window" };
                }
                this.setExtValues(el, "odoo:Link", [...links, this.createExt("odoo:Link", link)]);
                await this.resolveReferences();
                this.refreshOverlays();
                this.renderPanel();
            }, _t("Search..."), true));
        }
        return wrap;
    }

    /** kind select + search box + result list. onPick(kind, item) */
    renderPicker(kinds, onPick, placeholder, allowUrl = false) {
        const select = h("select", { class: "form-select form-select-sm", "aria-label": _t("Type") },
            kinds.map((k) => h("option", { value: k.value }, k.label)));
        const input = h("input", { class: "form-control form-control-sm", placeholder,
            "aria-label": placeholder });
        const labelInput = h("input", { class: "form-control form-control-sm d-none",
            placeholder: _t("Label (optional)"), "aria-label": _t("Label") });
        const results = h("div", { class: "list-group list-group-flush o_bpmn_results" });
        const addUrl = h("button", { type: "button", class: "btn btn-sm btn-secondary d-none" },
            _t("Add link"));
        const isUrl = () => select.value === "url";
        const refreshKind = () => {
            const url = isUrl();
            labelInput.classList.toggle("d-none", !url);
            addUrl.classList.toggle("d-none", !url);
            input.placeholder = url ? "https://..." : placeholder;
            results.replaceChildren();
        };
        const search = debounce(async () => {
            if (isUrl()) {
                return;
            }
            const kind = select.value;
            let rpcKind = kind;
            let model = null;
            if (kind.startsWith("record:")) {
                rpcKind = "record";
                model = kind.split(":")[1];
            } else if (kind.startsWith("responsible:")) {
                rpcKind = "responsible";
                model = kind.split(":")[1];
            }
            let items = [];
            try {
                items = await this.orm.call("business.process", "bpmn_search_targets",
                    [rpcKind, input.value, model]);
            } catch {
                items = [];
            }
            results.replaceChildren(...(items.length ? items.map((it) =>
                h("button", { type: "button", class: "list-group-item list-group-item-action py-1 small",
                    onclick: () => onPick(kind, it) }, it.name))
                : [h("div", { class: "text-muted small p-1" }, _t("No result."))]));
        }, 250);
        select.addEventListener("change", () => {
            refreshKind();
            search();
        });
        input.addEventListener("input", search);
        input.addEventListener("focus", () => !results.children.length && search());
        addUrl.addEventListener("click", () => {
            const url = input.value.trim();
            if (!SAFE_URL.test(url) || URL_BAD_CHARS.test(url)) {
                this.notification.add(_t("Use an address starting with https://, http://, mailto: or /"),
                    { type: "warning" });
                return;
            }
            onPick("url", { url, label: labelInput.value.trim() });
        });
        if (!allowUrl) {
            // responsible picker: no URL option
        }
        return h("div", { class: "o_bpmn_picker d-flex flex-column gap-1 mt-2" },
            select, input, labelInput, addUrl, results);
    }

    async openLink(link) {
        try {
            const res = await this.orm.call("business.process", "bpmn_open_link", [{
                linkType: link.linkType, model: link.model, resId: link.resId, xmlid: link.xmlid,
                url: link.url,
            }]);
            if (this.root.classList.contains("o_bpmn_fullscreen")) {
                this.toggleFullscreen();
            }
            if (res.action_id) {
                await this.action.doAction(res.action_id);
            } else {
                await this.action.doAction(res);
            }
        } catch (e) {
            const msg = (e && e.data && e.data.message) || (e && e.message) || String(e);
            this.notification.add(msg, { type: "danger" });
        }
    }

    // ------------------------------------------------------------------
    // exports
    // ------------------------------------------------------------------
    async download(fmt) {
        this.root.querySelectorAll(".o_bpmn_dropdown .dropdown-menu.show")
            .forEach((m) => m.classList.remove("show"));
        const name = safeFileName(this.snapshot && this.snapshot.name);
        try {
            if (fmt === "bpmn") {
                const { xml } = await this.instance.saveXML({ format: true });
                downloadBlob(xml, "" + (name) + ".bpmn", "application/xml");
            } else if (fmt === "svg") {
                const { svg } = await this.instance.saveSVG();
                downloadBlob(svg, "" + (name) + ".svg", "image/svg+xml");
            } else if (fmt === "png") {
                const { svg } = await this.instance.saveSVG();
                downloadBlob(await this.svgToPng(svg), "" + (name) + ".png", "image/png");
            } else if (fmt === "drawio") {
                const id = this.snapshot && this.snapshot.resId;
                if (!id) {
                    this.notification.add(_t("Save the process first."), { type: "warning" });
                    return;
                }
                window.location.href = "/bpmn_process_management/export/" + (id) + "/drawio";
            }
        } catch (e) {
            this.notification.add(_t("Export failed: %s", e.message || e), { type: "danger" });
        }
    }

    svgToPng(svg) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const scale = 2;
                const canvas = document.createElement("canvas");
                canvas.width = Math.max(1, img.width * scale);
                canvas.height = Math.max(1, img.height * scale);
                const ctx = canvas.getContext("2d");
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG"))), "image/png");
            };
            img.onerror = reject;
            img.src = "data:image/svg+xml;base64," + utf8ToBase64(svg);
        });
    }
}
