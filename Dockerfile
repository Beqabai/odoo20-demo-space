FROM odoobot/odoo:20.0

USER root

# ვქმნით საქაღალდეს და შიგ გადაგვაქვს თქვენი მოდულები
RUN mkdir -p /mnt/extra-addons
COPY ./addons /mnt/extra-addons

# ვანიჭებთ Odoo მომხმარებელს ფაილებზე წვდომის უფლებას
RUN chown -R odoo:odoo /mnt/extra-addons

USER odoo

# Render-ს პირდაპირ ვეუბნებით, რომ Python-ით ჩართოს Odoo-ს მთავარი გამშვები ფაილი
CMD ["python3", "/usr/bin/odoo", "--http-port=10000", "--addons-path=/usr/lib/python3/dist-packages/odoo/addons,/mnt/extra-addons"]
