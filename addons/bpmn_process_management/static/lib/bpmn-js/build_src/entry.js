import Modeler from 'bpmn-js/lib/Modeler';
import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer';
import { layoutProcess } from 'bpmn-auto-layout';
import odooModdle from './odoo_moddle.json';
import odooPaletteModule from './odoo_palette.js';

window.OdooBpmn = {
  Modeler,
  NavigatedViewer,
  layoutProcess,
  odooModdle,
  odooPaletteModule,
  version: '18.30.0',
};
