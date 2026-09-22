{
    "name": "Diagrams Editor",
    "summary": "Integrate draw.io diagrams directly in HTML fields",
    "description": """
Insert and edit draw.io diagrams directly from Odoo HTML widgets.
Type /diagrams in the editor to open the embedded draw.io interface.
The diagram is stored in the HTML content itself (XML + SVG preview).
    """,
    "version": "19.0.1.0.0",
    "category": "Productivity",
    "author": "Dainier Escalona",
    "maintainer": "Dainier Escalona",
    "website": "https://debcoder.com",
    'sequence': 450,
    "license": "LGPL-3",
    "depends": ["base", "html_editor"],
    "data": [],
    "assets": {
        "web.assets_backend": [
            "diagrams/static/src/js/drawio_dialog.js",
            "diagrams/static/src/js/diagram_plugin.js",
            "diagrams/static/src/js/diagram_bootstrap.js",
            "diagrams/static/src/xml/drawio_dialog.xml",
            "diagrams/static/src/scss/diagram.scss"
        ],
        "html_editor.assets_editor": [
            "diagrams/static/src/js/drawio_dialog.js",
            "diagrams/static/src/js/diagram_plugin.js",
            "diagrams/static/src/js/diagram_bootstrap.js",
            "diagrams/static/src/xml/drawio_dialog.xml",
            "diagrams/static/src/scss/diagram.scss"
        ]
    },
    "installable": True,
    "application": False,
    "auto_install": False,
    'support': 'odoodeb@gmail.com',
    'price': 0,
    'currency': 'USD',
    'images': [
        'static/description/thumbnail.svg',
        'static/description/screenshot_1.svg',
        'static/description/screenshot_2.svg',
        'static/description/flow.gif',
        'static/src/img/main_screenshot.png', 
        'static/src/img/thumbnail.png'
    ],
}
