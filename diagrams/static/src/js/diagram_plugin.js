import { Plugin } from "@html_editor/plugin";
import { isHtmlContentSupported } from "@html_editor/core/selection_plugin";
import { withSequence } from "@html_editor/utils/resource";
import { closestElement } from "@html_editor/utils/dom_traversal";
import { browser } from "@web/core/browser/browser";
import { _t } from "@web/core/l10n/translation";
import { DrawioDialog } from "./drawio_dialog";

const DIAGRAM_SELECTOR = ".o_diagrams_block, [data-diagram-xml]";
const DIAGRAM_IMAGE_SELECTOR = "img.o_diagrams_preview, img[data-diagram-xml]";

function toDataValue(value = "") {
    return encodeURIComponent(value);
}

function fromDataValue(value = "") {
    try {
        return decodeURIComponent(value);
    } catch {
        return "";
    }
}

function toPreviewSrc(preview = "") {
    if (!preview) {
        return "";
    }
    if (preview.startsWith("data:image/")) {
        return preview;
    }
    if (/^[A-Za-z0-9+/=\n\r]+$/.test(preview)) {
        return `data:image/png;base64,${preview.replace(/\s+/g, "")}`;
    }
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(preview)))}`;
}

function hasDiagram(selection) {
    const anchorNode = selection?.anchorNode;
    return Boolean(findDiagramFromNode(anchorNode));
}

function findDiagramFromNode(node) {
    if (!node) {
        return null;
    }
    const block = closestElement(node, DIAGRAM_SELECTOR);
    if (block) {
        return block;
    }
    const image = closestElement(node, DIAGRAM_IMAGE_SELECTOR);
    if (image) {
        return image;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
        return node.querySelector?.(DIAGRAM_SELECTOR) || node.querySelector?.(DIAGRAM_IMAGE_SELECTOR);
    }
    return null;
}

function getPreviewImage(diagramElement) {
    if (!diagramElement) {
        return null;
    }
    if (diagramElement.tagName === "IMG") {
        return diagramElement;
    }
    return diagramElement.querySelector("img.o_diagrams_preview, img");
}

function toMermaidSafeId(rawId, index) {
    const normalized = String(rawId || `n${index + 1}`).replace(/[^a-zA-Z0-9_]/g, "_");
    return /^[a-zA-Z_]/.test(normalized) ? normalized : `n_${normalized}`;
}

function toMermaidLabel(rawLabel, fallback = "") {
    const withoutTags = String(rawLabel || "").replace(/<[^>]*>/g, " ");
    const plain = withoutTags.replace(/\s+/g, " ").trim();
    const safe = plain.replace(/[\[\]{}()|`]/g, " ").replace(/\s+/g, " ").trim();
    return safe || fallback;
}

function parseMxStyle(styleText = "") {
    const style = {};
    for (const token of String(styleText).split(";")) {
        const part = token.trim();
        if (!part) {
            continue;
        }
        const [key, ...rest] = part.split("=");
        style[key] = rest.length ? rest.join("=") : "1";
    }
    return style;
}

function normalizeMermaidColor(rawColor) {
    const color = String(rawColor || "").trim();
    if (!color || color === "none") {
        return null;
    }
    if (/^#[0-9a-fA-F]{3,8}$/.test(color)) {
        return color;
    }
    if (/^[0-9a-fA-F]{6}$/.test(color)) {
        return `#${color}`;
    }
    return null;
}

function detectFlowDirection(vertices) {
    const xs = [];
    const ys = [];
    for (const cell of vertices) {
        const geometry = cell.querySelector("mxGeometry");
        if (!geometry) {
            continue;
        }
        const x = Number(geometry.getAttribute("x"));
        const y = Number(geometry.getAttribute("y"));
        if (Number.isFinite(x)) {
            xs.push(x);
        }
        if (Number.isFinite(y)) {
            ys.push(y);
        }
    }
    if (xs.length < 2 || ys.length < 2) {
        return "TD";
    }
    const xSpan = Math.max(...xs) - Math.min(...xs);
    const ySpan = Math.max(...ys) - Math.min(...ys);
    return xSpan >= ySpan ? "LR" : "TD";
}

function buildMermaidNodeLine(mermaidId, label, styleText) {
    const style = parseMxStyle(styleText);
    const shape = String(style.shape || "").toLowerCase();
    const actorKind = String(style.actor || "").toLowerCase();
    const isEllipse = style.ellipse === "1" || shape.includes("ellipse") || shape.includes("circle");
    const isDiamond = shape.includes("rhombus") || shape.includes("diamond");
    const isRounded = style.rounded === "1" || shape.includes("rounded");
    const isActor =
        shape.includes("actor") ||
        shape.includes("umlactor") ||
        actorKind === "1" ||
        actorKind === "true";

    if (isActor) {
        return `${mermaidId}[👤 ${label}]`;
    }

    if (isDiamond) {
        return `${mermaidId}{${label}}`;
    }
    if (isEllipse) {
        return `${mermaidId}((${label}))`;
    }
    if (isRounded) {
        return `${mermaidId}([${label}])`;
    }
    return `${mermaidId}[${label}]`;
}

function buildMermaidNodeStyleLine(mermaidId, styleText) {
    const style = parseMxStyle(styleText);
    const fill = normalizeMermaidColor(style.fillColor);
    const stroke = normalizeMermaidColor(style.strokeColor);
    const color = normalizeMermaidColor(style.fontColor);
    const attributes = [];
    if (fill) {
        attributes.push(`fill:${fill}`);
    }
    if (stroke) {
        attributes.push(`stroke:${stroke}`);
    }
    if (color) {
        attributes.push(`color:${color}`);
    }
    if (!attributes.length) {
        return "";
    }
    return `style ${mermaidId} ${attributes.join(",")}`;
}

function parseDrawioToMermaid(xml) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xml || "", "text/xml");
    if (xmlDoc.querySelector("parsererror")) {
        throw new Error("XML inválido");
    }
    const graphModel = xmlDoc.querySelector("mxGraphModel");
    if (!graphModel) {
        throw new Error("No se encontró mxGraphModel (posible XML comprimido)");
    }

    const cells = [...graphModel.querySelectorAll("root > mxCell")];
    const allVertices = cells.filter((cell) => cell.getAttribute("vertex") === "1");
    const edges = cells.filter((cell) => cell.getAttribute("edge") === "1");
    const edgeIds = new Set(edges.map((edge) => edge.getAttribute("id")).filter(Boolean));
    const edgeLabelVertexIds = new Set();
    const edgeLabels = new Map();

    for (const cell of allVertices) {
        const parentId = cell.getAttribute("parent");
        if (!parentId || !edgeIds.has(parentId)) {
            continue;
        }
        const style = parseMxStyle(cell.getAttribute("style") || "");
        const geometry = cell.querySelector("mxGeometry");
        const isRelative = geometry?.getAttribute("relative") === "1";
        const isEdgeLabel = style.edgeLabel === "1" || isRelative;
        if (!isEdgeLabel) {
            continue;
        }
        const label = toMermaidLabel(cell.getAttribute("value"), "");
        if (label) {
            edgeLabels.set(parentId, label);
        }
        const cellId = cell.getAttribute("id");
        if (cellId) {
            edgeLabelVertexIds.add(cellId);
        }
    }

    const vertices = allVertices.filter((cell) => !edgeLabelVertexIds.has(cell.getAttribute("id")));
    if (!vertices.length) {
        throw new Error("No se encontraron nodos para convertir");
    }

    const nodeMap = new Map();
    const direction = detectFlowDirection(vertices);
    const lines = [`flowchart ${direction}`];
    const styleLines = [];

    vertices.forEach((cell, index) => {
        const sourceId = cell.getAttribute("id") || `n${index + 1}`;
        const mermaidId = toMermaidSafeId(sourceId, index);
        const label = toMermaidLabel(cell.getAttribute("value"), mermaidId);
        const styleText = cell.getAttribute("style") || "";
        nodeMap.set(sourceId, mermaidId);
        lines.push(`    ${buildMermaidNodeLine(mermaidId, label, styleText)};`);
        const nodeStyleLine = buildMermaidNodeStyleLine(mermaidId, styleText);
        if (nodeStyleLine) {
            styleLines.push(`    ${nodeStyleLine}`);
        }
    });

    edges.forEach((edge) => {
        const edgeId = edge.getAttribute("id") || "";
        const source = edge.getAttribute("source");
        const target = edge.getAttribute("target");
        if (!source || !target || !nodeMap.has(source) || !nodeMap.has(target)) {
            return;
        }
        const edgeLabel =
            toMermaidLabel(edge.getAttribute("value"), "") || edgeLabels.get(edgeId) || "";
        const relation = edgeLabel ? ` -- ${edgeLabel} --> ` : " --> ";
        lines.push(`    ${nodeMap.get(source)}${relation}${nodeMap.get(target)};`);
    });

    lines.push(...styleLines.map((line) => `${line};`));

    return {
        mermaid: lines.join("\n"),
        nodeCount: vertices.length,
        edgeCount: edges.length,
    };
}

function toBase64Url(value) {
    return btoa(unescape(encodeURIComponent(value)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}

function buildMermaidLiveUrl(mermaidCode) {
    const state = {
        code: mermaidCode,
        mermaid: JSON.stringify({ theme: "default" }),
        updateDiagram: true,
    };
    const encoded = toBase64Url(JSON.stringify(state));
    return `https://mermaid.live/edit#base64:${encoded}`;
}

export class DiagramsPlugin extends Plugin {
    static id = "diagrams";
    static dependencies = ["history", "selection", "dom"];

    resources = {
        user_commands: [
            {
                id: "insertDiagram",
                title: _t("Diagrams"),
                description: _t("Insert a draw.io diagram"),
                icon: "fa-sitemap",
                run: () => this.insertDiagram(),
                isAvailable: isHtmlContentSupported,
            },
            {
                id: "editDiagram",
                title: _t("Edit diagram"),
                description: _t("Edit selected draw.io diagram"),
                icon: "fa-pencil",
                run: () => this.editSelectedDiagram(),
                isAvailable: isHtmlContentSupported,
            },
            {
                id: "openMermaidLive",
                title: _t("Open in Mermaid Live"),
                description: _t("Convert selected diagram and open it in Mermaid Live"),
                icon: "fa-code",
                run: () => this.openSelectedDiagramInMermaidLive(),
                isAvailable: isHtmlContentSupported,
            },
        ],
        powerbox_categories: withSequence(55, { id: "diagrams", name: _t("Diagrams") }),
        powerbox_items: [
            {
                categoryId: "diagrams",
                commandId: "insertDiagram",
                keywords: ["/diagrams", "diagram", "diagrams", "drawio", "draw.io"],
            },
        ],
        power_buttons: withSequence(15, {
            commandId: "insertDiagram",
            description: _t("Insert a diagram"),
            icon: "fa-sitemap",
        }),
        toolbar_items: [
            {
                id: "diagram_edit",
                groupId: "layout",
                namespaces: ["compact", "expanded"],
                commandId: "editDiagram",
                isAvailable: () => this.hasTargetedDiagram(),
            },
            {
                id: "diagram_edit_image",
                groupId: "image_modifiers",
                namespaces: ["image"],
                commandId: "editDiagram",
                isAvailable: () => this.hasTargetedDiagram(),
            },
            {
                id: "diagram_mermaid",
                groupId: "layout",
                namespaces: ["compact", "expanded"],
                commandId: "openMermaidLive",
                isAvailable: () => this.hasTargetedDiagram(),
            },
            {
                id: "diagram_mermaid_image",
                groupId: "image_modifiers",
                namespaces: ["image"],
                commandId: "openMermaidLive",
                isAvailable: () => this.hasTargetedDiagram(),
            },
        ],
        collapsed_selection_toolbar_predicate: (selectionData) =>
            this.hasTargetedDiagram() || hasDiagram(selectionData?.editableSelection),
        move_node_blacklist_selectors: `${DIAGRAM_SELECTOR} *`,
        move_node_whitelist_selectors: DIAGRAM_SELECTOR,
        post_mount_component_handlers: () => this.hydrateAllPreviews(),
        selectionchange_handlers: () => this.hydrateAllPreviews(),
        clean_for_save_handlers: ({ root }) => {
            this.normalizeDiagramStructure(root);
            for (const diagram of root.querySelectorAll(`${DIAGRAM_SELECTOR}.o_selected_diagram`)) {
                diagram.classList.remove("o_selected_diagram");
            }
        },
    };

    setup() {
        this.hydrateAllPreviews();
        this.removeLegacyDiagramCaptions();
        this.normalizeDiagramStructure(this.editable);
        this.addDomListener(this.editable, "input", () => this.hydrateAllPreviews());
    }

    insertDiagram() {
        this.openDrawioDialog({
            onSave: (data) => {
                const element = this.buildDiagramElement(data);
                this.dependencies.dom.insert(element);
                this.dependencies.history.addStep();
            },
        });
    }

    editSelectedDiagram() {
        const diagram = this.getTargetedDiagram();
        if (!diagram) {
            return;
        }
        this.openDrawioDialog({
            xml: this.getDiagramXml(diagram),
            onSave: (data) => {
                this.updateDiagramElement(diagram, data);
                this.dependencies.history.addStep();
            },
        });
    }

    async openSelectedDiagramInMermaidLive() {
        const diagram = this.getTargetedDiagram();
        if (!diagram) {
            this.services.notification.add(_t("Selecciona un diagrama primero."), {
                type: "warning",
            });
            return;
        }
        const xml = this.getDiagramXml(diagram);
        if (!xml) {
            this.services.notification.add(_t("El diagrama no tiene XML para convertir."), {
                type: "warning",
            });
            return;
        }
        try {
            const { mermaid, nodeCount, edgeCount } = parseDrawioToMermaid(xml);
            await browser.navigator.clipboard.writeText(mermaid);
            const liveUrl = buildMermaidLiveUrl(mermaid);
            browser.open(liveUrl, "_blank");
            this.services.notification.add(
                _t(
                    "Código Mermaid copiado y abierto en mermaid.live. Nodos: %s, Conexiones: %s",
                    nodeCount,
                    edgeCount
                ),
                { type: "success" }
            );
        } catch {
            this.services.notification.add(
                _t("No se pudo convertir automáticamente este diagrama a Mermaid."),
                { type: "danger" }
            );
        }
    }

    openDrawioDialog({ xml, onSave }) {
        this.services.dialog.add(DrawioDialog, {
            xml,
            onSave,
        });
    }

    hasTargetedDiagram() {
        return Boolean(this.getTargetedDiagram());
    }

    getTargetedDiagram() {
        const targetedNodes = this.dependencies.selection.getTargetedNodes();
        for (const node of targetedNodes) {
            const diagram = findDiagramFromNode(node);
            if (diagram) {
                return diagram;
            }
        }
        const selection = this.dependencies.selection.getEditableSelection();
        return findDiagramFromNode(selection?.anchorNode);
    }

    getDiagramXml(diagramElement) {
        const xmlFromElement = fromDataValue(diagramElement.dataset.diagramXml || "");
        if (xmlFromElement) {
            return xmlFromElement;
        }
        const image = getPreviewImage(diagramElement);
        return fromDataValue(image?.dataset?.diagramXml || "");
    }

    updateDiagramElement(diagramElement, { xml, preview }) {
        diagramElement.dataset.diagramXml = toDataValue(xml);
        diagramElement.dataset.diagramPreview = toDataValue(preview);
        diagramElement.dataset.diagramSvg = toDataValue(preview);
        const image = getPreviewImage(diagramElement);
        if (image) {
            image.dataset.diagramXml = toDataValue(xml);
            image.dataset.diagramPreview = toDataValue(preview);
        }
        this.hydrateDiagramPreview(diagramElement);
    }

    buildDiagramElement({ xml, preview }) {
        const diagramBlock = this.document.createElement("div");
        diagramBlock.className = "o_diagrams_block my-2";
        diagramBlock.dataset.diagramProvider = "drawio";
        diagramBlock.dataset.diagramXml = toDataValue(xml);
        diagramBlock.dataset.diagramPreview = toDataValue(preview);
        diagramBlock.dataset.diagramSvg = toDataValue(preview);

        const image = this.document.createElement("img");
        image.className = "o_diagrams_preview img-fluid rounded border o_editable_media";
        image.alt = _t("Diagram");
        image.dataset.diagramXml = toDataValue(xml);
        image.dataset.diagramPreview = toDataValue(preview);
        image.src = toPreviewSrc(preview);

        diagramBlock.appendChild(image);
        this.hydrateDiagramPreview(diagramBlock);
        return diagramBlock;
    }

    hydrateAllPreviews() {
        const diagrams = this.editable.querySelectorAll(DIAGRAM_SELECTOR);
        for (const diagram of diagrams) {
            this.hydrateDiagramPreview(diagram);
        }
    }

    hydrateDiagramPreview(diagramElement) {
        const image = getPreviewImage(diagramElement);
        if (!image) {
            return;
        }
        const previewData = fromDataValue(
            diagramElement.dataset.diagramPreview || diagramElement.dataset.diagramSvg || ""
        ) || fromDataValue(image.dataset?.diagramPreview || "");
        const src = toPreviewSrc(previewData);
        if (src && image.getAttribute("src") !== src) {
            image.setAttribute("src", src);
        }
    }

    removeLegacyDiagramCaptions() {
        for (const caption of this.editable.querySelectorAll("figcaption.o_diagrams_caption")) {
            caption.remove();
        }
    }

    normalizeDiagramStructure(root) {
        for (const diagram of root.querySelectorAll(DIAGRAM_SELECTOR)) {
            const image = diagram.querySelector("img.o_diagrams_preview, img");
            const figure = diagram.querySelector("figure");
            if (image && image.parentElement !== diagram) {
                diagram.appendChild(image);
            }
            if (figure) {
                figure.remove();
            }
            for (const caption of diagram.querySelectorAll("figcaption")) {
                caption.remove();
            }
            diagram.classList.remove("o-contenteditable-false", "o_selected_diagram");
            diagram.removeAttribute("contenteditable");
        }
    }

}
