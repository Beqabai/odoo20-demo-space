/** Part of bpmn_process_management. License LGPL-3.
 *
 * Framework-independent diagram application (viewer + modeler + inspector).
 * It only touches the DOM element it receives, so the thin OWL wrapper in
 * bpmn_field.js works unchanged with Owl 2 (Odoo 19) and Owl 3 (Odoo 20).
 */
import { _t } from "@web/core/l10n/translation";
import { loadCSS, loadJS } from "@web/core/assets";
import { getBpmnTerms, getReviewReasons, getTypeLabels } from "./bpmn_terms";

const LIB = "/bpmn_process_management/static/lib/bpmn-js";
const GUIDE_URL = "/bpmn_process_management/static/doc/user_guide.html";
// bump with every rebuild of the bundle: browsers cache static files
const LIB_V = "?v=1.1.0";
let libPromise = null;

export function loadBpmnLib() {
    if (!libPromise) {
        libPromise = Promise.all([
            loadCSS(LIB + "/assets/diagram-js.css" + LIB_V),
            loadCSS(LIB + "/assets/bpmn-js.css" + LIB_V),
            loadCSS(LIB + "/assets/bpmn-font/css/bpmn.css" + LIB_V),
            loadCSS(LIB + "/assets/diagram-js-minimap.css" + LIB_V),
            loadCSS(LIB + "/assets/color-picker.css" + LIB_V),
            loadJS(LIB + "/odoo-bpmn.min.js" + LIB_V),
        ]).then(() => window.OdooBpmn);
        libPromise.catch(() => (libPromise = null));
    }
    return libPromise;
}

const LINKABLE = [
    "bpmn:Task", "bpmn:UserTask", "bpmn:ManualTask", "bpmn:ServiceTask", "bpmn:ScriptTask",
    "bpmn:SendTask", "bpmn:ReceiveTask", "bpmn:BusinessRuleTask", "bpmn:SubProcess",
    "bpmn:Transaction", "bpmn:AdHocSubProcess", "bpmn:CallActivity", "bpmn:StartEvent", "bpmn:EndEvent",
    "bpmn:IntermediateThrowEvent", "bpmn:IntermediateCatchEvent", "bpmn:BoundaryEvent",
    "bpmn:ExclusiveGateway", "bpmn:InclusiveGateway", "bpmn:ParallelGateway",
    "bpmn:ComplexGateway", "bpmn:EventBasedGateway", "bpmn:DataObjectReference",
    "bpmn:DataStoreReference", "bpmn:Participant", "bpmn:Lane",
];
const RESPONSIBLE_TYPES = ["bpmn:Lane", "bpmn:Participant"];
const NO_LANE_INFO = ["bpmn:TextAnnotation", "bpmn:DataObjectReference", "bpmn:DataStoreReference",
    "bpmn:Group"];
const CONTAINERS = ["bpmn:Process", "bpmn:Collaboration", "label"];
// Regexes are built from strings because the Odoo term extractor mis-parses some regex literals.
const SAFE_URL = new RegExp("^(https?:\\/\\/[^\\/\\\\\\s]|mailto:|\\/(?![\\/\\\\]))", "i");
const URL_BAD_CHARS = new RegExp("[\\\\\\u0000-\\u0020\\u007f]");
const UNSAFE_FILENAME_CHARS = new RegExp("[\\\\/:*?\"<>|]+", "g");
const PLACEHOLDER = new RegExp("{([^}]+)}", "g");
const HAS_DI = new RegExp("BPMNShape|BPMNEdge");
const HAS_PROCESS = new RegExp("<(\\w+:)?process[\\s>]");
const BULLET = new RegExp("^[-*\\u2022]\\s+(.*)$");
const NUMBERED = new RegExp("^\\d{1,3}[.)]\\s+(.*)$");
const WORDS = new RegExp("\\s+");
const MAC = new RegExp("Mac|iPhone|iPad");

const FONT = "\"Segoe UI\", Roboto, \"Noto Sans Georgian\", \"Noto Sans\", \"Helvetica Neue\", Arial, sans-serif";
const DEFAULT_STROKE = "#153749";
const DEFAULT_FILL = "#FFFFFF";
// GEC-derived presets: light fill + dark line of the same hue (readable text).
const COLOR_PRESETS = [
    { key: "default", label: "Default", fill: undefined, stroke: undefined },
    { key: "teal", label: "Teal", fill: "#D5F0E9", stroke: "#226263" },
    { key: "navy", label: "Navy", fill: "#DCE7EE", stroke: "#153749" },
    { key: "orange", label: "Orange", fill: "#FDE2D8", stroke: "#B83A12" },
    { key: "yellow", label: "Yellow", fill: "#FDF1C9", stroke: "#8A6500" },
    { key: "green", label: "Green", fill: "#DDF2D1", stroke: "#2E6B1F" },
    { key: "purple", label: "Purple", fill: "#EADCF5", stroke: "#5B2A86" },
    { key: "red", label: "Red", fill: "#FAD4D4", stroke: "#A11F1F" },
    { key: "gray", label: "Gray", fill: "#ECEEF0", stroke: "#4A5560" },
];

const EVENT_DEFS = {
    "bpmn:MessageEventDefinition": "message", "bpmn:TimerEventDefinition": "timer",
    "bpmn:ConditionalEventDefinition": "condition", "bpmn:SignalEventDefinition": "signal",
    "bpmn:ErrorEventDefinition": "error", "bpmn:EscalationEventDefinition": "escalation",
    "bpmn:CompensateEventDefinition": "compensation", "bpmn:CancelEventDefinition": "cancel",
    "bpmn:LinkEventDefinition": "link", "bpmn:TerminateEventDefinition": "terminate",
};
const SIMPLE_ICONS = {
    "bpmn:Task": "task", "bpmn:UserTask": "user-task", "bpmn:ManualTask": "manual-task",
    "bpmn:ServiceTask": "service-task", "bpmn:ScriptTask": "script-task", "bpmn:SendTask": "send-task",
    "bpmn:ReceiveTask": "receive-task", "bpmn:BusinessRuleTask": "business-rule-task",
    "bpmn:CallActivity": "call-activity", "bpmn:Transaction": "transaction",
    "bpmn:AdHocSubProcess": "ad-hoc-subprocess", "bpmn:ExclusiveGateway": "gateway-xor",
    "bpmn:InclusiveGateway": "gateway-or", "bpmn:ParallelGateway": "gateway-parallel",
    "bpmn:ComplexGateway": "gateway-complex", "bpmn:EventBasedGateway": "gateway-eventbased",
    "bpmn:DataObjectReference": "data-object", "bpmn:DataStoreReference": "data-store",
    "bpmn:DataInput": "data-input", "bpmn:DataOutput": "data-output", "bpmn:Participant": "participant",
    "bpmn:Lane": "lane", "bpmn:TextAnnotation": "text-annotation", "bpmn:Group": "group",
    "bpmn:MessageFlow": "connection", "bpmn:Association": "connection",
    "bpmn:DataInputAssociation": "connection", "bpmn:DataOutputAssociation": "connection",
};

/** Tiny DOM builder: h("div", {"class": "x", onclick: fn}, "text", child) */
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
    for (const c of children.flat(Infinity)) {
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
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
    undo: '<path d="M9 13L4 8l5-5"/><path d="M4 8h10a6 6 0 0 1 0 12h-3"/>',
    redo: '<path d="M15 13l5-5-5-5"/><path d="M20 8H10a6 6 0 0 0 0 12h3"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    compress: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>',
    broken: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/><path d="M4 4l16 16"/>',
    warning: '<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17v.5"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    users: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14a5 5 0 0 1 5 6"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
    record: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    map: '<rect x="3" y="4" width="18" height="16" rx="2"/><rect x="12" y="11" width="6" height="6" rx="1"/>',
    grid: '<path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
    keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.5 0-.9-.7-1.2-.7-2 0-.8.7-1.5 1.5-1.5H17a4 4 0 0 0 4-4c0-5-4-9-9-9z"/><circle cx="7.5" cy="11" r=".8"/><circle cx="10" cy="7" r=".8"/><circle cx="15" cy="7.5" r=".8"/>',
    swap: '<path d="M7 7h13l-3-3M17 17H4l3 3"/>',
    play: '<path d="M7 5l12 7-12 7z"/>',
    right: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    left: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    note: '<path d="M4 5h16v11H9l-5 4z"/>',
    text: '<path d="M5 6h14M12 6v13M8 19h8"/>',
    reset: '<path d="M4 12a8 8 0 1 0 3-6.2"/><path d="M4 4v4h4"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/>',
    flow: '<circle cx="5" cy="12" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="19" cy="18" r="2"/><path d="M7 12h4l6-6M11 12l6 6"/>',
    alignLeft: '<path d="M4 3v18M8 7h10M8 12h6M8 17h12"/>',
    alignCenter: '<path d="M12 3v18M6 7h12M8 12h8M5 17h14"/>',
    alignRight: '<path d="M20 3v18M6 7h10M10 12h6M4 17h12"/>',
    alignTop: '<path d="M3 4h18M7 8v10M12 8v6M17 8v12"/>',
    alignMiddle: '<path d="M3 12h18M7 6v12M12 8v8M17 5v14"/>',
    alignBottom: '<path d="M3 20h18M7 6v10M12 10v6M17 4v12"/>',
    distH: '<path d="M4 3v18M20 3v18"/><rect x="9" y="8" width="6" height="8" rx="1"/>',
    distV: '<path d="M3 4h18M3 20h18"/><rect x="8" y="9" width="8" height="6" rx="1"/>',
    chevron: '<path d="M6 9l6 6 6-6"/>',
    save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17v.5"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M8 7h7"/>',
};

function icon(name, size = 16) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
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

function initials(name) {
    const parts = (name || "").trim().split(WORDS).filter(Boolean);
    return parts.slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join("") || "?";
}

function readPref(key, fallback) {
    try {
        const v = window.localStorage.getItem("o_bpmn_" + key);
        return v === null ? fallback : v === "1";
    } catch {
        return fallback;
    }
}

function writePref(key, value) {
    try {
        window.localStorage.setItem("o_bpmn_" + key, value ? "1" : "0");
    } catch {
        // private mode: preference is simply not remembered
    }
}

function isMac() {
    return MAC.test(navigator.platform || navigator.userAgent || "");
}

/** Work instruction → paragraphs and lists ("- item", "1. item"); text only, no HTML. */
function renderInstruction(text) {
    const out = [];
    let para = [];
    let list = null;
    let listTag = null;
    const flushPara = () => {
        if (para.length) {
            out.push(h("p", {}, para.join("\n")));
            para = [];
        }
    };
    const flushList = () => {
        if (list) {
            out.push(list);
            list = null;
            listTag = null;
        }
    };
    for (const raw of text.split("\n")) {
        const line = raw.trim();
        if (!line) {
            flushPara();
            flushList();
            continue;
        }
        const bullet = BULLET.exec(line);
        const num = bullet ? null : NUMBERED.exec(line);
        if (bullet || num) {
            flushPara();
            const tag = bullet ? "ul" : "ol";
            if (listTag !== tag) {
                flushList();
                list = h(tag, {});
                listTag = tag;
            }
            list.append(h("li", {}, (bullet || num)[1]));
        } else {
            flushList();
            para.push(line);
        }
    }
    flushPara();
    flushList();
    return h("div", { "class": "o_bpmn_doc" }, out);
}

export class BpmnApp {
    /**
     * @param {HTMLElement} host
     * @param {{orm, action, notification}} services
     * @param {(values: Object) => Promise} onChange
     * @param {{save?: () => Promise<boolean>}} hooks
     */
    constructor(host, services, onChange, hooks = {}) {
        this.host = host;
        this.orm = services.orm;
        this.action = services.action;
        this.notification = services.notification;
        this.onChange = onChange;
        this.hooks = hooks;
        this.snapshot = null;
        this.instance = null;
        this.mode = null;
        this.lastXml = null;
        this.selected = null;
        this.selection = [];
        this.resolved = {};
        this.options = { record_models: [], responsible_models: [], is_manager: false };
        this.pendingSave = null;
        this.changedSinceSave = false;
        this.emitted = [];
        this.destroyed = false;
        this.panelOpen = readPref("panel", true);
        this.minimapOpen = readPref("minimap", false);
        this.gridOn = readPref("grid", true);
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
        this.canvasEl = h("div", { "class": "o_bpmn_canvas" });
        this.zoomEl = h("div", { "class": "o_bpmn_zoom", role: "group", "aria-label": _t("Zoom") });
        this.helpEl = h("div", { "class": "o_bpmn_help d-none", role: "dialog", "aria-modal": "true" });
        this.stageEl = h("div", { "class": "o_bpmn_stage" }, this.canvasEl, this.zoomEl, this.helpEl);
        this.panelEl = h("aside", { "class": "o_bpmn_panel", "aria-label": _t("Details") });
        this.toolbarEl = h("div", { "class": "o_bpmn_toolbar", role: "toolbar" });
        this.messageEl = h("div", { "class": "o_bpmn_message d-none" });
        this.root = h("div", { "class": "o_bpmn_app" + (this.panelOpen ? "" : " o_bpmn_panel_closed") },
            this.toolbarEl,
            this.messageEl,
            h("div", { "class": "o_bpmn_body" }, this.stageEl, this.panelEl),
        );
        this.host.replaceChildren(this.root);
        this.onKeydown = (ev) => {
            if (ev.key === "Escape") {
                if (!this.helpEl.classList.contains("d-none")) {
                    this.toggleHelp(false);
                } else if (this.root.classList.contains("o_bpmn_fullscreen") &&
                        !document.querySelector(".djs-popup")) {
                    this.toggleFullscreen();
                }
            }
        };
        document.addEventListener("keydown", this.onKeydown);
        // The field is often rendered before its tab/form has its final size:
        // follow size changes and re-fit as long as the user did not move the view.
        if (window.ResizeObserver) {
            this.resizeObserver = new ResizeObserver(() => {
                if (!this.instance || !this.canvasEl.clientWidth) {
                    return;
                }
                this.instance.get("canvas").resized();
                if (!this.viewTouched) {
                    this.fit();
                }
            });
            this.resizeObserver.observe(this.stageEl);
        }
        this.stageEl.addEventListener("wheel", () => (this.viewTouched = true), { passive: true });
        this.stageEl.addEventListener("pointerdown", () => (this.viewTouched = true));
        // Ctrl/Cmd+S also while typing in the side panel
        this.root.addEventListener("keydown", (ev) => {
            if (ev.defaultPrevented) {
                return; // already handled by the canvas key bindings
            }
            if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && (ev.key || "").toLowerCase() === "s") {
                ev.preventDefault();
                ev.stopPropagation();
                const target = ev.target;
                if (target && target.dispatchEvent && ["INPUT", "TEXTAREA"].includes(target.tagName)) {
                    target.dispatchEvent(new Event("change", { bubbles: true }));
                }
                this.saveRecord();
            }
        });
    }

    tbButton(title, iconName, onclick, extra = {}) {
        const { label, cls, shortcut, keepFocus, ...attrs } = extra;
        const tip = shortcut ? title + " (" + shortcut + ")" : title;
        return h("button", { type: "button", "class": "o_bpmn_tb_btn" + (cls ? " " + cls : ""),
            title: tip, "aria-label": title, ...attrs,
            onclick: (ev) => {
                onclick(ev);
                if (!keepFocus) {
                    this.focusCanvas();
                }
            } },
        icon(iconName, 18), label ? h("span", { "class": "o_bpmn_tb_label" }, label) : null);
    }

    renderToolbar() {
        const modeler = this.mode === "modeler";
        const cmd = isMac() ? "⌘" : "Ctrl";
        this.statusEl = h("span", { "class": "o_bpmn_status" });
        const left = [this.statusEl];
        if (modeler) {
            left.push(h("span", { "class": "o_bpmn_tb_sep" }));
            left.push(this.tbButton(_t("Undo"), "undo", () => this.instance.get("commandStack").undo(),
                { shortcut: cmd + "+Z" }));
            left.push(this.tbButton(_t("Redo"), "redo", () => this.instance.get("commandStack").redo(),
                { shortcut: cmd + "+Y" }));
        }
        left.push(h("span", { "class": "o_bpmn_tb_sep" }));
        left.push(this.tbButton(_t("Find an element"), "search", () => this.openSearch(),
            { shortcut: modeler ? cmd + "+F" : null, keepFocus: !modeler }));
        this.reviewBtn = h("button", { type: "button", "class": "o_bpmn_review_btn d-none",
            title: _t("Go to the next item to review"), onclick: () => this.selectNextReview() });
        left.push(this.reviewBtn);

        const dl = (label, hint, fmt) => h("button", { type: "button", "class": "o_bpmn_menu_item",
            onclick: () => this.download(fmt) }, h("span", {}, label), h("small", {}, hint));
        const menu = h("div", { "class": "o_bpmn_menu" },
            dl(_t("BPMN 2.0"), ".bpmn", "bpmn"),
            dl(_t("draw.io (last saved version)"), ".drawio", "drawio"),
            dl(_t("Image"), ".svg", "svg"),
            dl(_t("Image"), ".png", "png"),
        );
        const dlBtn = this.tbButton(_t("Download"), "download", () => menu.classList.toggle("show"),
            { keepFocus: true });
        this.onDocClick = this.onDocClick || ((ev) => {
            if (!ev.target.closest || !ev.target.closest(".o_bpmn_dropdown")) {
                this.root.querySelectorAll(".o_bpmn_menu.show").forEach((m) => m.classList.remove("show"));
            }
        });
        document.removeEventListener("click", this.onDocClick, true);
        document.addEventListener("click", this.onDocClick, true);

        this.minimapBtn = this.tbButton(_t("Minimap"), "map", () => this.toggleMinimap(), { shortcut: "M" });
        const right = [h("div", { "class": "o_bpmn_dropdown" }, dlBtn, menu),
            h("span", { "class": "o_bpmn_tb_sep" }), this.minimapBtn];
        if (modeler) {
            this.gridBtn = this.tbButton(_t("Grid"), "grid", () => this.toggleGrid(), { shortcut: "G" });
            right.push(this.gridBtn);
        } else {
            this.gridBtn = null;
        }
        right.push(this.tbButton(_t("Keyboard shortcuts"), "keyboard", () => this.toggleHelp(),
            { shortcut: "?", keepFocus: true }));
        right.push(this.tbButton(_t("User guide"), "help", () => this.openGuide(), { keepFocus: true }));
        this.panelBtn = this.tbButton(_t("Side panel"), "sidebar", () => this.togglePanel(), { shortcut: "P" });
        right.push(this.panelBtn);
        this.fullBtn = this.tbButton(_t("Full screen"), "expand", () => this.toggleFullscreen(), { shortcut: "F" });
        right.push(this.fullBtn);
        this.toolbarEl.replaceChildren(
            h("div", { "class": "o_bpmn_tb_group" }, left),
            h("span", { "class": "flex-grow-1" }),
            h("div", { "class": "o_bpmn_tb_group" }, right),
        );
        this.renderStatus();
        this.renderZoom();
        this.syncToggles();
    }

    renderStatus() {
        if (!this.statusEl) {
            return;
        }
        const snap = this.snapshot || {};
        const editing = this.mode === "modeler";
        let hint = "";
        if (!editing && snap.isManager && snap.state && snap.state !== "draft") {
            hint = snap.state === "review" ? _t("Send it back to draft to edit.")
                : _t("Create a new version to edit.");
        }
        this.statusEl.className = "o_bpmn_status " + (editing ? "o_bpmn_status_edit" : "o_bpmn_status_view");
        this.statusEl.title = hint;
        this.statusEl.replaceChildren(h("i", {}), editing ? _t("Editing") : _t("Read only"));
    }

    renderZoom() {
        const zoomBy = (f) => {
            const c = this.instance && this.instance.get("canvas");
            if (c) {
                c.zoom(Math.min(4, Math.max(0.2, c.zoom() * f)));
            }
        };
        this.zoomLabel = h("button", { type: "button", "class": "o_bpmn_zoom_label", title: _t("Reset zoom to 100%"),
            onclick: () => {
                if (this.instance) {
                    this.instance.get("canvas").zoom(1, "auto");
                }
            } }, "100%");
        this.zoomEl.replaceChildren(
            this.tbButton(_t("Zoom out"), "minus", () => zoomBy(1 / 1.2), { shortcut: (isMac() ? "⌘" : "Ctrl") + " -" }),
            this.zoomLabel,
            this.tbButton(_t("Zoom in"), "plus", () => zoomBy(1.2), { shortcut: (isMac() ? "⌘" : "Ctrl") + " +" }),
            h("span", { "class": "o_bpmn_tb_sep" }),
            this.tbButton(_t("Fit to screen"), "fit", () => this.fit(), { shortcut: "0" }),
        );
    }

    updateZoomLabel() {
        if (this.zoomLabel && this.instance) {
            this.zoomLabel.textContent = Math.round(this.instance.get("canvas").zoom() * 100) + "%";
        }
    }

    syncToggles() {
        const set = (btn, on) => btn && btn.classList.toggle("active", !!on);
        set(this.minimapBtn, this.minimapOpen);
        set(this.gridBtn, this.gridOn);
        set(this.panelBtn, this.panelOpen);
        const full = this.root.classList.contains("o_bpmn_fullscreen");
        if (this.fullBtn) {
            this.fullBtn.replaceChildren(icon(full ? "compress" : "expand", 18));
        }
    }

    focusCanvas() {
        try {
            if (this.instance) {
                this.instance.get("canvas").focus();
            }
        } catch {
            // older diagram-js: nothing to focus
        }
    }

    toggleFullscreen() {
        this.root.classList.toggle("o_bpmn_fullscreen");
        this.syncToggles();
        if (this.instance) {
            this.instance.get("canvas").resized();
            this.fit();
        }
    }

    togglePanel(open) {
        this.panelOpen = open === undefined ? !this.panelOpen : !!open;
        writePref("panel", this.panelOpen);
        this.root.classList.toggle("o_bpmn_panel_closed", !this.panelOpen);
        this.syncToggles();
        if (this.instance) {
            this.instance.get("canvas").resized();
        }
    }

    toggleMinimap() {
        const minimap = this.instance && this.instance.get("minimap", false);
        if (!minimap) {
            return;
        }
        minimap.toggle();
        this.minimapOpen = minimap.isOpen();
        writePref("minimap", this.minimapOpen);
        this.syncToggles();
    }

    toggleGrid() {
        const grid = this.instance && this.instance.get("grid", false);
        if (!grid) {
            return;
        }
        this.gridOn = !grid.isVisible();
        grid.toggle(this.gridOn);
        writePref("grid", this.gridOn);
        this.syncToggles();
    }

    openSearch() {
        const pad = this.mode === "modeler" && this.instance && this.instance.get("searchPad", false);
        if (pad) {
            pad.toggle();
            return;
        }
        // viewer: search box of the overview
        if (this.instance) {
            const sel = this.instance.get("selection", false);
            if (sel) {
                sel.select(null);
            }
        }
        this.selected = null;
        this.togglePanel(true);
        this.renderPanel();
        const input = this.panelEl.querySelector(".o_bpmn_find input");
        if (input) {
            input.focus();
        }
    }

    async saveRecord() {
        if (this.mode !== "modeler" || !this.hooks.save) {
            return;
        }
        try {
            await this.flush();
            const ok = await this.hooks.save();
            if (ok !== false) {
                this.notification.add(_t("Saved"), { type: "success" });
            }
        } catch (e) {
            const msg = (e && e.data && e.data.message) || (e && e.message) || String(e);
            this.notification.add(msg, { type: "danger" });
        }
    }

    openGuide() {
        window.open(GUIDE_URL, "_blank", "noopener");
    }

    toggleHelp(show) {
        const visible = show === undefined ? this.helpEl.classList.contains("d-none") : !!show;
        if (!visible) {
            this.helpEl.classList.add("d-none");
            this.focusCanvas();
            return;
        }
        const cmd = isMac() ? "⌘" : "Ctrl";
        const row = (keys, text) => h("div", { "class": "o_bpmn_kbd_row" },
            h("span", { "class": "o_bpmn_kbd_keys" }, keys.map((k, i) => [i ? h("span", { "class": "o_bpmn_kbd_plus" }, "+") : null,
                h("kbd", {}, k)])),
            h("span", {}, text));
        const group = (title, rows) => h("div", { "class": "o_bpmn_kbd_group" }, h("h6", {}, title), rows);
        const general = group(_t("View"), [
            row(["?"], _t("Show this help")),
            row(["F"], _t("Full screen")),
            row(["P"], _t("Show or hide the side panel")),
            row(["M"], _t("Minimap")),
            row(["0"], _t("Fit diagram to screen")),
            row([cmd, "+ / -"], _t("Zoom in / out (or mouse wheel with Ctrl)")),
            row([_t("Drag")], _t("Move the canvas (drag the empty background)")),
            row(["Esc"], _t("Close menus, leave full screen")),
        ]);
        const groups = [general];
        if (this.mode === "modeler") {
            groups.push(group(_t("Edit"), [
                row([cmd, "S"], _t("Save")),
                row([cmd, "Z"], _t("Undo")),
                row([cmd, "Y"], _t("Redo")),
                row([cmd, "C"], _t("Copy")),
                row([cmd, "V"], _t("Paste")),
                row([cmd, "A"], _t("Select all")),
                row([cmd, "F"], _t("Find an element")),
                row(["Del"], _t("Delete the selection")),
                row(["← ↑ → ↓"], _t("Move the selection (Shift: faster)")),
            ]));
            groups.push(group(_t("Draw"), [
                row(["A"], _t("Append an element after the selected one")),
                row(["N"], _t("Create an element (with search)")),
                row(["E"], _t("Edit the text (or double-click)")),
                row(["R"], _t("Change the type of the selected element")),
                row(["C"], _t("Connect tool")),
                row(["H"], _t("Hand tool")),
                row(["L"], _t("Lasso tool: select several elements")),
                row(["S"], _t("Space tool: make or remove room")),
                row(["G"], _t("Show or hide the grid")),
            ]));
        }
        const close = h("button", { type: "button", "class": "o_bpmn_icon_btn", title: _t("Close"),
            "aria-label": _t("Close"), onclick: () => this.toggleHelp(false) }, icon("close"));
        const card = h("div", { "class": "o_bpmn_help_card" },
            h("div", { "class": "o_bpmn_help_head" }, icon("keyboard", 20), h("h5", {}, _t("Keyboard shortcuts")), close),
            h("p", { "class": "o_bpmn_muted" }, _t("Shortcuts work when the diagram has the focus: click on the canvas first.")),
            h("div", { "class": "o_bpmn_kbd_grid" }, groups),
            h("div", { "class": "o_bpmn_help_foot" },
                h("button", { type: "button", "class": "o_bpmn_btn_sm", onclick: () => this.openGuide() },
                    icon("book", 14), _t("Open the user guide"))),
        );
        this.helpEl.replaceChildren(card);
        this.helpEl.onclick = (ev) => {
            if (ev.target === this.helpEl) {
                this.toggleHelp(false);
            }
        };
        this.helpEl.classList.remove("d-none");
        close.focus();
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
        this.updateZoomLabel();
    }

    showMessage(text, type = "danger") {
        this.messageEl.className = "o_bpmn_message alert alert-" + type + " m-2";
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
        this.canvasEl.append(h("div", { "class": "o_bpmn_loading" }, h("span", { "class": "o_bpmn_spinner" }),
            _t("Loading diagram...")));
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

    /** Snapshots are applied one after the other; only the newest pending one counts. */
    update(snapshot) {
        this.nextSnapshot = snapshot;
        this.updateChain = (this.updateChain || Promise.resolve()).then(() => {
            const snap = this.nextSnapshot;
            this.nextSnapshot = null;
            return snap ? this._update(snap) : undefined;
        }).catch((e) => console.error(e));
        return this.updateChain;
    }

    async _update(snapshot) {
        if (this.snapshot && this.snapshot.resId !== snapshot.resId) {
            // other record in the same component (pager): forget per-record state
            this._previewDone = false;
            this.emitted = [];
            this.importedXml = null;
        }
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
            if (snapshot.dirty && this.emitted.length &&
                    (this.emitted.includes(value) || value === this.importedXml)) {
                // Stale echo of one of our own earlier edits, or of the value we
                // started from (record still being updated, Odoo 20 applies the
                // change after an onchange round trip): keep the canvas, it holds
                // the newest version.
                this.renderStatus();
                return;
            }
            this.emitted = [];
            await this.importXml(value);
        }
        this.renderStatus();
    }

    async createInstance(mode) {
        if (this.instance) {
            this.instance.destroy();
            this.instance = null;
        }
        this.canvasEl.replaceChildren();
        this.mode = mode;
        this.root.classList.toggle("o_bpmn_is_viewer", mode !== "modeler");
        const terms = getBpmnTerms();
        const translateModule = {
            translate: ["value", (template, replacements) => {
                const tpl = terms[template] || template;
                return tpl.replace(PLACEHOLDER, (_, key) =>
                    replacements && key in replacements ? replacements[key] : "{" + key + "}");
            }],
        };
        const modeler = mode === "modeler";
        const Ctor = modeler ? this.lib.Modeler : this.lib.NavigatedViewer;
        const extra = (modeler ? this.lib.modelerModules : this.lib.viewerModules) || [];
        this.instance = new Ctor({
            container: this.canvasEl,
            moddleExtensions: { odoo: this.lib.odooModdle },
            additionalModules: [translateModule, ...extra],
            bpmnRenderer: { defaultFillColor: DEFAULT_FILL, defaultStrokeColor: DEFAULT_STROKE },
            textRenderer: {
                defaultStyle: { fontFamily: FONT, fontSize: 12, fontWeight: "normal", lineHeight: 1.2 },
                externalStyle: { fontSize: 11 },
            },
            colorPicker: { colors: COLOR_PRESETS.map((c) => ({ label: c.label, fill: c.fill, stroke: c.stroke })) },
            minimap: { open: this.minimapOpen },
        });
        const bus = this.instance.get("eventBus");
        bus.on("selection.changed", ({ newSelection }) => {
            this.selection = (newSelection || []).filter((e) => !e.labelTarget);
            this.selected = this.selection.length === 1 ? this.selection[0] : null;
            this.renderPanel();
        });
        bus.on("canvas.viewbox.changed", () => this.updateZoomLabel());
        bus.on("odoo.save", () => this.saveRecord());
        bus.on("odoo.shortcuts", () => this.toggleHelp());
        bus.on("odoo.fullscreen", () => this.toggleFullscreen());
        bus.on("odoo.minimap", () => this.toggleMinimap());
        bus.on("odoo.grid", () => this.toggleGrid());
        bus.on("odoo.fit", () => this.fit());
        bus.on("odoo.panel", () => this.togglePanel());
        bus.on("minimap.toggle", ({ open }) => {
            this.minimapOpen = !!open;
            this.syncToggles();
        });
        if (!modeler) {
            bus.on("element.click", ({ element }) => {
                this.selected = element && !CONTAINERS.includes(element.type) ? element : null;
                this.selection = this.selected ? [this.selected] : [];
                this.renderPanel();
            });
        } else {
            bus.on("commandStack.changed", () => {
                this.changedSinceSave = true;
                this.scheduleSave();
                this.scheduleOverlays();
                const reg = this.instance.get("elementRegistry");
                this.selection = this.selection.map((e) => reg.get(e.id)).filter(Boolean);
                if (this.selected) {
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
            this.importFailed = true; // never autosave an empty canvas over the stored diagram
            this.showMessage(_t("The diagram could not be displayed: %s", e.message || e));
            return;
        }
        this.importFailed = false;
        this.lastXml = xml;
        this.importedXml = xml;
        this.viewTouched = false;
        this.changedSinceSave = false;
        this.selected = null;
        this.selection = [];
        const grid = this.instance.get("grid", false);
        if (grid) {
            grid.toggle(this.gridOn);
        }
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
        const sel = this.instance.get("selection", false);
        if (sel) {
            sel.select(el);
        }
        this.selected = el;
        this.selection = [el];
        this.renderPanel();
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
        if (this.importFailed) {
            return;
        }
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
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
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
                key: el.id + ":link:" + idx, linkType: lk.linkType, model: lk.model,
                resId: lk.resId, xmlid: lk.xmlid, url: lk.url,
            }));
            const resp = this.responsible(bo);
            if (resp) {
                refs.push({ key: el.id + ":resp", linkType: "record", model: resp.model,
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
                const r = this.resolved[el.id + ":link:" + idx];
                if (r && !r.ok) {
                    broken = true;
                }
            });
            const resp = this.resolved[el.id + ":resp"];
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
                    position: { bottom: 8, left: -8 },
                    html: h("div", { "class": "o_bpmn_badge o_bpmn_badge_link", title: _t("%s link(s)", n) },
                        icon("link", 12)),
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
                html: h("div", { "class": "o_bpmn_badge o_bpmn_badge_review",
                    title: this.reviewReasons[item.reason] || this.reviewReasons.imported }, "!"),
            });
        }
        if (this.reviewBtn) {
            this.reviewBtn.classList.toggle("d-none", !items.length);
            this.reviewBtn.replaceChildren(icon("warning", 16), " ", _t("%s to review", items.length));
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
        this.togglePanel(true);
        this.focusElement(next.id);
    }

    // ------------------------------------------------------------------
    // element helpers
    // ------------------------------------------------------------------
    typeLabel(el) {
        return this.typeLabels[el.type] || el.type.replace("bpmn:", "");
    }

    elementName(el) {
        const bo = el.businessObject || {};
        if (el.type === "bpmn:Group") {
            return (bo.categoryValueRef && bo.categoryValueRef.value) || "";
        }
        return bo.name || bo.text || "";
    }

    displayName(el) {
        return this.elementName(el) || this.typeLabel(el);
    }

    iconClass(el) {
        const bo = el.businessObject || {};
        const t = el.type;
        const defs = bo.eventDefinitions || [];
        let def = "none";
        if (defs.length > 1) {
            def = bo.parallelMultiple ? "parallel-multiple" : "multiple";
        } else if (defs.length) {
            def = EVENT_DEFS[defs[0].$type] || "none";
        }
        let name;
        if (t === "bpmn:StartEvent") {
            name = "start-event-" + (bo.isInterrupting === false && def !== "none" ? "non-interrupting-" : "") + def;
        } else if (t === "bpmn:EndEvent") {
            name = "end-event-" + def;
        } else if (t === "bpmn:IntermediateCatchEvent" || t === "bpmn:IntermediateThrowEvent") {
            name = def === "none" ? "intermediate-event-none"
                : "intermediate-event-" + (t === "bpmn:IntermediateCatchEvent" ? "catch-" : "throw-") + def;
        } else if (t === "bpmn:BoundaryEvent") {
            name = "intermediate-event-catch-" + (bo.cancelActivity === false ? "non-interrupting-" : "") + def;
        } else if (t === "bpmn:SubProcess") {
            const expanded = el.di ? el.di.isExpanded !== false : true;
            name = bo.triggeredByEvent ? "event-subprocess-expanded"
                : expanded ? "subprocess-expanded" : "subprocess-collapsed";
        } else if (t === "bpmn:SequenceFlow") {
            const src = bo.sourceRef;
            name = src && src.default === bo ? "default-flow" : bo.conditionExpression ? "conditional-flow" : "connection";
        } else {
            name = SIMPLE_ICONS[t] || "task-none";
        }
        return "bpmn-icon-" + name;
    }

    category(el) {
        const t = el.type;
        if (t === "bpmn:StartEvent") {
            return "start";
        }
        if (t === "bpmn:EndEvent") {
            return "end";
        }
        if (t.endsWith("Event")) {
            return "event";
        }
        if (t.endsWith("Gateway")) {
            return "gateway";
        }
        if (t.startsWith("bpmn:Data")) {
            return "data";
        }
        if (t === "bpmn:Participant" || t === "bpmn:Lane") {
            return "pool";
        }
        if (el.waypoints) {
            return "flow";
        }
        if (t === "bpmn:TextAnnotation" || t === "bpmn:Group") {
            return "other";
        }
        return "task";
    }

    typeTile(el, small = false) {
        return h("span", { "class": "o_bpmn_tile o_bpmn_cat_" + this.category(el) + (small ? " o_bpmn_tile_sm" : ""),
            "aria-hidden": "true" }, h("i", { "class": this.iconClass(el) }));
    }

    laneOf(el) {
        const reg = this.instance.get("elementRegistry");
        const bo = el.businessObject;
        let best = null;
        for (const lane of reg.filter((e) => e.type === "bpmn:Lane")) {
            const refs = lane.businessObject.flowNodeRef || [];
            if (refs.includes(bo)) {
                // nested lanes: the innermost (smallest) one wins
                if (!best || lane.width * lane.height < best.width * best.height) {
                    best = lane;
                }
            }
        }
        if (best) {
            return best;
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
        const r = this.resolved[el.id + ":resp"];
        return (r && r.ok && r.name) || resp.name || "";
    }

    responsibleModelLabel(model) {
        const m = this.options.responsible_models.find((x) => x.model === model);
        return m ? m.label : "";
    }

    flowNeighbours(el) {
        const prev = [];
        const next = [];
        const isFlow = (c) => c.type === "bpmn:SequenceFlow" || c.type === "bpmn:MessageFlow";
        for (const c of el.incoming || []) {
            if (isFlow(c) && c.source) {
                prev.push({ el: c.source, label: c.businessObject.name, message: c.type === "bpmn:MessageFlow" });
            }
        }
        for (const c of el.outgoing || []) {
            if (isFlow(c) && c.target) {
                const isDefault = el.businessObject && el.businessObject.default === c.businessObject;
                next.push({ el: c.target, label: c.businessObject.name || (isDefault ? _t("otherwise") : ""),
                    message: c.type === "bpmn:MessageFlow" });
            }
        }
        for (const b of el.attachers || []) {
            next.push({ el: b, label: _t("exception"), exception: true });
        }
        if (el.host) {
            prev.push({ el: el.host, label: _t("attached to") });
        }
        return { prev, next };
    }

    // ------------------------------------------------------------------
    // side panel
    // ------------------------------------------------------------------
    renderPanel() {
        if (!this.instance) {
            return;
        }
        const scroll = this.panelEl.scrollTop;
        const sameTarget = this._panelFor === (this.selected ? this.selected.id : this.selection.length ? "multi" : "overview");
        const el = this.selected;
        const valid = el && el.businessObject && !el.labelTarget && !CONTAINERS.includes(el.type);
        let content;
        if (this.mode === "modeler" && this.selection.length > 1) {
            content = this.renderMultiPanel(this.selection);
            this._panelFor = "multi";
        } else if (valid) {
            content = this.renderElementPanel(el);
            this._panelFor = el.id;
        } else {
            content = this.renderOverview();
            this._panelFor = "overview";
        }
        this.panelEl.replaceChildren(...content);
        this.panelEl.scrollTop = sameTarget ? scroll : 0;
        this.markFlow(valid && this.mode !== "modeler" ? el : null);
    }

    /** Viewer: outline the selected step and softly its next steps. */
    markFlow(el) {
        const canvas = this.instance.get("canvas");
        for (const id of this._flowMarks || []) {
            const reg = this.instance.get("elementRegistry");
            const e = reg.get(id.el);
            if (e) {
                canvas.removeMarker(e, id.marker);
            }
        }
        this._flowMarks = [];
        if (!el || el.waypoints || RESPONSIBLE_TYPES.includes(el.type)) {
            return;
        }
        canvas.addMarker(el, "o-flow-current");
        this._flowMarks.push({ el: el.id, marker: "o-flow-current" });
        for (const n of this.flowNeighbours(el).next) {
            if (!RESPONSIBLE_TYPES.includes(n.el.type)) {
                canvas.addMarker(n.el, "o-flow-next");
                this._flowMarks.push({ el: n.el.id, marker: "o-flow-next" });
            }
        }
    }

    section(title, iconName, ...body) {
        return h("section", { "class": "o_bpmn_sec" },
            title ? h("h6", { "class": "o_bpmn_sec_title" }, iconName ? icon(iconName, 14) : null, title) : null,
            body);
    }

    renderOverview() {
        const reg = this.instance.get("elementRegistry");
        const all = reg.getAll().filter((e) => !e.labelTarget && e.businessObject && !CONTAINERS.includes(e.type));
        const editing = this.mode === "modeler";
        const steps = all.filter((e) => ["task", "gateway"].includes(this.category(e)) && !e.waypoints);
        const lanes = all.filter((e) => e.type === "bpmn:Lane" ||
            (e.type === "bpmn:Participant" && !(e.businessObject.processRef &&
                e.businessObject.processRef.laneSets && e.businessObject.processRef.laneSets.length)));
        let linkCount = 0;
        for (const e of all) {
            linkCount += this.links(e.businessObject).length;
        }
        const isManager = this.snapshot && this.snapshot.isManager;
        const reviewItems = isManager ? this.reviewItems() : [];
        const out = [];

        out.push(h("header", { "class": "o_bpmn_head" },
            h("span", { "class": "o_bpmn_tile o_bpmn_cat_process", "aria-hidden": "true" }, icon("flow", 22)),
            h("div", { "class": "o_bpmn_head_text" },
                h("div", { "class": "o_bpmn_eyebrow" }, _t("Process overview")),
                h("div", { "class": "o_bpmn_title" }, (this.snapshot && this.snapshot.name) || _t("Process")))));

        const stat = (n, label, warn) => h("div", { "class": "o_bpmn_stat" + (warn && n ? " o_bpmn_stat_warn" : "") },
            h("b", {}, String(n)), h("span", {}, label));
        out.push(h("div", { "class": "o_bpmn_stats" },
            stat(steps.length, _t("Steps")),
            stat(lanes.length, _t("Roles")),
            stat(linkCount, _t("Links")),
            isManager ? stat(reviewItems.length, _t("To review"), true) : null));

        const starts = all.filter((e) => e.type === "bpmn:StartEvent" &&
            !(e.parent && e.parent.type === "bpmn:SubProcess")).sort((a, b) => a.x - b.x || a.y - b.y);
        if (starts.length) {
            out.push(h("div", { "class": "o_bpmn_sec o_bpmn_sec_tight" },
                h("button", { type: "button", "class": "o_bpmn_primary w-100",
                    onclick: () => this.focusElement(starts[0].id) },
                icon("play", 16), editing ? _t("Go to the start") : _t("Walk through the process"))));
        }

        // find a step
        const results = h("div", { "class": "o_bpmn_find_results" });
        const named = all.filter((e) => !e.waypoints && this.elementName(e));
        const find = h("input", { type: "search", "class": "o_bpmn_input", placeholder: _t("Find a step, role or document..."),
            "aria-label": _t("Find a step") });
        const doFind = () => {
            const q = find.value.trim().toLowerCase();
            if (!q) {
                results.replaceChildren();
                return;
            }
            const hits = named.filter((e) => this.elementName(e).toLowerCase().includes(q)).slice(0, 25);
            results.replaceChildren(...(hits.length ? hits.map((e) => this.stepButton({ el: e }))
                : [h("div", { "class": "o_bpmn_muted small px-1" }, _t("No result."))]));
        };
        find.addEventListener("input", doFind);
        find.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter") {
                const first = results.querySelector("button");
                if (first) {
                    first.click();
                }
            }
        });
        out.push(this.section(null, null, h("div", { "class": "o_bpmn_find" }, icon("search", 16), find), results));

        if (lanes.length) {
            out.push(this.section(_t("Who does what"), "users", h("div", { "class": "o_bpmn_lane_list" },
                lanes.map((lane) => {
                    const resp = this.responsibleName(lane);
                    const r = this.resolved[lane.id + ":resp"];
                    const broken = r && !r.ok;
                    return h("button", { type: "button", "class": "o_bpmn_lane_row",
                        onclick: () => this.focusElement(lane.id) },
                    h("span", { "class": "o_bpmn_lane_name" }, lane.businessObject.name || _t("(unnamed lane)")),
                    resp ? h("span", { "class": "o_bpmn_chip" + (broken ? " o_bpmn_chip_danger" : "") },
                        icon(broken ? "broken" : "user", 12), resp)
                        : h("span", { "class": "o_bpmn_chip o_bpmn_chip_warn" }, _t("not assigned")));
                }))));
        }

        if (reviewItems.length) {
            out.push(this.section(_t("To review (%s)", reviewItems.length), "warning",
                h("div", { "class": "o_bpmn_review_list" }, reviewItems.slice(0, 60).map((it) =>
                    h("button", { type: "button", "class": "o_bpmn_review_row",
                        onclick: () => this.focusElement(it.element.id) },
                    this.typeTile(it.element, true),
                    h("span", {}, h("b", {}, this.displayName(it.element)),
                        h("small", {}, this.reviewReasons[it.reason] || "")))))));
        }

        if (editing) {
            const tip = (text) => h("li", {}, text);
            out.push(this.section(_t("Drawing tips"), "info", h("ul", { "class": "o_bpmn_tips" },
                tip(_t("Drag a shape from the palette on the left, or press N to search one.")),
                tip(_t("Hover a shape and use its arrow to connect: the shapes you may connect to light up.")),
                tip(_t("Press A on a selected shape to append the next step right after it.")),
                tip(_t("Double-click a shape to edit its text; use the side panel for colors and details.")),
                tip(_t("Press ? to see all keyboard shortcuts.")))));
        } else {
            out.push(this.section(null, null, h("p", { "class": "o_bpmn_muted small mb-0" },
                _t("Click a step to read what has to be done, who does it and open the related Odoo screen."))));
        }
        return out;
    }

    stepButton(n) {
        return h("button", { type: "button", "class": "o_bpmn_step", onclick: () => this.focusElement(n.el.id),
            title: this.typeLabel(n.el) },
        this.typeTile(n.el, true),
        h("span", { "class": "o_bpmn_step_name" }, this.displayName(n.el)),
        n.label ? h("span", { "class": "o_bpmn_flowlabel" + (n.exception ? " o_bpmn_flowlabel_exc" : "") }, n.label) : null,
        n.message ? h("span", { "class": "o_bpmn_flowlabel" }, _t("message")) : null);
    }

    renderElementPanel(el) {
        const bo = el.businessObject;
        const editing = this.mode === "modeler";
        const isManager = this.snapshot && this.snapshot.isManager;
        const out = [];

        // header
        const headText = h("div", { "class": "o_bpmn_head_text" });
        const typeRow = h("div", { "class": "o_bpmn_eyebrow" }, this.typeLabel(el));
        headText.append(typeRow);
        if (editing) {
            const current = this.elementName(el);
            const multiline = el.type === "bpmn:TextAnnotation";
            const input = h(multiline ? "textarea" : "input", { "class": "o_bpmn_name_input",
                placeholder: el.waypoints ? _t("Label (e.g. Yes / No)") : _t("Name"), "aria-label": _t("Name"),
                rows: multiline ? "3" : null });
            input.value = current;
            input.addEventListener("change", () => {
                if (input.value !== this.elementName(el)) {
                    this.instance.get("modeling").updateLabel(el, input.value);
                }
            });
            if (!multiline) {
                input.addEventListener("keydown", (ev) => {
                    if (ev.key === "Enter") {
                        input.blur();
                    }
                });
            }
            headText.append(input);
        } else {
            headText.append(h("div", { "class": "o_bpmn_title" }, this.elementName(el) || _t("(no name)")));
        }
        const headButtons = [];
        if (editing && this.canReplace(el)) {
            headButtons.push(h("button", { type: "button", "class": "o_bpmn_icon_btn", title: _t("Change type") + " (R)",
                "aria-label": _t("Change type"), onclick: (ev) => this.openReplace(el, ev.currentTarget) }, icon("swap")));
        }
        out.push(h("header", { "class": "o_bpmn_head" }, this.typeTile(el), headText, headButtons));

        // review
        const rv = this.review(bo);
        if (rv && isManager) {
            out.push(h("div", { "class": "o_bpmn_alert" },
                icon("warning", 18),
                h("div", { "class": "flex-grow-1" },
                    h("div", {}, this.reviewReasons[rv.reason] || this.reviewReasons.imported),
                    rv.note ? h("div", { "class": "o_bpmn_alert_note" }, rv.note) : null,
                    editing ? h("button", { type: "button", "class": "o_bpmn_btn_sm",
                        onclick: () => this.setExtValues(el, "odoo:Review", []) },
                    icon("check", 14), _t("Mark as reviewed")) : null)));
        }

        if (el.waypoints) {
            out.push(this.renderConnection(el));
            if (editing) {
                out.push(this.renderStyle([el]));
            }
            return out;
        }

        // responsible
        if (RESPONSIBLE_TYPES.includes(el.type)) {
            out.push(this.renderResponsible(el, editing));
        } else if (!NO_LANE_INFO.includes(el.type)) {
            const lane = this.laneOf(el);
            if (lane) {
                out.push(this.section(_t("Who"), "user", this.personCard(lane, true)));
            }
        }

        // documentation
        const docText = this.documentation(bo);
        if (editing) {
            const ta = h("textarea", { "class": "o_bpmn_input", rows: "6",
                placeholder: _t("What has to be done, rules, controls, documents...\n- start a line with - for a bullet list"),
                "aria-label": _t("Work instruction") });
            ta.value = docText;
            ta.addEventListener("change", () => {
                const moddle = this.instance.get("moddle");
                const docs = ta.value.trim() ? [moddle.create("bpmn:Documentation", { text: ta.value })] : [];
                this.instance.get("modeling").updateProperties(el, { documentation: docs });
            });
            out.push(this.section(_t("Work instruction"), "record", ta));
        } else if (docText) {
            out.push(this.section(_t("What to do"), "record", renderInstruction(docText)));
        } else if (el.type !== "bpmn:Participant" && el.type !== "bpmn:Lane") {
            out.push(this.section(_t("What to do"), "record",
                h("div", { "class": "o_bpmn_muted small" }, _t("No instruction yet."))));
        }

        // links
        if (LINKABLE.includes(el.type)) {
            const links = this.renderLinks(el, editing);
            if (links) {
                out.push(links);
            }
        }

        // flow navigation
        if (!RESPONSIBLE_TYPES.includes(el.type) && !NO_LANE_INFO.includes(el.type)) {
            const { prev, next } = this.flowNeighbours(el);
            if (prev.length || next.length) {
                out.push(this.section(_t("Flow"), "flow",
                    prev.length ? h("div", { "class": "o_bpmn_flow_group" },
                        h("div", { "class": "o_bpmn_flow_caption" }, icon("left", 12), _t("Before")),
                        prev.map((n) => this.stepButton(n))) : null,
                    next.length ? h("div", { "class": "o_bpmn_flow_group" },
                        h("div", { "class": "o_bpmn_flow_caption" }, _t("Next"), icon("right", 12)),
                        next.map((n) => this.stepButton(n))) : null));
            }
        }

        if (editing) {
            out.push(this.renderStyle([el]));
            out.push(h("div", { "class": "o_bpmn_footer_id" }, "ID: ", bo.id));
        }
        return out;
    }

    renderConnection(el) {
        const parts = [];
        if (el.source && el.target) {
            parts.push(h("div", { "class": "o_bpmn_flow_group" },
                h("div", { "class": "o_bpmn_flow_caption" }, _t("From")), this.stepButton({ el: el.source })));
            parts.push(h("div", { "class": "o_bpmn_flow_group" },
                h("div", { "class": "o_bpmn_flow_caption" }, _t("To")), this.stepButton({ el: el.target })));
        }
        return this.section(_t("Connection"), "flow", parts);
    }

    renderMultiPanel(elements) {
        const out = [];
        out.push(h("header", { "class": "o_bpmn_head" },
            h("span", { "class": "o_bpmn_tile o_bpmn_cat_process", "aria-hidden": "true" }, icon("grid", 22)),
            h("div", { "class": "o_bpmn_head_text" },
                h("div", { "class": "o_bpmn_eyebrow" }, _t("Selection")),
                h("div", { "class": "o_bpmn_title" }, _t("%s elements selected", elements.length)))));
        const shapes = elements.filter((e) => !e.waypoints);
        if (shapes.length > 1) {
            const align = this.instance.get("alignElements", false);
            const distribute = this.instance.get("distributeElements", false);
            const btn = (title, ic, fn) => h("button", { type: "button", "class": "o_bpmn_icon_btn", title,
                "aria-label": title, onclick: fn }, icon(ic, 18));
            const row = [];
            if (align) {
                for (const [dir, ic, title] of [["left", "alignLeft", _t("Align left")],
                    ["center", "alignCenter", _t("Align centers")], ["right", "alignRight", _t("Align right")],
                    ["top", "alignTop", _t("Align top")], ["middle", "alignMiddle", _t("Align middles")],
                    ["bottom", "alignBottom", _t("Align bottom")]]) {
                    row.push(btn(title, ic, () => align.trigger(shapes, dir)));
                }
            }
            if (distribute && shapes.length > 2) {
                row.push(btn(_t("Distribute horizontally"), "distH", () => distribute.trigger(shapes, "horizontal")));
                row.push(btn(_t("Distribute vertically"), "distV", () => distribute.trigger(shapes, "vertical")));
            }
            if (row.length) {
                out.push(this.section(_t("Arrange"), "alignLeft", h("div", { "class": "o_bpmn_btn_row" }, row)));
            }
        }
        out.push(this.renderStyle(elements));
        return out;
    }

    canReplace(el) {
        try {
            const popup = this.instance.get("popupMenu", false);
            return !!popup && !popup.isEmpty(el, "bpmn-replace");
        } catch {
            return false;
        }
    }

    openReplace(el, anchor) {
        const popup = this.instance.get("popupMenu");
        const rect = anchor.getBoundingClientRect();
        const width = 300;
        const x = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
        popup.open(el, "bpmn-replace", { x, y: rect.bottom + 6, cursor: { x: rect.left, y: rect.bottom } },
            { title: this.instance.get("translate")("Change element"), width, search: true });
    }

    // ------------------------------------------------------------------
    // style (colors)
    // ------------------------------------------------------------------
    currentColors(el) {
        const di = el.di;
        const get = (keys) => {
            for (const k of keys) {
                try {
                    const v = di && di.get(k);
                    if (v) {
                        return v;
                    }
                } catch {
                    // attribute not known by moddle
                }
            }
            return undefined;
        };
        return {
            fill: get(["color:background-color", "bioc:fill"]),
            stroke: get(["color:border-color", "bioc:stroke"]),
        };
    }

    renderStyle(elements) {
        const modeling = this.instance.get("modeling");
        const targets = elements.filter((e) => !e.labelTarget);
        const first = this.currentColors(targets[0]);
        const connectionsOnly = targets.every((e) => e.waypoints);
        const labels = {
            default: _t("Default"), teal: _t("Teal"), navy: _t("Navy"), orange: _t("Orange"),
            yellow: _t("Yellow"), green: _t("Green"), purple: _t("Purple"), red: _t("Red"), gray: _t("Gray"),
        };
        const norm = (c) => (c || "").toUpperCase();
        const apply = (colors) => {
            modeling.setColor(targets, colors);
            // external labels (events, gateways, data, flows) follow the line color
            const withLabels = targets.map((e) => e.label).filter(Boolean);
            if ("stroke" in colors && withLabels.length) {
                modeling.setColor(withLabels, { stroke: colors.stroke });
            }
        };
        const swatches = COLOR_PRESETS.map((c) => {
            const active = norm(c.fill) === norm(first.fill) && norm(c.stroke) === norm(first.stroke);
            return h("button", { type: "button", "class": "o_bpmn_swatch" + (active ? " active" : ""),
                title: labels[c.key], "aria-label": labels[c.key],
                style: "--sw-fill:" + (connectionsOnly ? "#fff" : (c.fill || DEFAULT_FILL)) + ";--sw-stroke:" + (c.stroke || DEFAULT_STROKE),
                onclick: () => apply({ fill: c.fill, stroke: c.stroke }) },
            connectionsOnly ? h("i", { "class": "o_bpmn_swatch_line" }) : null);
        });
        const picker = (label, key, value) => {
            const input = h("input", { type: "color", value: value || (key === "fill" ? DEFAULT_FILL : DEFAULT_STROKE),
                "aria-label": label });
            input.addEventListener("change", () => apply({ [key]: input.value }));
            return h("label", { "class": "o_bpmn_color_input" }, input, h("span", {}, label));
        };
        const custom = h("div", { "class": "o_bpmn_color_row" },
            connectionsOnly ? null : picker(_t("Fill"), "fill", first.fill),
            picker(connectionsOnly ? _t("Line") : _t("Line and text"), "stroke", first.stroke),
            h("button", { type: "button", "class": "o_bpmn_icon_btn ms-auto", title: _t("Reset colors"),
                "aria-label": _t("Reset colors"), onclick: () => apply({ fill: undefined, stroke: undefined }) },
            icon("reset")));
        return this.section(_t("Style"), "palette", h("div", { "class": "o_bpmn_swatches" }, swatches), custom);
    }

    // ------------------------------------------------------------------
    // responsible
    // ------------------------------------------------------------------
    /** Card "who": for a lane itself, or (inherited=true) for a step inside a lane. */
    personCard(lane, inherited) {
        const resp = this.responsible(lane.businessObject);
        const laneName = lane.businessObject.name || "";
        const r = this.resolved[lane.id + ":resp"];
        const broken = resp && r && !r.ok;
        const name = resp ? this.responsibleName(lane) : "";
        const kind = resp ? this.responsibleModelLabel(resp.model) : "";
        const title = name || laneName || _t("not assigned");
        const subtitle = [];
        if (inherited && resp && laneName && laneName !== name) {
            subtitle.push((lane.type === "bpmn:Lane" ? _t("Lane") : _t("Pool")) + ": " + laneName);
        }
        if (kind) {
            subtitle.push(kind);
        }
        if (!resp) {
            subtitle.push(_t("no Odoo responsible assigned"));
        }
        return h("div", { "class": "o_bpmn_person" + (broken ? " o_bpmn_person_broken" : "") + (resp ? "" : " o_bpmn_person_none") },
            h("span", { "class": "o_bpmn_avatar" }, broken ? icon("broken", 16) : initials(title)),
            h("div", { "class": "o_bpmn_person_text" },
                h("div", { "class": "o_bpmn_person_name" }, title),
                subtitle.length ? h("div", { "class": "o_bpmn_person_sub" }, subtitle.join(" · ")) : null,
                resp && resp.note ? h("div", { "class": "o_bpmn_person_note" }, resp.note) : null,
                broken ? h("div", { "class": "o_bpmn_person_sub text-danger" },
                    _t("The linked record no longer exists or is not accessible.")) : null),
            inherited ? h("button", { type: "button", "class": "o_bpmn_icon_btn", title: _t("Show the lane"),
                "aria-label": _t("Show the lane"), onclick: () => this.focusElement(lane.id) }, icon("right")) : null);
    }

    assignResponsible(el, model, item) {
        const bo = el.businessObject;
        const modeling = this.instance.get("modeling");
        const prev = this.responsible(bo);
        const prevName = prev ? (this.responsibleName(el) || "").trim() : "";
        const laneName = (bo.name || "").trim();
        // The lane name follows the responsible when it was empty, equal to the previous
        // responsible, or the user asked for it (syncName). Otherwise we only suggest it.
        const sync = !laneName || laneName === item.name || (prev && (prev.syncName || laneName === prevName));
        this.setExtValues(el, "odoo:Responsible", [this.createExt("odoo:Responsible", {
            model, resId: item.resId, xmlid: item.xmlid, name: item.name,
            note: prev ? prev.note : undefined, syncName: sync,
        })]);
        if (sync && laneName !== item.name) {
            modeling.updateLabel(el, item.name);
        }
        const rv = this.review(bo);
        if (rv && ["responsible_missing", "responsible_auto"].includes(rv.reason)) {
            this.setExtValues(el, "odoo:Review", []);
        }
    }

    updateResponsible(el, changes) {
        const resp = this.responsible(el.businessObject);
        if (!resp) {
            return;
        }
        const attrs = { model: resp.model, resId: resp.resId, xmlid: resp.xmlid, name: resp.name,
            note: resp.note, syncName: resp.syncName, ...changes };
        this.setExtValues(el, "odoo:Responsible", [this.createExt("odoo:Responsible", attrs)]);
    }

    renderResponsible(el, editing) {
        const bo = el.businessObject;
        const resp = this.responsible(bo);
        const body = [this.personCard(el, false)];
        if (editing) {
            const modeling = this.instance.get("modeling");
            if (resp) {
                const name = this.responsibleName(el) || "";
                const laneName = (bo.name || "").trim();
                const tools = h("div", { "class": "o_bpmn_resp_tools" });
                if (name && laneName !== name) {
                    tools.append(h("button", { type: "button", "class": "o_bpmn_btn_sm",
                        onclick: () => {
                            modeling.updateLabel(el, name);
                            this.updateResponsible(el, { syncName: true });
                        } }, icon("text", 14), _t("Use \"%s\" as lane name", name)));
                }
                const sync = h("input", { type: "checkbox", "class": "form-check-input" });
                sync.checked = !!resp.syncName;
                sync.addEventListener("change", () => {
                    this.updateResponsible(el, { syncName: sync.checked });
                    if (sync.checked && name && laneName !== name) {
                        modeling.updateLabel(el, name);
                    }
                });
                tools.append(h("label", { "class": "o_bpmn_check" }, sync, _t("Lane name follows the responsible")));
                const note = h("input", { "class": "o_bpmn_input", value: resp.note || "",
                    placeholder: _t("Role or comment, e.g. \"the shift manager approves\""),
                    "aria-label": _t("Comment") });
                note.addEventListener("change", () => this.updateResponsible(el, { note: note.value.trim() }));
                tools.append(note);
                tools.append(h("button", { type: "button", "class": "o_bpmn_btn_link",
                    onclick: () => this.setExtValues(el, "odoo:Responsible", []) }, icon("close", 14), _t("Remove the responsible")));
                body.push(tools);
            }
            if (this.options.responsible_models.length) {
                body.push(this.renderPicker(
                    this.options.responsible_models.map((m) => ({ value: "responsible:" + m.model, label: m.label })),
                    async (kind, item) => {
                        this.assignResponsible(el, kind.split(":")[1], item);
                        await this.resolveReferences();
                        this.refreshOverlays();
                        this.renderPanel();
                    },
                    resp ? _t("Replace: search a department, job position or group...")
                        : _t("Search a department, job position or group..."),
                ));
            }
        }
        return this.section(_t("Responsible"), "users", body);
    }

    // ------------------------------------------------------------------
    // links
    // ------------------------------------------------------------------
    linkKindLabel(lk) {
        if (lk.linkType === "menu") {
            return _t("Odoo menu");
        }
        if (lk.linkType === "action") {
            return _t("Window action (technical)");
        }
        if (lk.linkType === "url") {
            return _t("Web address (URL)");
        }
        const m = this.options.record_models.find((x) => x.model === lk.model);
        return m ? m.label : _t("Record");
    }

    renderLinks(el, editing) {
        const bo = el.businessObject;
        const links = this.links(bo);
        if (!links.length && !editing) {
            return null;
        }
        const list = h("div", { "class": "o_bpmn_links" });
        links.forEach((lk, idx) => {
            const r = this.resolved[el.id + ":link:" + idx];
            const broken = r && !r.ok;
            const label = lk.label || (r && r.name) || lk.url || lk.xmlid || _t("Link");
            const kindIcon = { menu: "menu", action: "bolt", url: "external" }[lk.linkType] || "record";
            const tile = h("button", { type: "button", "class": "o_bpmn_linktile" + (broken ? " o_bpmn_linktile_broken" : ""),
                disabled: broken && !editing ? true : null,
                title: broken ? _t("This link is broken or not accessible.") : label,
                onclick: () => this.openLink(lk) },
            h("span", { "class": "o_bpmn_linktile_icon" }, icon(broken ? "broken" : kindIcon, 18)),
            h("span", { "class": "o_bpmn_linktile_text" }, h("b", {}, label), h("small", {}, this.linkKindLabel(lk))),
            icon("right", 16));
            list.append(h("div", { "class": "o_bpmn_link_row" }, tile,
                editing ? h("button", { type: "button", "class": "o_bpmn_icon_btn", title: _t("Remove"),
                    "aria-label": _t("Remove"), onclick: () => {
                        const rest = links.filter((_x, i) => i !== idx);
                        this.setExtValues(el, "odoo:Link", rest);
                        this.resolveReferences().then(() => this.refreshOverlays());
                    } }, icon("close", 14)) : null));
        });
        const body = [list];
        if (editing) {
            const kinds = [{ value: "menu", label: _t("Odoo menu") }];
            for (const m of this.options.record_models) {
                kinds.push({ value: "record:" + m.model, label: m.label });
            }
            if (odoo.debug) {
                kinds.push({ value: "action", label: _t("Window action (technical)") });
            }
            kinds.push({ value: "url", label: _t("Web address (URL)") });
            const picker = this.renderPicker(kinds, async (kind, item) => {
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
            }, _t("Search..."));
            if (links.length) {
                // keep the panel compact: the picker opens on demand
                const details = h("details", { "class": "o_bpmn_add" }, h("summary", {}, icon("plus", 14), _t("Add a link")), picker);
                body.push(details);
            } else {
                body.push(picker);
            }
        }
        return this.section(editing ? _t("Links") : _t("Open in Odoo"), "link", body);
    }

    /** kind select + search box + result list. onPick(kind, item) */
    renderPicker(kinds, onPick, placeholder) {
        const select = h("select", { "class": "o_bpmn_input o_bpmn_select", "aria-label": _t("Type") },
            kinds.map((k) => h("option", { value: k.value }, k.label)));
        const input = h("input", { type: "search", "class": "o_bpmn_input", placeholder, "aria-label": placeholder });
        const labelInput = h("input", { "class": "o_bpmn_input d-none",
            placeholder: _t("Label (optional)"), "aria-label": _t("Label") });
        const results = h("div", { "class": "o_bpmn_results" });
        const addUrl = h("button", { type: "button", "class": "o_bpmn_btn_sm d-none" }, icon("plus", 14), _t("Add link"));
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
                h("button", { type: "button", "class": "o_bpmn_result", onclick: () => onPick(kind, it) },
                    icon("plus", 14), h("span", {}, it.name)))
                : [h("div", { "class": "o_bpmn_muted small p-1" }, _t("No result."))]));
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
        return h("div", { "class": "o_bpmn_picker" },
            kinds.length > 1 ? select : null, input, labelInput, addUrl, results);
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
        this.root.querySelectorAll(".o_bpmn_menu.show").forEach((m) => m.classList.remove("show"));
        const name = safeFileName(this.snapshot && this.snapshot.name);
        try {
            if (fmt === "bpmn") {
                const { xml } = await this.instance.saveXML({ format: true });
                downloadBlob(xml, name + ".bpmn", "application/xml");
            } else if (fmt === "svg") {
                const { svg } = await this.instance.saveSVG();
                downloadBlob(svg, name + ".svg", "image/svg+xml");
            } else if (fmt === "png") {
                const { svg } = await this.instance.saveSVG();
                downloadBlob(await this.svgToPng(svg), name + ".png", "image/png");
            } else if (fmt === "drawio") {
                const id = this.snapshot && this.snapshot.resId;
                if (!id) {
                    this.notification.add(_t("Save the process first."), { type: "warning" });
                    return;
                }
                window.location.href = "/bpmn_process_management/export/" + id + "/drawio";
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
