// Extra palette entries so the frequently used BPMN 2.0 shapes are one click away
// (bpmn-js shows only generic shapes; the rest is reachable through "Change element").
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
    'odoo.catch-message': entry('event', 'bpmn-icon-intermediate-event-catch-message', 'Create message intermediate catch event',
      { type: 'bpmn:IntermediateCatchEvent', eventDefinitionType: 'bpmn:MessageEventDefinition' }),
    'odoo.catch-timer': entry('event', 'bpmn-icon-intermediate-event-catch-timer', 'Create timer intermediate catch event',
      { type: 'bpmn:IntermediateCatchEvent', eventDefinitionType: 'bpmn:TimerEventDefinition' }),
    'odoo.end-message': entry('event', 'bpmn-icon-end-event-message', 'Create message end event',
      { type: 'bpmn:EndEvent', eventDefinitionType: 'bpmn:MessageEventDefinition' }),
    'odoo.end-error': entry('event', 'bpmn-icon-end-event-error', 'Create error end event',
      { type: 'bpmn:EndEvent', eventDefinitionType: 'bpmn:ErrorEventDefinition' }),
    'odoo.end-terminate': entry('event', 'bpmn-icon-end-event-terminate', 'Create terminate end event',
      { type: 'bpmn:EndEvent', eventDefinitionType: 'bpmn:TerminateEventDefinition' }),
    'odoo.gateway-parallel': entry('gateway', 'bpmn-icon-gateway-parallel', 'Create parallel gateway',
      { type: 'bpmn:ParallelGateway' }),
    'odoo.gateway-inclusive': entry('gateway', 'bpmn-icon-gateway-or', 'Create inclusive gateway',
      { type: 'bpmn:InclusiveGateway' }),
    'odoo.gateway-event': entry('gateway', 'bpmn-icon-gateway-eventbased', 'Create event-based gateway',
      { type: 'bpmn:EventBasedGateway' }),
    'odoo.user-task': entry('activity', 'bpmn-icon-user-task', 'Create user task', { type: 'bpmn:UserTask' }),
    'odoo.manual-task': entry('activity', 'bpmn-icon-manual-task', 'Create manual task', { type: 'bpmn:ManualTask' }),
    'odoo.service-task': entry('activity', 'bpmn-icon-service-task', 'Create service task', { type: 'bpmn:ServiceTask' }),
    'odoo.send-task': entry('activity', 'bpmn-icon-send-task', 'Create send task', { type: 'bpmn:SendTask' }),
    'odoo.receive-task': entry('activity', 'bpmn-icon-receive-task', 'Create receive task', { type: 'bpmn:ReceiveTask' }),
    'odoo.business-rule-task': entry('activity', 'bpmn-icon-business-rule-task', 'Create business rule task',
      { type: 'bpmn:BusinessRuleTask' }),
    'odoo.call-activity': entry('activity', 'bpmn-icon-call-activity', 'Create call activity', { type: 'bpmn:CallActivity' }),
    'odoo.subprocess-collapsed': entry('activity', 'bpmn-icon-subprocess-collapsed', 'Create collapsed sub-process',
      { type: 'bpmn:SubProcess', isExpanded: false }),
    'odoo.text-annotation': entry('data-store', 'bpmn-icon-text-annotation', 'Create text annotation',
      { type: 'bpmn:TextAnnotation' }),
  };
};

export default {
  __init__: ['odooPaletteProvider'],
  odooPaletteProvider: ['type', OdooPaletteProvider],
};
