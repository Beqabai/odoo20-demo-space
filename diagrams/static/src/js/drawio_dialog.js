import { Dialog } from "@web/core/dialog/dialog";
import { _t } from "@web/core/l10n/translation";
import { Component, onMounted, onWillUnmount, useRef, useState } from "@odoo/owl";

const DRAWIO_ORIGINS = new Set(["https://embed.diagrams.net", "https://app.diagrams.net"]);
const DRAWIO_URL =
    "https://embed.diagrams.net/?embed=1&proto=json&spin=1&saveAndExit=1&noSaveBtn=1&compressed=0";

const EMPTY_XML =
    '<mxfile host="app.diagrams.net"><diagram id="diagram-1" name="Page-1"><mxGraphModel dx="1240" dy="720" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="827" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>';

export class DrawioDialog extends Component {
    static template = "diagrams.DrawioDialog";
    static components = { Dialog };
    static props = {
        close: Function,
        xml: { type: String, optional: true },
        onSave: Function,
        title: { type: String, optional: true },
    };

    setup() {
        this.iframeRef = useRef("iframe");
        this.state = useState({
            isReady: false,
            isSaving: false,
        });
        this.pendingXml = this.props.xml || EMPTY_XML;
        this.title = this.props.title || _t("Draw.io Diagram");

        this.onMessage = this.onMessage.bind(this);
        onMounted(() => window.addEventListener("message", this.onMessage));
        onWillUnmount(() => window.removeEventListener("message", this.onMessage));
    }

    get iframeSrc() {
        return DRAWIO_URL;
    }

    postToDrawio(payload) {
        const iframeWindow = this.iframeRef.el?.contentWindow;
        if (!iframeWindow) {
            return;
        }
        iframeWindow.postMessage(JSON.stringify(payload), "*");
    }

    onMessage(ev) {
        if (!DRAWIO_ORIGINS.has(ev.origin)) {
            return;
        }
        let payload = ev.data;
        if (typeof payload === "string") {
            try {
                payload = JSON.parse(payload);
            } catch {
                return;
            }
        }
        if (!payload?.event) {
            return;
        }

        if (payload.event === "init") {
            this.state.isReady = true;
            this.postToDrawio({
                action: "load",
                autosave: 0,
                xml: this.pendingXml,
            });
            return;
        }

        if (payload.event === "autosave") {
            this.pendingXml = payload.xml || this.pendingXml || EMPTY_XML;
            return;
        }

        if (payload.event === "save") {
            this.pendingXml = payload.xml || this.pendingXml || EMPTY_XML;
            this.state.isSaving = true;
            this.postToDrawio({
                action: "export",
                format: "png",
                xml: this.pendingXml,
                spin: _t("Saving"),
                transparent: false,
                background: "#ffffff",
                selection: false,
                border: 0,
                scale: 1,
            });
            return;
        }

        if (payload.event === "export") {
            this.state.isSaving = false;
            this.props.onSave({
                xml: this.pendingXml,
                preview: payload.data || "",
            });
            this.props.close();
            return;
        }

        if (payload.event === "exit") {
            this.props.close();
        }
    }

    onSaveClick() {
        if (!this.state.isReady) {
            return;
        }
        this.postToDrawio({ action: "save" });
    }
}
