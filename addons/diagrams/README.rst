Diagrams
========

Diagrams integrates draw.io directly into Odoo HTML fields.

Features
--------

- Insert a new diagram using ``/diagrams`` in the HTML editor.
- Open draw.io embedded inside Odoo (dialog/iframe).
- Edit existing diagrams from the contextual toolbar or double click.
- Save diagram content directly inside the HTML field body.
- Stores both draw.io XML and SVG preview in the same HTML block.

Usage
-----

1. Install the module ``diagrams``.
2. Open any form with an editable HTML field.
3. Type ``/diagrams`` and choose **Diagrams**.
4. Create the diagram and save.
5. Select the diagram block later and click **Edit diagram** to modify it.

Technical notes
---------------

- draw.io is loaded from ``https://embed.diagrams.net``.
- No additional server-side parameterization is required.
- The module is designed for Odoo 19 and built with compatibility in mind for Odoo 18/17 editor patterns.

License
-------

LGPL-3
