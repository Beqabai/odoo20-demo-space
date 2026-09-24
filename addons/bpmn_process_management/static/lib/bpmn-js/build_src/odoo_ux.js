// Part of bpmn_process_management. License LGPL-3.
// Drawing comfort add-ons for the bpmn-js modeler.

// ---------------------------------------------------------------------------
// 1. While drawing or re-attaching a connection, highlight every shape the
//    connection may legally end on (BPMN rules decide: sequence flow, message
//    flow, association, data association...).
// ---------------------------------------------------------------------------
function ConnectHighlighter(eventBus, elementRegistry, canvas, bpmnRules) {
  var marked = [];
  var MARK = 'o-connect-candidate';
  var SOURCE = 'o-connect-source';

  function clear() {
    marked.forEach(function(el) {
      canvas.removeMarker(el, MARK);
      canvas.removeMarker(el, SOURCE);
    });
    marked = [];
  }

  function isShape(el) {
    return el && !el.waypoints && !el.labelTarget && el.type !== 'label' && el.parent &&
      el.type !== 'bpmn:Process' && el.type !== 'bpmn:Collaboration';
  }

  function mark(source, test) {
    clear();
    if (source) {
      canvas.addMarker(source, SOURCE);
      marked.push(source);
    }
    elementRegistry.forEach(function(el) {
      if (!isShape(el) || el === source) {
        return;
      }
      var ok = false;
      try {
        ok = test(el);
      } catch (e) {
        ok = false;
      }
      if (ok) {
        canvas.addMarker(el, MARK);
        marked.push(el);
      }
    });
  }

  eventBus.on('connect.start', function(event) {
    var context = event.context || {};
    var source = context.start || context.source;
    if (!source) {
      return;
    }
    mark(source, function(target) {
      return !!bpmnRules.canConnect(source, target);
    });
  });
  eventBus.on('connect.cleanup', clear);

  eventBus.on('bendpoint.move.start', function(event) {
    var context = event.context || {};
    var connection = context.connection;
    // diagram-js 15: 'reconnectStart' | 'reconnectEnd' | 'updateWaypoints'
    if (!connection || (context.type !== 'reconnectStart' && context.type !== 'reconnectEnd')) {
      return;
    }
    var moveStart = context.type === 'reconnectStart';
    mark(null, function(target) {
      return moveStart
        ? !!bpmnRules.canConnect(target, connection.target, connection)
        : !!bpmnRules.canConnect(connection.source, target, connection);
    });
  });
  eventBus.on(['bendpoint.move.cleanup', 'bendpoint.move.end', 'bendpoint.move.cancel'], clear);

  // when creating a shape, show the containers it can be dropped into
  eventBus.on('create.start', function(event) {
    var shape = event.context && event.context.shape;
    if (!shape || shape.waypoints) {
      return;
    }
    var containers = ['bpmn:Participant', 'bpmn:Lane', 'bpmn:SubProcess', 'bpmn:Transaction',
      'bpmn:AdHocSubProcess'];
    mark(null, function(target) {
      return containers.indexOf(target.type) !== -1 && !!bpmnRules.canCreate(shape, target);
    });
  });
  eventBus.on(['create.cleanup'], clear);
}
ConnectHighlighter.$inject = ['eventBus', 'elementRegistry', 'canvas', 'bpmnRules'];

// ---------------------------------------------------------------------------
// 2. Curated extra palette entries: the shapes process owners use daily are
//    one click away. Everything else: "Create element" (N) with search.
// ---------------------------------------------------------------------------
function OdooPaletteProvider(palette, create, elementFactory, translate) {
  this._create = create;
  this._elementFactory = elementFactory;
  this._translate = translate;
  palette.registerProvider(500, this);
}
OdooPaletteProvider.$inject = ['palette', 'create', 'elementFactory', 'translate'];

OdooPaletteProvider.prototype.getPaletteEntries = function() {
  var create = this._create, elementFactory = this._elementFactory, translate = this._translate;
  function entry(group, className, title, attrs) {
    function start(event) {
      create.start(event, elementFactory.createShape(Object.assign({}, attrs)));
    }
    return { group: group, className: className, title: translate(title),
      action: { dragstart: start, click: start } };
  }
  return {
    'odoo.start-message': entry('event', 'bpmn-icon-start-event-message', 'Create message start event',
      { type: 'bpmn:StartEvent', eventDefinitionType: 'bpmn:MessageEventDefinition' }),
    'odoo.start-timer': entry('event', 'bpmn-icon-start-event-timer', 'Create timer start event',
      { type: 'bpmn:StartEvent', eventDefinitionType: 'bpmn:TimerEventDefinition' }),
    'odoo.gateway-parallel': entry('gateway', 'bpmn-icon-gateway-parallel', 'Create parallel gateway',
      { type: 'bpmn:ParallelGateway' }),
    'odoo.user-task': entry('activity', 'bpmn-icon-user-task', 'Create user task', { type: 'bpmn:UserTask' }),
    'odoo.service-task': entry('activity', 'bpmn-icon-service-task', 'Create service task', { type: 'bpmn:ServiceTask' }),
    'odoo.call-activity': entry('activity', 'bpmn-icon-call-activity', 'Create call activity', { type: 'bpmn:CallActivity' }),
    'odoo.text-annotation': entry('data-store', 'bpmn-icon-text-annotation', 'Create text annotation',
      { type: 'bpmn:TextAnnotation' }),
  };
};

// ---------------------------------------------------------------------------
// 3. Extra keyboard shortcuts (the canvas must have the focus, like all
//    bpmn-js shortcuts). The web client provides the callbacks.
// ---------------------------------------------------------------------------
function OdooKeyboardBindings(keyboard, eventBus) {
  keyboard.addListener(900, function(context) {
    var e = context.keyEvent;
    var cmd = keyboard.isCmd(e);
    var key = (e.key || '').toLowerCase();
    if (cmd && key === 's') {
      eventBus.fire('odoo.save');
      return true;
    }
    if (!cmd && !e.altKey && (e.key === '?' || (e.shiftKey && key === '/'))) {
      eventBus.fire('odoo.shortcuts');
      return true;
    }
    if (!cmd && !e.altKey && !e.shiftKey && key === 'f') {
      eventBus.fire('odoo.fullscreen');
      return true;
    }
    if (!cmd && !e.altKey && !e.shiftKey && key === 'm') {
      eventBus.fire('odoo.minimap');
      return true;
    }
    if (!cmd && !e.altKey && !e.shiftKey && key === 'g') {
      eventBus.fire('odoo.grid');
      return true;
    }
    if (!cmd && !e.altKey && !e.shiftKey && key === '0') {
      eventBus.fire('odoo.fit');
      return true;
    }
    if (!cmd && !e.altKey && !e.shiftKey && key === 'p') {
      eventBus.fire('odoo.panel');
      return true;
    }
  });
}
OdooKeyboardBindings.$inject = ['keyboard', 'eventBus'];

// ---------------------------------------------------------------------------
// 4. External labels (events, gateways, data): bpmn-js sizes the label box to
//    the rounded text width, so a long word can be split letter by letter
//    ("Inspectio" / "n"). Give the box a few pixels of slack.
// ---------------------------------------------------------------------------
function LabelBoundsFix(textRenderer) {
  var original = textRenderer.getExternalLabelBounds.bind(textRenderer);
  textRenderer.getExternalLabelBounds = function(bounds, text) {
    var r = original(bounds, text);
    if (!r || !text) {
      return r;
    }
    return { x: Math.round(r.x - 3), y: r.y, width: Math.ceil(r.width) + 6, height: r.height };
  };
}
LabelBoundsFix.$inject = ['textRenderer'];

export var OdooModelerUxModule = {
  __init__: ['odooLabelBoundsFix', 'odooConnectHighlighter', 'odooPaletteProvider', 'odooKeyboardBindings'],
  odooLabelBoundsFix: ['type', LabelBoundsFix],
  odooConnectHighlighter: ['type', ConnectHighlighter],
  odooPaletteProvider: ['type', OdooPaletteProvider],
  odooKeyboardBindings: ['type', OdooKeyboardBindings],
};

export var OdooViewerUxModule = {
  __init__: ['odooLabelBoundsFix', 'odooKeyboardBindings'],
  odooLabelBoundsFix: ['type', LabelBoundsFix],
  odooKeyboardBindings: ['type', OdooKeyboardBindings],
};
