/** Part of bpmn_process_management. License LGPL-3.
 *
 * Field widget "bpmn_editor" for Text fields holding BPMN 2.0 XML.
 *
 * Deliberately minimal and version neutral: no static props, no useState,
 * no t-ref (Owl 3 in Odoo 20 removed/changed them). Everything else lives
 * in the framework-independent BpmnApp.
 */
import * as owl from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { useBus, useService } from "@web/core/utils/hooks";
import { useRecordObserver } from "@web/model/relational_model/utils";
import { BpmnApp } from "./bpmn_app";

function rootElement(component) {
    const node = component.__owl__;
    const bdom = node && node.bdom;
    if (!bdom) {
        return null;
    }
    if (bdom.el) {
        return bdom.el;
    }
    return typeof bdom.firstNode === "function" ? bdom.firstNode() : null;
}

export class BpmnEditorField extends owl.Component {
    static template = owl.xml`<div class="o_field_bpmn_editor_host w-100"/>`;

    setup() {
        const node = this.__owl__;
        const getProps = () => node.props;
        const services = {
            orm: useService("orm"),
            action: useService("action"),
            notification: useService("notification"),
        };
        this.app = null;
        let pending = null;
        let focusElement = null;
        const snapshot = (record) => {
            const props = getProps();
            const data = record.data;
            const context = record.context || {};
            // the element to focus (from the review queue) is used for the first import only
            let focus = false;
            if (focusElement === null) {
                focusElement = context.bpmn_focus_element || false;
                focus = focusElement;
            }
            return {
                value: data[props.name] || "",
                state: data.state,
                isManager: !!data.is_manager,
                editable: !!data.is_manager && data.state === "draft",
                resId: record.resId,
                name: data.name,
                hasPreview: !!data.diagram_preview,
                dirty: !!record.dirty,
                focusElement: focus,
            };
        };
        useRecordObserver((record) => {
            const snap = snapshot(record);
            if (this.app) {
                this.app.update(snap);
            } else {
                pending = snap;
            }
        });
        owl.onMounted(() => {
            const el = rootElement(this);
            this.app = new BpmnApp(el, services, (values) => getProps().record.update(values), {
                save: () => getProps().record.save(),
            });
            this.app.start(pending).catch((e) => console.error(e));
        });
        owl.onWillUnmount(() => {
            if (this.app) {
                this.app.flush();
                this.app.destroy();
            }
        });
        const model = getProps().record.model;
        useBus(model.bus, "WILL_SAVE_URGENTLY", () => this.app && this.app.flush());
        useBus(model.bus, "NEED_LOCAL_CHANGES", ({ detail }) => {
            if (this.app) {
                detail.proms.push(this.app.flush());
            }
        });
    }
}

export const bpmnEditorField = {
    component: BpmnEditorField,
    displayName: _t("BPMN Diagram"),
    supportedTypes: ["text"],
    fieldDependencies: [
        { name: "state", type: "selection" },
        { name: "is_manager", type: "boolean" },
        { name: "diagram_preview", type: "binary" },
        { name: "name", type: "char" },
    ],
    extractProps: () => ({}),
};

registry.category("fields").add("bpmn_editor", bpmnEditorField);
