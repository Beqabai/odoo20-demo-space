import { MAIN_PLUGINS } from "@html_editor/plugin_sets";
import { DiagramsPlugin } from "./diagram_plugin";

if (!MAIN_PLUGINS.some((PluginClass) => PluginClass.id === DiagramsPlugin.id)) {
    MAIN_PLUGINS.push(DiagramsPlugin);
}
